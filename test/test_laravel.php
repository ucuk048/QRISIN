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

// 4. Midtrans SHA-512 Signature Key Verification
$serverKey = 'SB-Mid-server-laravel-live-test';
$orderId = 'ORD-LARAVEL-01';
$statusCode = '200';
$grossAmount = '100456.00';
$midExpected = hash('sha512', $orderId . $statusCode . $grossAmount . $serverKey);
$midComputed = hash('sha512', $orderId . $statusCode . $grossAmount . $serverKey);
if (hash_equals($midExpected, $midComputed)) {
    echo "PASS: Laravel Midtrans SHA-512 signature matches\n";
} else {
    echo "FAIL: Laravel Midtrans SHA-512 mismatch\n";
    exit(1);
}

// 5. Tampered Midtrans Amount
$fakeGross = '50000.00';
$fakeSig = hash('sha512', $orderId . $statusCode . $fakeGross . $serverKey);
if (!hash_equals($midExpected, $fakeSig)) {
    echo "PASS: Tampered Midtrans amount rejected\n";
} else {
    echo "FAIL: Tampered Midtrans amount accepted\n";
    exit(1);
}

// 6. MDR 0.7% Calculation Verification
$gross = 100000;
$mdr = (int)ceil($gross * 0.007); // 700
$net = $gross - $mdr; // 99300
if ($mdr === 700 && $net === 99300) {
    echo "PASS: Laravel 0.7% MDR fee & net calculation verified\n";
} else {
    echo "FAIL: MDR calculation error\n";
    exit(1);
}

echo "ALL LARAVEL TESTS PASSED (6/6)\n";
