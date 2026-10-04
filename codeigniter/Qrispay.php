<?php

/**
 * Qrispay CodeIgniter 3 & 4 Library (SaaS Payment Gateway Edition)
 * Mendukung Midtrans Core Charge API, Snap Checkout, Verifikasi Webhook SHA-512 & HMAC, dan Sinkronisasi MySQL.
 */
class Qrispay
{
    protected $baseUrl;
    protected $apiKey;
    protected $webhookSecret;

    public function __construct($config = [])
    {
        $this->baseUrl = rtrim($config['base_url'] ?? (defined('QRISPAY_BASE_URL') ? QRISPAY_BASE_URL : 'http://localhost:3000'), '/');
        $this->apiKey = (string)($config['api_key'] ?? (defined('QRISPAY_API_KEY') ? QRISPAY_API_KEY : ''));
        $this->webhookSecret = (string)($config['webhook_secret'] ?? (defined('QRISPAY_WEBHOOK_SECRET') ? QRISPAY_WEBHOOK_SECRET : ''));
    }

    /**
     * Midtrans Core API: POST /api/v1/charge (atau /v2/charge)
     */
    public function charge(array $params): array
    {
        $ch = curl_init($this->baseUrl . '/api/v1/charge');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_USERPWD, $this->apiKey . ':'); // Basic Auth base64(server_key:)
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'Accept: application/json',
        ]);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($params));
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);

        $res = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($err) throw new Exception("cURL Error: $err");
        $data = json_decode($res ?: '', true);
        if ($code >= 400) throw new Exception($data['status_message'] ?? $data['error'] ?? "HTTP $code");
        return $data;
    }

    /**
     * Snap Checkout API: POST /api/v1/snap/transactions
     */
    public function createSnapTransaction(array $params): array
    {
        $ch = curl_init($this->baseUrl . '/api/v1/snap/transactions');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Authorization: Bearer ' . $this->apiKey,
            'Content-Type: application/json',
            'Accept: application/json',
        ]);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($params));
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);

        $res = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($err) throw new Exception("cURL Error: $err");
        $data = json_decode($res ?: '', true);
        if ($code >= 400) throw new Exception($data['error'] ?? "HTTP $code");
        return $data;
    }

    /**
     * Pengecekan status transaksi Midtrans: GET /api/v1/transactions/:order_id/status
     */
    public function getTransactionStatus(string $orderId): array
    {
        $ch = curl_init($this->baseUrl . '/api/v1/transactions/' . urlencode($orderId) . '/status');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_USERPWD, $this->apiKey . ':');
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        $res = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $data = json_decode($res ?: '', true);
        if ($code >= 400) throw new Exception($data['status_message'] ?? "HTTP $code");
        return $data;
    }

    /**
     * Buat pembayaran QRIS baru (Backward compatible)
     */
    public function createPayment(array $params): array
    {
        $ch = curl_init($this->baseUrl . '/api/v1/payments');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'X-API-Key: ' . $this->apiKey,
        ]);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($params));
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);

        $res = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($err) throw new Exception("cURL Error: $err");
        $data = json_decode($res ?: '', true);
        if ($code >= 400) throw new Exception($data['error'] ?? "HTTP $code");
        return $data;
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
     * Verifikasi keaslian webhook menggunakan signature HMAC-SHA256
     */
    public function verifyWebhook(string $payload, string $signature): bool
    {
        $expected = hash_hmac('sha256', $payload, $this->webhookSecret);
        return hash_equals($expected, $signature);
    }
}
