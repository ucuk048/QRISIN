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

echo "=== 5. Testing PHP SaaS Merchant Multi-Tenancy & Auth ===\n";
$email = 'php_merchant_' . time() . '@toko.id';
$reg = Database::createMerchant('Toko PHP Berkah', $email, 'passwordAman123', '08123456789');
assertEqual(!empty($reg['token']), true, "Merchant session token generated");
assertEqual(strpos($reg['merchant']['id'], 'mid_') === 0, true, "Merchant ID prefix mid_");
assertEqual(strpos($reg['merchant']['server_key'], 'SB-Mid-server-') === 0, true, "Server key prefix SB-Mid-server-");
assertEqual(strpos($reg['merchant']['client_key'], 'SB-Mid-client-') === 0, true, "Client key prefix SB-Mid-client-");
assertEqual(strpos($reg['merchant']['webhook_secret'], 'whsec_') === 0, true, "Webhook secret prefix whsec_");

$login = Database::verifyMerchantLogin($email, 'passwordAman123');
assertEqual(!empty($login['token']), true, "Merchant login successful");

$byKey = Database::getMerchantByServerKey($reg['merchant']['server_key']);
assertEqual($byKey['id'], $reg['merchant']['id'], "Resolve merchant by server key");
echo "PASS: SaaS Merchant Registration, BCRYPT Hash & Key Generation verified\n";

echo "=== 6. Testing PHP Midtrans SHA-512 Signature & MDR 0.7% ===\n";
$orderId = 'MID-ORDER-999';
$statusCode = '200';
$grossAmount = '50000.00';
$serverKey = 'SB-Mid-server-testkey123';
$expectedSig = hash('sha512', $orderId . $statusCode . $grossAmount . $serverKey);
$computedSig = midtransSignaturePhp($orderId, $statusCode, $grossAmount, $serverKey);
assertEqual($computedSig, $expectedSig, "Midtrans SHA-512 Signature calculation");

// Simpan payment dengan merchant_id dan cek MDR 0.7%
$totalAmt = 100000;
$mdrFee = (int)ceil($totalAmt * 0.007); // Rp 700
$payRecord = [
    'id' => 'pay_php_' . time(),
    'merchant_id' => $reg['merchant']['id'],
    'order_id' => $orderId,
    'amount' => 100000,
    'unique_code' => 0,
    'total' => $totalAmt,
    'mdr_fee' => $mdrFee,
    'net_amount' => $totalAmt - $mdrFee,
    'status' => 'paid',
    'qris_string' => $static,
    'created_at' => time(),
    'expires_at' => time() + 900,
    'paid_at' => time(),
];
Database::savePayment($payRecord);

$overview = Database::getMerchantOverview($reg['merchant']['id']);
assertEqual($overview['total_gross'], 100000, "Merchant ledger total gross");
assertEqual($overview['total_mdr'], 700, "Merchant ledger total MDR 0.7%");
assertEqual($overview['total_net'], 99300, "Merchant ledger total net payout");
assertEqual($overview['paid_count'], 1, "Merchant paid count");
echo "PASS: Midtrans SHA-512 and MDR 0.7% Ledger calculation verified\n";

echo "\nALL PHP TESTS PASSED (6/6)\n";

