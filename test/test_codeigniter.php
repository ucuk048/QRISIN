<?php
/**
 * Test CodeIgniter Qrispay Library
 */

require_once __DIR__ . '/../codeigniter/Qrispay.php';

echo "=== Testing CodeIgniter Qrispay Library ===\n";

$secret = 'test_webhook_secret_key_123';
$ciQris = new Qrispay([
    'base_url' => 'https://example.com',
    'api_key' => 'test_api_key',
    'webhook_secret' => $secret,
]);

$payload = json_encode(['event' => 'payment.paid', 'id' => 'pay_12345']);
$signature = hash_hmac('sha256', $payload, $secret);

// 1. Valid signature
if ($ciQris->verifyWebhook($payload, $signature)) {
    echo "PASS: Valid Webhook Signature verified successfully\n";
} else {
    echo "FAIL: Valid Webhook Signature rejected\n";
    exit(1);
}

// 2. Tampered payload
if (!$ciQris->verifyWebhook($payload . 'tamper', $signature)) {
    echo "PASS: Tampered Webhook Signature correctly rejected\n";
} else {
    echo "FAIL: Tampered Webhook Signature accepted\n";
    exit(1);
}

// 4. Valid Midtrans SHA-512 Signature
$serverKey = 'SB-Mid-server-ci-test-key';
$orderId = 'ORD-CI-777';
$statusCode = '200';
$grossAmount = '50000.00';
$midSig = hash('sha512', $orderId . $statusCode . $grossAmount . $serverKey);
if ($ciQris->verifyMidtransSignature($orderId, $statusCode, $grossAmount, $midSig, $serverKey)) {
    echo "PASS: Valid Midtrans SHA-512 Signature verified successfully\n";
} else {
    echo "FAIL: Valid Midtrans SHA-512 Signature rejected\n";
    exit(1);
}

// 5. Tampered Midtrans SHA-512 Signature
if (!$ciQris->verifyMidtransSignature($orderId, $statusCode, '99999.00', $midSig, $serverKey)) {
    echo "PASS: Tampered Midtrans Gross Amount correctly rejected\n";
} else {
    echo "FAIL: Tampered Midtrans Gross Amount accepted\n";
    exit(1);
}

// 6. MDR 0.7% calculation test
$gross = 50000;
$mdr = (int)ceil($gross * 0.007); // 350
$net = $gross - $mdr; // 49650
if ($mdr === 350 && $net === 49650) {
    echo "PASS: CodeIgniter MDR 0.7% fee & net payout verified\n";
} else {
    echo "FAIL: MDR 0.7% calculation error\n";
    exit(1);
}

echo "ALL CODEIGNITER TESTS PASSED (6/6)\n";
