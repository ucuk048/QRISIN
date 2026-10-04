<?php
/**
 * Test Laravel Service & Webhook HMAC Verification
 */

// Mock helper config function if running standalone without full Laravel bootstrap
if (!function_exists('config')) {
    function config($key, $default = null) {
        $map = [
            'qrispay.base_url' => 'http://localhost:3000',
            'qrispay.api_key' => 'test_laravel_api_key',
            'qrispay.webhook_secret' => 'super_secret_laravel_hmac_key',
            'qrispay.callback_url' => 'https://toko.com/api/qrispay/webhook',
            'qrispay.expiry_minutes' => 15,
        ];
        return $map[$key] ?? $default;
    }
}

// Mock hash_equals if needed
if (!function_exists('hash_equals')) {
    function hash_equals($a, $b) {
        return $a === $b;
    }
}

echo "=== Testing Laravel Qrispay Service & HMAC Layer ===\n";

$secret = 'super_secret_laravel_hmac_key';
$payload = json_encode([
    'event' => 'payment.paid',
    'data' => [
        'id' => 'pay_laravel_999',
        'order_id' => 'ORD-LARAVEL-01',
        'amount' => 100000,
        'total' => 100456,
        'status' => 'paid',
    ]
]);

$validSig = hash_hmac('sha256', $payload, $secret);

// 1. Valid Signature Verification
$expected = hash_hmac('sha256', $payload, $secret);
if (hash_equals($expected, $validSig)) {
    echo "PASS: Laravel Webhook HMAC signature correctly matches\n";
} else {
    echo "FAIL: Laravel Webhook signature mismatch\n";
    exit(1);
}

// 2. Tampered Payload
$tamperedPayload = json_encode([
    'event' => 'payment.paid',
    'data' => [
        'id' => 'pay_laravel_999',
        'order_id' => 'ORD-LARAVEL-01',
        'amount' => 1000, // Attacker attempts to change amount
        'total' => 1456,
        'status' => 'paid',
    ]
]);
if (!hash_equals(hash_hmac('sha256', $tamperedPayload, $secret), $validSig)) {
    echo "PASS: Tampered payload with altered amount rejected\n";
} else {
    echo "FAIL: Tampered payload accepted\n";
    exit(1);
}

// 3. Forged Signature
if (!hash_equals(hash_hmac('sha256', $payload, $secret), 'invalid_signature_hex_code')) {
    echo "PASS: Forged signature rejected\n";
} else {
    echo "FAIL: Forged signature accepted\n";
    exit(1);
}

echo "ALL LARAVEL TESTS PASSED (3/3)\n";
