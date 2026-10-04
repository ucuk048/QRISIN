<?php
/**
 * Test Suite untuk PHP Edition dan PHP Client SDK
 */

require_once __DIR__ . '/../php/Qris.php';
require_once __DIR__ . '/../php/Database.php';
require_once __DIR__ . '/../sdk/php/QrispayClient.php';

use Qrispay\QrispayClient;

function assertEqual($a, $b, $msg = '') {
    if ($a !== $b) {
        echo "FAILED: $msg (Expected: " . var_export($b, true) . ", Got: " . var_export($a, true) . ")\n";
        exit(1);
    }
}

echo "=== 1. Testing PHP Qris EMVCo Converter ===\n";
$m = '0013ID.CO.EXAMPLE.WWW0118936000000000000000';
$b = '000201010211' . '26' . str_pad((string)strlen($m), 2, '0', STR_PAD_LEFT) . $m . '5204581253033605802ID5909TOKO TEST6007JAKARTA6304';
$static = $b . Qris::crc16($b);

assertEqual(Qris::validate($static), true, "Validating static QRIS");

$dynamic = Qris::toDynamic($static, 50123);
assertEqual(Qris::validate($dynamic), true, "Validating dynamic QRIS");
assert(strpos($dynamic, '540550123') !== false, "Tag 54 present with amount 50123");
assert(strpos($dynamic, '010212') !== false, "Tag 01 set to dynamic 12");
echo "PASS: EMVCo Dynamic Conversion & CRC16 checksum verified\n";

echo "=== 2. Testing PHP Database (Storage & Locks) ===\n";
Database::init();
Database::set('test_k', ['foo' => 'bar'], 10);
$v = Database::get('test_k');
assertEqual($v['foo'], 'bar', "KV Read/Write");

assertEqual(Database::setNX('lock_test', '1', 10), true, "Lock NX first time");
assertEqual(Database::setNX('lock_test', '2', 10), false, "Lock NX second time should be false");
Database::del('lock_test');
echo "PASS: Database KV and Atomic NX Locks verified\n";

echo "=== 3. Testing PHP SDK Webhook Verification ===\n";
$sdk = new QrispayClient('http://localhost:3000', 'test_key', 'my_secret_token');
$payload = '{"event":"payment.paid","data":{"id":"pay_123","total":50000}}';
$sig = hash_hmac('sha256', $payload, 'my_secret_token');
assertEqual($sdk->verifyWebhook($payload, $sig), true, "Signature verification match");
assertEqual($sdk->verifyWebhook($payload, 'wrong_signature'), false, "Reject invalid signature");
echo "PASS: Webhook HMAC verification verified\n";

echo "=== 4. Testing PHP OWASP Security (SSRF & Safe Headers) ===\n";
require_once __DIR__ . '/../php/index.php';
assertEqual(isPrivateUrl('http://127.0.0.1:8080'), true, "Block localhost IP");
assertEqual(isPrivateUrl('http://localhost/pay'), true, "Block localhost name");
assertEqual(isPrivateUrl('http://169.254.169.254/latest/meta-data/'), true, "Block AWS metadata");
assertEqual(isPrivateUrl('http://10.0.0.1/private'), true, "Block 10.x.x.x");
assertEqual(isPrivateUrl('http://192.168.1.1/router'), true, "Block 192.168.x.x");
assertEqual(isPrivateUrl('http://internal.service.local'), true, "Block .local internal domain");
assertEqual(isPrivateUrl('ftp://example.com'), true, "Block non-HTTP scheme");
assertEqual(isPrivateUrl('https://mycompany.com/webhook'), false, "Allow valid public URL");
echo "PASS: SSRF Defense & Validation verified\n";

echo "\nALL PHP TESTS PASSED (4/4)\n";
