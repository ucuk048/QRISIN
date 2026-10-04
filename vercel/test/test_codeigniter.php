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

// 3. Forged signature
if (!$ciQris->verifyWebhook($payload, 'forged_signature_hex')) {
    echo "PASS: Forged Webhook Signature correctly rejected\n";
} else {
    echo "FAIL: Forged Webhook Signature accepted\n";
    exit(1);
}

echo "ALL CODEIGNITER TESTS PASSED (3/3)\n";
