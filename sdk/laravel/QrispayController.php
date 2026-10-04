<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Qrispay\QrispayClient;

class QrispayController extends Controller
{
    private QrispayClient $client;

    public function __construct()
    {
        $this->client = new QrispayClient(
            config('qrispay.base_url'),
            config('qrispay.api_key'),
            config('qrispay.webhook_secret')
        );
    }

    /**
     * Contoh alur pembuatan pesanan dan redirect ke halaman bayar QRIS
     */
    public function checkout(Request $request)
    {
        $validated = $request->validate([
            'order_id' => 'required|string',
            'amount' => 'required|integer|min:1000',
            'description' => 'nullable|string',
        ]);

        try {
            $payment = $this->client->createPayment([
                'amount' => $validated['amount'],
                'order_id' => $validated['order_id'],
                'description' => $validated['description'] ?? 'Pembelian di Toko',
                'callback_url' => config('qrispay.callback_url'),
            ]);

            // Redirect pembeli ke halaman checkout QRIS
            return redirect($payment['payment_link']);
        } catch (\Throwable $e) {
            Log::error('Qrispay Checkout Error: ' . $e->getMessage());
            return back()->with('error', 'Gagal membuat QRIS: ' . $e->getMessage());
        }
    }

    /**
     * Endpoint Webhook penerima sinyal lunas dari Qrispay Gateway
     */
    public function webhook(Request $request)
    {
        $signature = $request->header('X-Signature');
        $rawPayload = $request->getContent();

        // 1. Verifikasi keamanan signature HMAC
        if (!$signature || !$this->client->verifyWebhook($rawPayload, $signature)) {
            Log::warning('Qrispay Webhook: Invalid signature received');
            return response()->json(['error' => 'Invalid signature'], 401);
        }

        $payload = json_decode($rawPayload, true);
        $event = $payload['event'] ?? '';
        $data = $payload['data'] ?? [];

        if ($event === 'payment.paid') {
            $orderId = $data['order_id'];
            $total = $data['total'];
            $paymentId = $data['id'];

            Log::info("Qrispay Selesai: Order $orderId lunas sejumlah Rp $total (ID: $paymentId)");

            // Update status pesanan di database toko Anda
            // Contoh: Order::where('order_id', $orderId)->update(['status' => 'paid', 'paid_at' => now()]);
        }

        return response()->json(['success' => true]);
    }
}
