<?php
/**
 * GoPay.php - GoBiz Merchant Integration in Pure PHP
 * Reference: ahmadzakiyox/gopay-api-gateaway & hirotomasato/paygateme
 */

class GoPay
{
    private const GOID = 'https://api.gobiz.co.id';
    private const GOBIZ = 'https://api.gobiz.co.id';
    private const CLIENT_ID = 'go-biz-web-new';

    private static function request(string $url, array $options = []): array
    {
        $ch = curl_init($url);
        $method = $options['method'] ?? 'GET';
        $headers = array_merge([
            'Accept: application/json',
            'Content-Type: application/json',
            'Authentication-Type: go-id',
            'X-PhoneMake: Web',
            'X-PhoneModel: Web Client',
            'x-DeviceOS: Web',
            'X-User-Locale: id',
            'Gojek-Country-Code: ID',
            'Gojek-Timezone: Asia/Jakarta',
            'X-Platform: Web',
            'X-User-Type: merchant',
            'x-appId: go-biz-web-dashboard',
        ], $options['headers'] ?? []);

        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_TIMEOUT, 20);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);

        if (!empty($options['body'])) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($options['body']));
        }

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($err) {
            throw new RuntimeException("cURL Error: $err");
        }

        $json = json_decode($response ?: '', true);
        if ($httpCode >= 400) {
            $msg = $json['errors'][0]['message'] ?? $json['message'] ?? "HTTP $httpCode";
            throw new RuntimeException("GoPay API Error ($httpCode): $msg");
        }

        return $json ?: [];
    }

    public static function requestOtp(string $phone): array
    {
        $cleanPhone = preg_replace('/\D/', '', $phone);
        $cleanPhone = preg_replace('/^0+/', '', $cleanPhone);
        $cleanPhone = preg_replace('/^62/', '', $cleanPhone);

        $res = self::request(self::GOID . '/goid/login/request', [
            'method' => 'POST',
            'body' => [
                'client_id' => self::CLIENT_ID,
                'phone_number' => $cleanPhone,
                'country_code' => '+62'
            ]
        ]);

        $otpToken = $res['data']['otp_token'] ?? $res['data']['token'] ?? null;
        if (!$otpToken) {
            throw new RuntimeException("Gagal mendapatkan OTP token dari GoPay");
        }
        return ['otp_token' => $otpToken];
    }

    public static function verifyOtp(string $otp, string $otpToken): array
    {
        $res = self::request(self::GOID . '/goid/token', [
            'method' => 'POST',
            'body' => [
                'client_id' => self::CLIENT_ID,
                'grant_type' => 'otp',
                'data' => [
                    'otp' => $otp,
                    'otp_token' => $otpToken
                ]
            ]
        ]);

        $data = $res['data'] ?? [];
        $access = $data['access_token'] ?? null;
        $refresh = $data['refresh_token'] ?? null;
        if (!$access) {
            throw new RuntimeException("Respons GoPay tidak memiliki access_token");
        }

        // Fetch user info & merchant profile
        $userRes = self::request(self::GOBIZ . '/gobiz/v1/users/me', [
            'headers' => ['Authorization: Bearer ' . $access]
        ]);
        $merchant = $userRes['data']['merchants'][0] ?? null;
        $merchantId = $merchant['id'] ?? 'unknown';
        $merchantName = $merchant['name'] ?? 'Toko GoBiz';

        // Fetch Static QRIS
        $qris = null;
        try {
            $qrRes = self::request(self::GOBIZ . "/v1/merchants/$merchantId/static-qr", [
                'headers' => ['Authorization: Bearer ' . $access]
            ]);
            $qris = $qrRes['data']['qr_string'] ?? $qrRes['data']['raw_qr'] ?? null;
        } catch (Throwable $e) {}

        return [
            'access_token' => $access,
            'refresh_token' => $refresh,
            'merchant_id' => $merchantId,
            'merchant_name' => $merchantName,
            'qris' => $qris,
            'expires_at' => time() + ($data['expires_in'] ?? 3600),
        ];
    }

    public static function listTransactions(string $accessToken, string $merchantId, int $fromTs, int $toTs): array
    {
        $fromIso = gmdate('Y-m-d\TH:i:s\Z', $fromTs);
        $toIso = gmdate('Y-m-d\TH:i:s\Z', $toTs);

        $url = self::GOBIZ . "/merchant-analytics/v1/merchants/$merchantId/transactions?" . http_build_query([
            'start_date' => $fromIso,
            'end_date' => $toIso,
            'page' => 1,
            'limit' => 50
        ]);

        $res = self::request($url, [
            'headers' => ['Authorization: Bearer ' . $accessToken]
        ]);

        $rawTxs = $res['data']['transactions'] ?? $res['transactions'] ?? [];
        $out = [];
        foreach ($rawTxs as $t) {
            $status = strtolower($t['transaction_status'] ?? $t['status'] ?? '');
            if ($status !== 'settlement' && $status !== 'success') continue;

            $gross = $t['real_gross_amount'] ?? $t['gross_amount'] ?? 0;
            $amt = is_numeric($gross) ? (int)round($gross / 100) : 0;
            if ($amt <= 0) continue;

            $out[] = [
                'id' => (string)($t['id'] ?? $t['transaction_id'] ?? ''),
                'amount' => $amt,
                'time' => $t['transaction_time'] ?? date('c'),
                'order_id' => $t['order_id'] ?? null,
                'status' => 'settlement'
            ];
        }
        return $out;
    }

    public static function refreshToken(string $refreshToken): array
    {
        $res = self::request(self::GOID . '/goid/token', [
            'method' => 'POST',
            'body' => [
                'client_id' => self::CLIENT_ID,
                'grant_type' => 'refresh_token',
                'data' => [
                    'refresh_token' => $refreshToken
                ]
            ]
        ]);

        $data = $res['data'] ?? [];
        $access = $data['access_token'] ?? null;
        if (!$access) {
            throw new RuntimeException("Gagal refresh token GoPay: access_token tidak ditemukan");
        }

        return [
            'access_token' => $access,
            'refresh_token' => $data['refresh_token'] ?? $refreshToken,
            'expires_at' => time() + ($data['expires_in'] ?? 3600),
        ];
    }
}
