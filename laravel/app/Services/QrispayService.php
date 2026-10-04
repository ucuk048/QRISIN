<?php

namespace App\Services;

use App\Models\QrispayPayment;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

class QrispayService
{
    private string $baseUrl;
    private string $apiKey;
    private string $webhookSecret;

    public function __construct()
    {
        $this->baseUrl = rtrim(config('qrispay.base_url', 'http://localhost:3000'), '/');
        $this->apiKey = (string)config('qrispay.api_key', '');
        $this->webhookSecret = (string)config('qrispay.webhook_secret', '');
    }

    /**
     * Buat pembayaran QRIS baru dan simpan ke database MySQL aplikasi Anda.
     */
    public function createPayment(array $params): QrispayPayment
    {
        $amount = (int)($params['amount'] ?? 0);
        if ($amount < 1000) {
            throw new RuntimeException('Nominal pembayaran minimal Rp 1.000');
        }

        $orderId = (string)($params['order_id'] ?? 'ORD-' . strtoupper(bin2hex(random_bytes(4))));

        $payload = [
            'amount' => $amount,
            'order_id' => $orderId,
            'description' => $params['description'] ?? 'Pembayaran Tagihan',
            'callback_url' => $params['callback_url'] ?? config('qrispay.callback_url'),
            'customer' => $params['customer_name'] ?? null,
        ];

        $response = Http::withHeaders([
            'X-API-Key' => $this->apiKey,
            'Content-Type' => 'application/json',
            'Accept' => 'application/json',
        ])->timeout(15)->post("{$this->baseUrl}/api/v1/payments", $payload);

        if (!$response->successful()) {
            $err = $response->json('error') ?? $response->body();
            Log::error("Qrispay API Failure ({$response->status()}): {$err}");
            throw new RuntimeException("Gagal menghubungi gateway QRIS: {$err}");
        }

        $res = $response->json();
        $data = $res['data'] ?? $res;

        return QrispayPayment::create([
            'qris_id' => $data['id'] ?? $data['qris_id'] ?? $data['trx_id'],
            'order_id' => $orderId,
            'amount' => $amount,
            'unique_code' => $data['unique_code'] ?? 0,
            'total' => $data['total'] ?? $amount,
            'status' => 'pending',
            'qris_string' => $data['qris_string'] ?? $data['qris_code'] ?? '',
            'payment_link' => $data['payment_link'] ?? $data['qris_url'] ?? "{$this->baseUrl}/pay/{$data['id']}",
            'customer_name' => $params['customer_name'] ?? null,
            'description' => $params['description'] ?? null,
            'expires_at' => isset($data['expires_at']) ? new \DateTime($data['expires_at']) : now()->addMinutes(config('qrispay.expiry_minutes', 15)),
        ]);
    }

    /**
     * Cek status pembayaran ke gateway.
     */
    public function checkStatus(string $qrisId): array
    {
        $response = Http::withHeaders([
            'X-API-Key' => $this->apiKey,
            'Accept' => 'application/json',
        ])->timeout(10)->get("{$this->baseUrl}/api/v1/payments/{$qrisId}");

        if (!$response->successful()) {
            throw new RuntimeException("Gagal cek status payment: {$response->body()}");
        }

        $data = $response->json();
        $pData = $data['data'] ?? $data;

        // Sinkronisasi status ke MySQL
        $record = QrispayPayment::where('qris_id', $qrisId)->first();
        if ($record && isset($pData['status']) && $record->status !== $pData['status']) {
            $record->status = $pData['status'];
            if ($record->status === 'paid') {
                $record->paid_at = now();
            }
            $record->save();
        }

        return $pData;
    }

    /**
     * Midtrans Core API: POST /api/v1/charge (atau /v2/charge)
     */
    public function charge(array $params): array
    {
        $response = Http::withBasicAuth($this->apiKey, '')
            ->timeout(15)
            ->post("{$this->baseUrl}/api/v1/charge", $params);

        if (!$response->successful()) {
            throw new RuntimeException("Midtrans charge failed: " . ($response->json('status_message') ?? $response->body()));
        }

        return $response->json();
    }

    /**
     * Snap Checkout API: POST /api/v1/snap/transactions
     */
    public function createSnapTransaction(array $params): array
    {
        $response = Http::withToken($this->apiKey)
            ->timeout(15)
            ->post("{$this->baseUrl}/api/v1/snap/transactions", $params);

        if (!$response->successful()) {
            throw new RuntimeException("Snap transaction failed: " . ($response->json('error') ?? $response->body()));
        }

        return $response->json();
    }

    /**
     * Midtrans Status Check API: GET /api/v1/transactions/{order_id}/status
     */
    public function getTransactionStatus(string $orderId): array
    {
        $response = Http::withBasicAuth($this->apiKey, '')
            ->timeout(10)
            ->get("{$this->baseUrl}/api/v1/transactions/{$orderId}/status");

        if (!$response->successful()) {
            throw new RuntimeException("Status check failed: " . ($response->json('status_message') ?? $response->body()));
        }

        return $response->json();
    }

    /**
     * Verifikasi keaslian webhook menggunakan Midtrans SHA-512 signature.
     * signature_key = SHA512(order_id + status_code + gross_amount + server_key)
     */
    public function verifyMidtransSignature(string $orderId, string $statusCode, string $grossAmount, string $receivedSignature, ?string $serverKey = null): bool
    {
        $key = $serverKey ?: $this->apiKey;
        $expected = hash('sha512', $orderId . $statusCode . $grossAmount . $key);
        return hash_equals($expected, $receivedSignature);
    }

    /**
     * Verifikasi keaslian webhook menggunakan HMAC-SHA256 signature.
     */
    public function verifyWebhook(string $rawPayload, string $signature): bool
    {
        if (empty($this->webhookSecret) || empty($signature)) {
            return false;
        }
        $expected = hash_hmac('sha256', $rawPayload, $this->webhookSecret);
        return hash_equals($expected, $signature);
    }
}
