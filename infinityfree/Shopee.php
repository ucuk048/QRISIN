<?php
/**
 * Shopee.php - ShopeePay Merchant Feed in Pure PHP
 * Reference: ahmadzakiyox/shoppepay-api-gateway & hirotomasato/paygateme
 */

class Shopee
{
    private const BASE_URL = 'https://merchant.shopee.co.id/api';

    private static function request(string $url, array $options = []): array
    {
        $ch = curl_init($url);
        $method = $options['method'] ?? 'GET';
        $headers = array_merge([
            'Accept: application/json',
            'Content-Type: application/json',
            'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        ], $options['headers'] ?? []);

        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_TIMEOUT, 20);

        if (!empty($options['body'])) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($options['body']));
        }

        $res = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $json = json_decode($res ?: '', true);
        if ($code >= 400) {
            $msg = $json['message'] ?? "HTTP $code";
            throw new RuntimeException("Shopee API Error: $msg");
        }
        return $json ?: [];
    }

    public static function listTransactions(string $token, int $fromTs, int $toTs): array
    {
        $url = self::BASE_URL . '/v1/order/transaction_list?' . http_build_query([
            'start_time' => $fromTs,
            'end_time' => $toTs,
            'page_number' => 1,
            'page_size' => 50
        ]);

        $res = self::request($url, [
            'headers' => [
                'Cookie: SPC_EC=' . $token,
                'X-Shopee-Token: ' . $token,
            ]
        ]);

        $raw = $res['data']['orders'] ?? $res['data']['transactions'] ?? [];
        $out = [];
        foreach ($raw as $t) {
            $status = strtolower($t['status'] ?? '');
            if ($status !== 'completed' && $status !== 'success' && $status !== 'settlement') continue;

            $amt = (int)($t['amount'] ?? $t['total_amount'] ?? 0);
            if ($amt <= 0) continue;

            $out[] = [
                'id' => (string)($t['order_sn'] ?? $t['transaction_id'] ?? ''),
                'amount' => $amt,
                'time' => date('c', $t['create_time'] ?? time()),
                'status' => 'settlement'
            ];
        }
        return $out;
    }
}
