<?php
/**
 * QrispayClient.php - Official PHP Client Library for Qrispay Gateway
 * Usable with pure PHP, Laravel, CodeIgniter, Symfony, WordPress, etc.
 */

namespace Qrispay;

class QrispayClient
{
    private string $baseUrl;
    private string $apiKey;
    private ?string $webhookSecret;

    public function __construct(string $baseUrl, string $apiKey, ?string $webhookSecret = null)
    {
        $this->baseUrl = rtrim($baseUrl, '/');
        $this->apiKey = $apiKey;
        $this->webhookSecret = $webhookSecret;
    }

    private function request(string $method, string $path, ?array $body = null): array
    {
        $url = $this->baseUrl . $path;
        $ch = curl_init($url);

        $headers = [
            'Content-Type: application/json',
            'Accept: application/json',
            'X-API-Key: ' . $this->apiKey,
        ];

        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);

        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
        }

        $res = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($err) {
            throw new \RuntimeException("Qrispay cURL Error: " . $err);
        }

        $json = json_decode($res ?: '', true);
        if ($code >= 400) {
            $msg = $json['error'] ?? $json['message'] ?? "HTTP Status $code";
            throw new \RuntimeException("Qrispay API Error ($code): $msg");
        }

        return $json ?: [];
    }

    /**
     * Buat tagihan QRIS baru
     *
     * @param array $params ['amount' => 50000, 'order_id' => 'INV-001', 'callback_url' => 'https://...']
     * @return array
     */
    public function createPayment(array $params): array
    {
        if (empty($params['amount']) || $params['amount'] < 1000) {
            throw new \InvalidArgumentException("Nominal pembayaran minimal Rp 1.000");
        }
        return $this->request('POST', '/api/v1/payments', $params);
    }

    /**
     * Cek status pembayaran berdasarkan ID
     */
    public function getPayment(string $id): array
    {
        return $this->request('GET', '/api/v1/payments/' . urlencode($id));
    }

    /**
     * Batalkan pembayaran
     */
    public function cancelPayment(string $id): array
    {
        return $this->request('POST', '/api/v1/payments/' . urlencode($id) . '/cancel');
    }

    /**
     * Verifikasi signature webhook yang diterima dari gateway
     */
    public function verifyWebhook(string $payload, string $signature): bool
    {
        if (!$this->webhookSecret) {
            throw new \RuntimeException("Webhook secret belum diatur di klien");
        }
        $expected = hash_hmac('sha256', $payload, $this->webhookSecret);
        return hash_equals($expected, $signature);
    }
}
