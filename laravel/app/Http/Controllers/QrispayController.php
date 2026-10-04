<?php

namespace App\Http\Controllers;

use App\Models\QrispayPayment;
use App\Services\QrispayService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class QrispayController extends Controller
{
    protected QrispayService $service;

    public function __construct(QrispayService $service)
    {
        $this->service = $service;
    }

    /**
     * Contoh alur pembuatan order dan redirect ke checkout QRIS
     */
    public function checkout(Request $request)
    {
        $validated = $request->validate([
            'order_id' => 'required|string',
            'amount' => 'required|integer|min:1000',
            'description' => 'nullable|string',
            'customer_name' => 'nullable|string',
        ]);

        try {
            $payment = $this->service->createPayment($validated);
            return redirect($payment->payment_link);
        } catch (\Throwable $e) {
            Log::error('Qrispay Checkout Error: ' . $e->getMessage());
            return back()->with('error', 'Gagal membuat QRIS: ' . $e->getMessage());
        }
    }

    /**
     * Endpoint Webhook penerima sinyal lunas dari Qrispay Gateway
     * CATATAN: Pastikan route ini dikecualikan dari proteksi CSRF di bootstrap/app.php atau VerifyCsrfToken.php
     */
    public function webhook(Request $request)
    {
        $signature = (string)$request->header('X-Signature');
        $rawPayload = $request->getContent();

        // 1. Verifikasi keamanan: Midtrans SHA-512 atau HMAC-SHA256
        $midSig = (string)$request->header('X-Midtrans-Signature') ?: (string)$request->input('signature_key');
        if (!empty($midSig)) {
            $orderId = (string)$request->input('order_id');
            $statusCode = (string)($request->input('status_code') ?? '200');
            $grossAmount = (string)$request->input('gross_amount');
            if (!$this->service->verifyMidtransSignature($orderId, $statusCode, $grossAmount, $midSig)) {
                Log::warning('Qrispay Webhook: Invalid Midtrans SHA-512 signature detected');
                return response()->json(['status_code' => '401', 'status_message' => 'Invalid Midtrans signature'], 401);
            }
        } elseif (!$this->service->verifyWebhook($rawPayload, $signature)) {
            Log::warning('Qrispay Webhook: Invalid HMAC signature detected');
            return response()->json(['error' => 'Invalid signature'], 401);
        }

        $payload = json_decode($rawPayload, true) ?: [];
        $event = $payload['event'] ?? '';
        $data = $payload['data'] ?? [];

        if ($event === 'payment.paid' || ($payload['transaction_status'] ?? '') === 'settlement') {
            $qrisId = $data['id'] ?? $payload['transaction_id'] ?? null;
            $orderId = $data['order_id'] ?? $payload['order_id'] ?? null;

            // 2. Update status order di database MySQL Laravel
            $record = QrispayPayment::where('qris_id', $qrisId)->orWhere('order_id', $orderId)->first();
            if ($record) {
                $record->status = 'paid';
                $record->paid_at = now();
                $record->save();

                Log::info("Qrispay Webhook: Order {$orderId} berhasil lunas (Total: Rp {$record->total})");
            }
        }

        return response()->json(['status_code' => '200', 'status_message' => 'OK']);
    }

    /**
     * Midtrans Core API endpoint: POST /api/qrispay/charge
     */
    public function charge(Request $request)
    {
        try {
            $res = $this->service->charge($request->all());
            return response()->json($res, 201);
        } catch (\Throwable $e) {
            return response()->json(['status_code' => '500', 'status_message' => $e->getMessage()], 500);
        }
    }

    /**
     * Snap Checkout API: POST /api/qrispay/snap/transactions
     */
    public function snap(Request $request)
    {
        try {
            $res = $this->service->createSnapTransaction($request->all());
            return response()->json($res, 201);
        } catch (\Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }
}
