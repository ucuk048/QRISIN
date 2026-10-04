<?php
/**
 * Qrispay PHP Standalone SaaS Payment Gateway
 * Compatible with InfinityFree, cPanel, Shared Hosting, Apache, Nginx, PHP 7.4 / 8.x
 * Midtrans Core Charge API, Snap Checkout, and Multi-Tenant Merchant Isolation
 */

if (file_exists(__DIR__ . '/config.php')) {
    require_once __DIR__ . '/config.php';
}

require_once __DIR__ . '/Qris.php';
require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/GoPay.php';
require_once __DIR__ . '/Shopee.php';

// Security Headers (OWASP ZAP Compliance)
if (!headers_sent()) {
    header('X-Frame-Options: SAMEORIGIN');
    header('X-Content-Type-Options: nosniff');
    header('X-XSS-Protection: 1; mode=block');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    header("Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https: blob:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self';");
    header('Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate');
    header('Pragma: no-cache');
    @header_remove('X-Powered-By');

    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Headers: Content-Type, X-API-Key, X-Server-Key, Authorization, X-Shopee-Token');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

Database::init();

function jsonOut(array $data, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_SLASHES);
    exit;
}

function getJsonInput(): array {
    $raw = file_get_contents('php://input', false, null, 0, 1048577);
    if (strlen($raw) > 1048576) {
        jsonOut(['status_code' => '413', 'error' => 'Payload Too Large: Maksimal 1MB'], 413);
    }
    return json_decode($raw ?: '', true) ?: [];
}

function isPrivateUrl(?string $urlStr): bool {
    if (!$urlStr) return false;
    $parts = parse_url($urlStr);
    if (!isset($parts['scheme']) || !in_array(strtolower($parts['scheme']), ['http', 'https'], true)) {
        return true;
    }
    if (getenv('ALLOW_LOCAL_URL') === '1') {
        return false;
    }
    $host = strtolower($parts['host'] ?? '');
    if ($host === 'localhost' || $host === '127.0.0.1' || $host === '::1' || $host === '0.0.0.0') return true;
    if (substr($host, -6) === '.local' || substr($host, -9) === '.internal') return true;
    if ($host === '169.254.169.254' || $host === 'metadata.google.internal') return true;

    $ip = filter_var($host, FILTER_VALIDATE_IP);
    if ($ip) {
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            return true;
        }
    }
    return false;
}

function midtransSignaturePhp(string $orderId, string $statusCode, string $grossAmount, string $serverKey): string {
    return hash('sha512', $orderId . $statusCode . $grossAmount . $serverKey);
}

function resolveMerchantPhp(): ?array {
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';

    // 1. Basic Auth Midtrans: base64(server_key . ":")
    if (stripos($auth, 'Basic ') === 0) {
        $decoded = base64_decode(trim(substr($auth, 6)));
        $parts = explode(':', $decoded, 2);
        $serverKey = trim($parts[0]);
        $m = Database::getMerchantByServerKey($serverKey);
        if ($m) return $m;
    }

    // 2. Bearer Auth
    if (stripos($auth, 'Bearer ') === 0) {
        $token = trim(substr($auth, 7));
        if (strpos($token, 'sess_') === 0) {
            $m = Database::getMerchantByToken($token);
            if ($m) return $m;
        } else {
            $m = Database::getMerchantByServerKey($token);
            if ($m) return $m;
        }
    }

    // 3. Header X-Server-Key / X-API-Key
    $sKey = $_SERVER['HTTP_X_SERVER_KEY'] ?? $_SERVER['HTTP_X_API_KEY'] ?? $_GET['server_key'] ?? $_GET['api_key'] ?? null;
    if ($sKey) {
        $m = Database::getMerchantByServerKey($sKey);
        if ($m) return $m;
    }

    // 4. Session Cookie
    if (!empty($_COOKIE['merchant_token'])) {
        $m = Database::getMerchantByToken($_COOKIE['merchant_token']);
        if ($m) return $m;
    }

    // 5. Platform Admin fallback
    $platformKey = getenv('API_KEY') ?: (defined('API_KEY') ? API_KEY : null);
    if ($platformKey && !empty($sKey) && hash_equals($platformKey, (string)$sKey)) {
        return Database::getDefaultMerchant();
    }

    return null;
}

function sendWebhook(array $p): void {
    $merchantId = $p['merchant_id'] ?? 'mid_default';
    $m = Database::getMerchantById($merchantId, true);
    $url = $p['callback_url'] ?? $m['webhook_url'] ?? Database::get('merchant:webhook_url') ?? getenv('WEBHOOK_URL');
    if (!$url) return;

    $secret = $m['webhook_secret'] ?? Database::get('merchant:webhook_secret') ?? getenv('WEBHOOK_SECRET') ?? '';
    $serverKey = $m['server_key'] ?? getenv('API_KEY') ?: 'server_key';
    $orderId = $p['order_id'] ?: $p['id'];
    $grossAmount = (string)$p['total'] . '.00';
    $midSig = midtransSignaturePhp($orderId, '200', $grossAmount, $serverKey);

    $payload = json_encode([
        'event' => 'payment.paid',
        'transaction_time' => date('c', $p['created_at']),
        'transaction_status' => 'settlement',
        'transaction_id' => $p['id'],
        'status_message' => 'midtrans payment notification',
        'status_code' => '200',
        'signature_key' => $midSig,
        'payment_type' => 'qris',
        'order_id' => $orderId,
        'merchant_id' => $merchantId,
        'gross_amount' => $grossAmount,
        'currency' => 'IDR',
        'settlement_time' => date('c', $p['paid_at'] ?? time()),
        'data' => [
            'id' => $p['id'],
            'order_id' => $p['order_id'],
            'amount' => $p['amount'],
            'unique_code' => $p['unique_code'],
            'total' => $p['total'],
            'mdr_fee' => $p['mdr_fee'] ?? (int)ceil($p['total'] * 0.007),
            'net_amount' => $p['net_amount'] ?? ((int)$p['total'] - (int)ceil($p['total'] * 0.007)),
            'status' => 'paid',
            'paid_at' => $p['paid_at'] ?? time(),
        ]
    ], JSON_UNESCAPED_SLASHES);
    $sig = hash_hmac('sha256', $payload, $secret);

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'X-Signature: ' . $sig,
        'X-Midtrans-Signature: ' . $midSig
    ]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    curl_setopt($ch, CURLOPT_TIMEOUT, 8);
    @curl_exec($ch);
    @curl_close($ch);
}

function reconcilePayment(array &$payment): void {
    if ($payment['status'] !== 'pending') return;

    if (time() > $payment['expires_at']) {
        $payment['status'] = 'expired';
        Database::savePayment($payment);
        Database::del('amt:' . $payment['total']);
        return;
    }

    // 1. Cek GoPay
    $gpSession = Database::get('gopay:session');
    if (!empty($gpSession['access_token']) && !empty($gpSession['merchant_id'])) {
        if (!empty($gpSession['refresh_token']) && !empty($gpSession['expires_at']) && time() > ($gpSession['expires_at'] - 300)) {
            try {
                $ref = GoPay::refreshToken($gpSession['refresh_token']);
                $gpSession['access_token'] = $ref['access_token'];
                $gpSession['refresh_token'] = $ref['refresh_token'];
                $gpSession['expires_at'] = $ref['expires_at'];
                Database::set('gopay:session', $gpSession);
            } catch (Throwable $e) {}
        }

        try {
            $fromTs = ($payment['created_at'] ?? time()) - 60;
            $txs = GoPay::listTransactions($gpSession['access_token'], $gpSession['merchant_id'], $fromTs, time());
            foreach ($txs as $t) {
                if ($t['amount'] === $payment['total']) {
                    if (Database::setNX('claim:' . $t['id'], $payment['id'], 86400 * 30)) {
                        $payment['status'] = 'paid';
                        $payment['paid_at'] = time();
                        $payment['webhook_sent'] = 1;
                        Database::savePayment($payment);
                        Database::del('amt:' . $payment['total']);
                        sendWebhook($payment);
                        return;
                    }
                }
            }
        } catch (Throwable $e) {}
    }

    // 2. Cek ShopeePay
    $spSession = Database::get('shopee:session');
    if (!empty($spSession['token'])) {
        try {
            $fromTs = ($payment['created_at'] ?? time()) - 60;
            $txs = Shopee::listTransactions($spSession['token'], $fromTs, time());
            foreach ($txs as $t) {
                if ($t['amount'] === $payment['total']) {
                    if (Database::setNX('claim:' . $t['id'], $payment['id'], 86400 * 30)) {
                        $payment['status'] = 'paid';
                        $payment['paid_at'] = time();
                        $payment['webhook_sent'] = 1;
                        Database::savePayment($payment);
                        Database::del('amt:' . $payment['total']);
                        sendWebhook($payment);
                        return;
                    }
                }
            }
        } catch (Throwable $e) {}
    }
}

// Router
$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if (php_sapi_name() === 'cli' && basename(__FILE__) !== basename($_SERVER['SCRIPT_FILENAME'] ?? '')) {
    return;
}

// 1. Health
if ($uri === '/health' || $uri === '/api/health') {
    jsonOut(['ok' => true, 'timestamp' => date('c'), 'engine' => 'PHP ' . PHP_VERSION, 'mode' => 'saas_payment_gateway']);
}

// 2. SaaS Midtrans Core Charge API: /api/v1/charge & /v2/charge
if (($uri === '/api/v1/charge' || $uri === '/v2/charge') && $method === 'POST') {
    $merchant = resolveMerchantPhp();
    if (!$merchant) {
        jsonOut(['status_code' => '401', 'status_message' => 'Unauthorized: Invalid Server Key or API Key'], 401);
    }

    $input = getJsonInput() ?: $_POST;
    $details = $input['transaction_details'] ?? [];
    $grossAmount = (int)($details['gross_amount'] ?? $input['gross_amount'] ?? $input['amount'] ?? 0);
    $orderId = (string)($details['order_id'] ?? $input['order_id'] ?? ('ORDER-' . Database::randId(6)));

    if ($grossAmount < 1000) {
        jsonOut(['status_code' => '400', 'status_message' => 'Gross amount minimal 1000'], 400);
    }

    $staticQris = $merchant['custom_qris'] ?? Database::get('manual:qris') ?? getenv('QRIS_STATIC');
    if (!$staticQris) {
        $gpSession = Database::get('gopay:session');
        if (!empty($gpSession['qris'])) $staticQris = $gpSession['qris'];
    }
    if (!$staticQris) {
        jsonOut(['status_code' => '503', 'status_message' => 'Static QRIS belum diatur pada sistem'], 503);
    }

    $ttl = 15 * 60;
    $payId = 'pay_' . Database::randId(9);
    $offset = 0;
    $found = false;
    for ($i = 0; $i < 60; $i++) {
        $randOff = rand(1, 999);
        $nominal = $grossAmount + $randOff;
        if (Database::setNX('amt:' . $nominal, $payId, $ttl + 60)) {
            $offset = $randOff;
            $found = true;
            break;
        }
    }
    if (!$found) {
        jsonOut(['status_code' => '429', 'status_message' => 'Terlalu banyak pembayaran pending dengan nominal ini'], 429);
    }

    $total = $grossAmount + $offset;
    $dynamicQris = Qris::toDynamic($staticQris, $total);
    $now = time();
    $mdrFee = (int)ceil($total * 0.007);
    $netAmount = $total - $mdrFee;

    $payment = [
        'id' => $payId,
        'merchant_id' => $merchant['id'],
        'order_id' => $orderId,
        'amount' => $grossAmount,
        'unique_code' => $offset,
        'total' => $total,
        'mdr_fee' => $mdrFee,
        'net_amount' => $netAmount,
        'status' => 'pending',
        'qris_string' => $dynamicQris,
        'created_at' => $now,
        'expires_at' => $now + $ttl,
        'callback_url' => $input['callback_url'] ?? null,
        'payment_link' => "/pay.php?id={$payId}"
    ];

    Database::savePayment($payment);

    jsonOut([
        'status_code' => '201',
        'status_message' => 'QRIS transaction is created',
        'transaction_id' => $payId,
        'order_id' => $orderId,
        'merchant_id' => $merchant['id'],
        'gross_amount' => (string)$total,
        'currency' => 'IDR',
        'payment_type' => 'qris',
        'transaction_status' => 'pending',
        'transaction_time' => date('c', $now),
        'qr_string' => $dynamicQris,
        'payment_url' => "/pay.php?id={$payId}",
        'actions' => [
            ['name' => 'deeplink-checkout', 'method' => 'GET', 'url' => "/pay.php?id={$payId}"]
        ]
    ], 201);
}

// 3. SaaS Snap Checkout API: /api/v1/snap/transactions
if (($uri === '/api/v1/snap/transactions' || $uri === '/snap/v1/transactions') && $method === 'POST') {
    $merchant = resolveMerchantPhp();
    if (!$merchant) {
        jsonOut(['error' => 'Unauthorized: Invalid Server Key'], 401);
    }

    $input = getJsonInput() ?: $_POST;
    $details = $input['transaction_details'] ?? [];
    $grossAmount = (int)($details['gross_amount'] ?? $input['gross_amount'] ?? $input['amount'] ?? 0);
    $orderId = (string)($details['order_id'] ?? $input['order_id'] ?? ('SNAP-' . Database::randId(6)));

    if ($grossAmount < 1000) {
        jsonOut(['error' => 'gross_amount minimal 1000'], 400);
    }

    $staticQris = $merchant['custom_qris'] ?? Database::get('manual:qris') ?? getenv('QRIS_STATIC');
    if (!$staticQris) {
        $gpSession = Database::get('gopay:session');
        if (!empty($gpSession['qris'])) $staticQris = $gpSession['qris'];
    }
    if (!$staticQris) {
        jsonOut(['error' => 'Static QRIS belum dikonfigurasi'], 503);
    }

    $ttl = 15 * 60;
    $payId = 'pay_' . Database::randId(9);
    $offset = 0;
    $found = false;
    for ($i = 0; $i < 60; $i++) {
        $randOff = rand(1, 999);
        $nominal = $grossAmount + $randOff;
        if (Database::setNX('amt:' . $nominal, $payId, $ttl + 60)) {
            $offset = $randOff;
            $found = true;
            break;
        }
    }
    if (!$found) jsonOut(['error' => 'Rate limit exceeded for nominal collision'], 429);

    $total = $grossAmount + $offset;
    $dynamicQris = Qris::toDynamic($staticQris, $total);
    $now = time();
    $mdrFee = (int)ceil($total * 0.007);

    $payment = [
        'id' => $payId,
        'merchant_id' => $merchant['id'],
        'order_id' => $orderId,
        'amount' => $grossAmount,
        'unique_code' => $offset,
        'total' => $total,
        'mdr_fee' => $mdrFee,
        'net_amount' => $total - $mdrFee,
        'status' => 'pending',
        'qris_string' => $dynamicQris,
        'created_at' => $now,
        'expires_at' => $now + $ttl,
        'callback_url' => $input['callback_url'] ?? null,
        'payment_link' => "/pay.php?id={$payId}"
    ];

    Database::savePayment($payment);

    jsonOut([
        'token' => $payId,
        'redirect_url' => "/pay.php?id={$payId}",
        'transaction_id' => $payId
    ], 201);
}

// 4. Midtrans Status Check API: /api/v1/transactions/:order_id/status
if (preg_match('#^/(?:api/v1/transactions|v2)/([\w-]+)/status$#', $uri, $matches) && $method === 'GET') {
    $merchant = resolveMerchantPhp();
    if (!$merchant) {
        jsonOut(['status_code' => '401', 'status_message' => 'Unauthorized'], 401);
    }

    $targetIdOrOrder = $matches[1];
    $payment = Database::getPayment($targetIdOrOrder);
    if (!$payment) {
        $merchantPayments = Database::listPaymentsByMerchant($merchant['id'], 100);
        foreach ($merchantPayments as $item) {
            if (($item['order_id'] ?? '') === $targetIdOrOrder) {
                $payment = $item;
                break;
            }
        }
    }

    if (!$payment) {
        jsonOut(['status_code' => '404', 'status_message' => 'Transaction not found'], 404);
    }

    reconcilePayment($payment);

    $statusStr = $payment['status'] === 'paid' ? 'settlement' : ($payment['status'] === 'expired' ? 'expire' : ($payment['status'] === 'cancelled' ? 'cancel' : 'pending'));

    jsonOut([
        'status_code' => '200',
        'status_message' => 'Success, transaction found',
        'transaction_id' => $payment['id'],
        'order_id' => $payment['order_id'] ?: $payment['id'],
        'merchant_id' => $payment['merchant_id'] ?? 'mid_default',
        'gross_amount' => (string)$payment['total'] . '.00',
        'currency' => 'IDR',
        'payment_type' => 'qris',
        'transaction_status' => $statusStr,
        'transaction_time' => date('c', $payment['created_at']),
        'settlement_time' => !empty($payment['paid_at']) ? date('c', $payment['paid_at']) : null,
    ], 200);
}

// 5. SaaS Merchant Auth Endpoints: /api/saas/auth/*
if ($uri === '/api/saas/auth/register' && $method === 'POST') {
    $input = getJsonInput() ?: $_POST;
    try {
        $res = Database::createMerchant(
            $input['name'] ?? '',
            $input['email'] ?? '',
            $input['password'] ?? '',
            $input['phone'] ?? ''
        );
        setcookie('merchant_token', $res['token'], time() + (7 * 86400), '/', '', false, true);
        jsonOut(['success' => true, 'merchant' => $res['merchant'], 'token' => $res['token']], 201);
    } catch (Throwable $e) {
        jsonOut(['success' => false, 'error' => $e->getMessage()], $e->getCode() ?: 400);
    }
}

if ($uri === '/api/saas/auth/login' && $method === 'POST') {
    $input = getJsonInput() ?: $_POST;
    try {
        $res = Database::verifyMerchantLogin($input['email'] ?? '', $input['password'] ?? '');
        setcookie('merchant_token', $res['token'], time() + (7 * 86400), '/', '', false, true);
        jsonOut(['success' => true, 'merchant' => $res['merchant'], 'token' => $res['token']], 200);
    } catch (Throwable $e) {
        jsonOut(['success' => false, 'error' => $e->getMessage()], 401);
    }
}

if ($uri === '/api/saas/auth/me' && $method === 'GET') {
    $merchant = resolveMerchantPhp();
    if (!$merchant) jsonOut(['error' => 'Unauthenticated'], 401);
    jsonOut(['success' => true, 'merchant' => $merchant]);
}

if ($uri === '/api/saas/merchant/overview' && $method === 'GET') {
    $merchant = resolveMerchantPhp();
    if (!$merchant) jsonOut(['error' => 'Unauthenticated'], 401);
    jsonOut(['success' => true, 'overview' => Database::getMerchantOverview($merchant['id'])]);
}

if ($uri === '/api/saas/merchant/transactions' && $method === 'GET') {
    $merchant = resolveMerchantPhp();
    if (!$merchant) jsonOut(['error' => 'Unauthenticated'], 401);
    $txs = Database::listPaymentsByMerchant($merchant['id'], 100);
    jsonOut(['success' => true, 'transactions' => $txs]);
}

if ($uri === '/api/saas/merchant/payment-link' && $method === 'POST') {
    $merchant = resolveMerchantPhp();
    if (!$merchant) jsonOut(['error' => 'Unauthenticated'], 401);
    $input = getJsonInput() ?: $_POST;
    $amount = (int)($input['amount'] ?? 0);
    if ($amount < 1000) jsonOut(['error' => 'amount minimal 1000'], 400);

    $staticQris = $merchant['custom_qris'] ?? Database::get('manual:qris') ?? getenv('QRIS_STATIC');
    if (!$staticQris) {
        $gp = Database::get('gopay:session');
        if (!empty($gp['qris'])) $staticQris = $gp['qris'];
    }
    if (!$staticQris) jsonOut(['error' => 'QRIS statis belum diatur'], 503);

    $ttl = 15 * 60;
    $payId = 'pay_' . Database::randId(9);
    $randOff = rand(1, 999);
    $total = $amount + $randOff;
    Database::setNX('amt:' . $total, $payId, $ttl + 60);

    $now = time();
    $mdrFee = (int)ceil($total * 0.007);
    $payment = [
        'id' => $payId,
        'merchant_id' => $merchant['id'],
        'order_id' => $input['order_id'] ?? ('LINK-' . Database::randId(6)),
        'amount' => $amount,
        'unique_code' => $randOff,
        'total' => $total,
        'mdr_fee' => $mdrFee,
        'net_amount' => $total - $mdrFee,
        'status' => 'pending',
        'qris_string' => Qris::toDynamic($staticQris, $total),
        'created_at' => $now,
        'expires_at' => $now + $ttl,
        'callback_url' => $input['callback_url'] ?? null,
        'payment_link' => "/pay.php?id={$payId}"
    ];
    Database::savePayment($payment);

    jsonOut(['success' => true, 'data' => $payment], 201);
}

// 6. Public Checkout Status (/api/public/payments/:id)
if (preg_match('#^/api/public/payments/([\w-]+)$#', $uri, $matches)) {
    $id = $matches[1];
    $payment = Database::getPayment($id);
    if (!$payment) jsonOut(['success' => false, 'error' => 'Payment not found'], 404);
    reconcilePayment($payment);
    jsonOut([
        'id' => $payment['id'],
        'order_id' => $payment['order_id'],
        'amount' => $payment['amount'],
        'unique_code' => $payment['unique_code'],
        'total' => $payment['total'],
        'status' => $payment['status'],
        'paid_at' => $payment['paid_at'] ?? null,
        'expires_at' => $payment['expires_at'],
    ]);
}

// 7. Backward-Compatible /create-qris & /api/v1/payments
if (($uri === '/api/v1/payments' || $uri === '/create-qris') && ($method === 'POST' || $method === 'GET')) {
    $merchant = resolveMerchantPhp();
    if (!$merchant) jsonOut(['success' => false, 'error' => 'Unauthorized: Invalid API Key'], 401);

    $input = $method === 'POST' ? (getJsonInput() ?: $_POST) : $_GET;
    $amount = (int)($input['amount'] ?? 0);
    if ($amount < 1000) jsonOut(['success' => false, 'error' => 'amount minimal 1000'], 400);

    $staticQris = $merchant['custom_qris'] ?? Database::get('manual:qris') ?? getenv('QRIS_STATIC');
    if (!$staticQris) {
        $gpSession = Database::get('gopay:session');
        if (!empty($gpSession['qris'])) $staticQris = $gpSession['qris'];
    }
    if (!$staticQris) jsonOut(['success' => false, 'error' => 'QRIS statis belum diatur'], 503);

    $ttl = 15 * 60;
    $payId = 'pay_' . Database::randId(9);
    $randOff = rand(1, 999);
    $total = $amount + $randOff;
    Database::setNX('amt:' . $total, $payId, $ttl + 60);

    $now = time();
    $mdrFee = (int)ceil($total * 0.007);
    $payment = [
        'id' => $payId,
        'merchant_id' => $merchant['id'],
        'order_id' => $input['order_id'] ?? null,
        'amount' => $amount,
        'unique_code' => $randOff,
        'total' => $total,
        'mdr_fee' => $mdrFee,
        'net_amount' => $total - $mdrFee,
        'status' => 'pending',
        'qris_string' => Qris::toDynamic($staticQris, $total),
        'created_at' => $now,
        'expires_at' => $now + $ttl,
        'callback_url' => $input['callback_url'] ?? null,
        'payment_link' => "/pay.php?id=$payId"
    ];
    Database::savePayment($payment);

    jsonOut([
        'success' => true,
        'data' => [
            'qris_id' => $payId,
            'trx_id' => $payId,
            'amount' => $amount,
            'unique_code' => $randOff,
            'total' => $total,
            'qris_code' => $payment['qris_string'],
            'qris_url' => "/pay.php?id=$payId",
            'expires_at' => date('c', $now + $ttl)
        ]
    ], 201);
}

// 8. Check Payment Status Merchant (/api/v1/payments/:id & /check-payment)
if ($uri === '/check-payment' || preg_match('#^/api/v1/payments/([\w-]+)$#', $uri, $matches)) {
    $id = $matches[1] ?? $_GET['trx_id'] ?? $_GET['id'] ?? null;
    if (!$id) jsonOut(['success' => false, 'error' => 'id or trx_id required'], 400);

    $payment = Database::getPayment($id);
    if (!$payment) jsonOut(['success' => false, 'error' => 'Payment not found'], 404);

    reconcilePayment($payment);
    jsonOut(['success' => true, 'data' => $payment]);
}

// 9. Token status
if ($uri === '/token-status') {
    jsonOut(['success' => true, 'data' => ['token_status' => 'valid', 'engine' => 'PHP']]);
}

// 10. Default Dashboard view
?>
<!DOCTYPE html>
<html lang="id" data-theme="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>QRISPAY — SaaS Payment Gateway (PHP Edition)</title>
  <script>
    if (window.top !== window.self) {
      window.top.location = window.self.location.href;
    }
  </script>
  <style>
    :root {
      --bg: #f8fafc; --surface: #ffffff; --border: #e2e8f0;
      --text: #0f172a; --text-muted: #64748b; --primary: #0f172a;
      --accent: #2563eb; --radius: 8px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); padding: 32px 20px; }
    .container { max-width: 800px; margin: 0 auto; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 24px; margin-bottom: 20px; }
    h1 { font-size: 24px; font-weight: 800; margin-bottom: 8px; letter-spacing: -0.02em; }
    p { font-size: 14px; color: var(--text-muted); line-height: 1.5; margin-bottom: 16px; }
    .btn { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 16px; border-radius: 6px; font-weight: 600; font-size: 14px; cursor: pointer; text-decoration: none; border: none; }
    .btn-primary { background: var(--primary); color: #fff; }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 99px; font-size: 11px; font-weight: 700; background: #e0f2fe; color: #0284c7; }
    pre { background: #0f172a; color: #f8fafc; padding: 16px; border-radius: 6px; font-size: 12px; overflow-x: auto; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h1>QRISPAY SaaS Payment Gateway (PHP Edition)</h1>
        <span class="badge">PHP <?php echo PHP_VERSION; ?> Running</span>
      </div>
      <p>Gateway Pembayaran QRIS multi-tenant mandiri setara Midtrans. Mendukung Core Charge API, Snap Checkout, dan isolasi merchant dedicated.</p>
      
      <div style="display:flex; gap:12px;">
        <a href="/pay.php" class="btn btn-primary">Buka Halaman Checkout</a>
      </div>
    </div>

    <div class="card">
      <h2 style="font-size:16px; font-weight:700; margin-bottom:12px;">Contoh Midtrans Charge API (PHP)</h2>
      <pre>curl -X POST https://domain-anda.com/api/v1/charge \
  -u "SB-Mid-server-your-key:" \
  -H "Content-Type: application/json" \
  -d '{
    "payment_type": "qris",
    "transaction_details": {
      "order_id": "ORD-123",
      "gross_amount": 50000
    }
  }'</pre>
    </div>
  </div>
</body>
</html>
