<?php
defined('BASEPATH') OR exit('No direct script access allowed');

/**
 * Qrispay_ci.php - Library Qrispay untuk CodeIgniter 3 dan 4
 */

class Qrispay_ci
{
    protected $CI;
    protected $baseUrl;
    protected $apiKey;
    protected $webhookSecret;

    public function __construct($params = [])
    {
        $this->CI =& get_instance();
        $this->baseUrl = rtrim($params['base_url'] ?? 'http://localhost:3000', '/');
        $this->apiKey = $params['api_key'] ?? '';
        $this->webhookSecret = $params['webhook_secret'] ?? '';
    }

    public function createPayment($params)
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
        curl_close($ch);

        $data = json_decode($res, true);
        if ($code >= 400) {
            throw new Exception($data['error'] ?? "HTTP $code");
        }
        return $data;
    }

    public function verifyWebhook($payload, $signature)
    {
        $expected = hash_hmac('sha256', $payload, $this->webhookSecret);
        return hash_equals($expected, (string)$signature);
    }
}
