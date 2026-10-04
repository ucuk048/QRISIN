<?php
/**
 * Database.php - Zero-dependency persistent store for PHP
 * Mendukung MySQL (InfinityFree / cPanel), SQLite, dan JSON fallback.
 * Dilengkapi isolasi multi-tenant SaaS Merchant, MDR 0.7%, dan status ledger.
 */

class Database
{
    private static ?PDO $pdo = null;
    private static string $jsonFile = '';
    private static bool $usePdo = false;

    public static function init(): void
    {
        if (self::$pdo !== null || self::$usePdo) {
            return;
        }

        $dir = __DIR__ . '/data';
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }

        self::$jsonFile = $dir . '/store.json';

        // 1. MySQL PDO (InfinityFree / cPanel / MariaDB)
        $dbHost = getenv('DB_HOST') ?: (defined('DB_HOST') ? DB_HOST : null);
        $dbName = getenv('DB_NAME') ?: (defined('DB_NAME') ? DB_NAME : null);
        $dbUser = getenv('DB_USER') ?: (defined('DB_USER') ? DB_USER : null);
        $dbPass = getenv('DB_PASS') ?: (defined('DB_PASS') ? DB_PASS : '');

        if ($dbHost && $dbName && $dbUser && extension_loaded('pdo_mysql')) {
            try {
                self::$pdo = new PDO("mysql:host={$dbHost};dbname={$dbName};charset=utf8mb4", $dbUser, $dbPass, [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                ]);
                self::$pdo->exec("
                    CREATE TABLE IF NOT EXISTS kv (
                        k VARCHAR(191) PRIMARY KEY,
                        v LONGTEXT,
                        exp BIGINT NULL
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

                    CREATE TABLE IF NOT EXISTS merchants (
                        id VARCHAR(64) PRIMARY KEY,
                        name VARCHAR(191) NOT NULL,
                        email VARCHAR(191) UNIQUE NOT NULL,
                        password_hash VARCHAR(255) NOT NULL,
                        phone VARCHAR(64) NULL,
                        server_key VARCHAR(191) UNIQUE NOT NULL,
                        client_key VARCHAR(191) UNIQUE NOT NULL,
                        webhook_secret VARCHAR(191) NOT NULL,
                        webhook_url TEXT NULL,
                        provider VARCHAR(64) DEFAULT 'platform',
                        custom_qris TEXT NULL,
                        created_at BIGINT NOT NULL
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

                    CREATE TABLE IF NOT EXISTS payments (
                        id VARCHAR(64) PRIMARY KEY,
                        merchant_id VARCHAR(64) DEFAULT 'mid_default',
                        order_id VARCHAR(191) NULL,
                        amount BIGINT NOT NULL,
                        unique_code INT NOT NULL,
                        total BIGINT NOT NULL,
                        mdr_fee BIGINT DEFAULT 0,
                        net_amount BIGINT DEFAULT 0,
                        status VARCHAR(32) NOT NULL,
                        qris_string TEXT NOT NULL,
                        created_at BIGINT NOT NULL,
                        expires_at BIGINT NOT NULL,
                        paid_at BIGINT NULL,
                        callback_url TEXT NULL,
                        webhook_sent TINYINT(1) DEFAULT 0,
                        INDEX idx_payments_status (status),
                        INDEX idx_payments_total (total),
                        INDEX idx_payments_merchant (merchant_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                ");
                self::$usePdo = true;
                return;
            } catch (Throwable $e) {
                // Fallback ke SQLite jika MySQL gagal
            }
        }

        // 2. SQLite PDO
        if (extension_loaded('pdo_sqlite')) {
            try {
                $dbPath = $dir . '/qrispay.sqlite';
                self::$pdo = new PDO("sqlite:" . $dbPath);
                self::$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                self::$pdo->exec("
                    CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT, exp INTEGER);
                    CREATE TABLE IF NOT EXISTS merchants (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        email TEXT UNIQUE NOT NULL,
                        password_hash TEXT NOT NULL,
                        phone TEXT,
                        server_key TEXT UNIQUE NOT NULL,
                        client_key TEXT UNIQUE NOT NULL,
                        webhook_secret TEXT NOT NULL,
                        webhook_url TEXT,
                        provider TEXT DEFAULT 'platform',
                        custom_qris TEXT,
                        created_at INTEGER
                    );
                    CREATE TABLE IF NOT EXISTS payments (
                        id TEXT PRIMARY KEY,
                        merchant_id TEXT DEFAULT 'mid_default',
                        order_id TEXT,
                        amount INTEGER,
                        unique_code INTEGER,
                        total INTEGER,
                        mdr_fee INTEGER DEFAULT 0,
                        net_amount INTEGER DEFAULT 0,
                        status TEXT,
                        qris_string TEXT,
                        created_at INTEGER,
                        expires_at INTEGER,
                        paid_at INTEGER,
                        callback_url TEXT,
                        webhook_sent INTEGER DEFAULT 0
                    );
                    CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
                    CREATE INDEX IF NOT EXISTS idx_payments_total ON payments(total);
                    CREATE INDEX IF NOT EXISTS idx_payments_merchant ON payments(merchant_id);
                ");
                self::$usePdo = true;
                return;
            } catch (Throwable $e) {
                self::$usePdo = false;
            }
        }

        // 3. Fallback JSON File
        if (!file_exists(self::$jsonFile)) {
            @file_put_contents(self::$jsonFile, json_encode(['kv' => [], 'merchants' => [], 'payments' => []]));
        }
    }

    private static function readJson(): array
    {
        if (!file_exists(self::$jsonFile)) return ['kv' => [], 'merchants' => [], 'payments' => []];
        $str = @file_get_contents(self::$jsonFile);
        $data = json_decode($str ?: '', true);
        if (!is_array($data)) return ['kv' => [], 'merchants' => [], 'payments' => []];
        if (!isset($data['merchants'])) $data['merchants'] = [];
        return $data;
    }

    private static function writeJson(array $data): void
    {
        @file_put_contents(self::$jsonFile, json_encode($data, JSON_PRETTY_PRINT), LOCK_EX);
    }

    public static function get(string $key): mixed
    {
        self::init();
        if (self::$usePdo) {
            $stmt = self::$pdo->prepare("SELECT v, exp FROM kv WHERE k = ?");
            $stmt->execute([$key]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$row) return null;
            if ($row['exp'] && $row['exp'] < time()) {
                self::del($key);
                return null;
            }
            return json_decode($row['v'], true);
        }

        $data = self::readJson();
        if (isset($data['kv'][$key])) {
            $item = $data['kv'][$key];
            if (isset($item['exp']) && $item['exp'] < time()) {
                unset($data['kv'][$key]);
                self::writeJson($data);
                return null;
            }
            return $item['v'];
        }
        return null;
    }

    public static function set(string $key, mixed $val, ?int $exSec = null): void
    {
        self::init();
        $exp = $exSec ? (time() + $exSec) : null;
        if (self::$usePdo) {
            $stmt = self::$pdo->prepare("REPLACE INTO kv (k, v, exp) VALUES (?, ?, ?)");
            $stmt->execute([$key, json_encode($val), $exp]);
            return;
        }

        $data = self::readJson();
        $data['kv'][$key] = ['v' => $val, 'exp' => $exp];
        self::writeJson($data);
    }

    public static function setNX(string $key, mixed $val, ?int $exSec = null): bool
    {
        self::init();
        if (self::get($key) !== null) {
            return false;
        }
        self::set($key, $val, $exSec);
        return true;
    }

    public static function del(string $key): void
    {
        self::init();
        if (self::$usePdo) {
            $stmt = self::$pdo->prepare("DELETE FROM kv WHERE k = ?");
            $stmt->execute([$key]);
            return;
        }

        $data = self::readJson();
        unset($data['kv'][$key]);
        self::writeJson($data);
    }

    public static function randId(int $length = 12): string
    {
        $bytes = random_bytes((int)ceil($length / 2));
        return substr(bin2hex($bytes), 0, $length);
    }

    // === Multi-Tenant SaaS Merchant Management ===

    public static function createMerchant(string $name, string $email, string $password, string $phone = ''): array
    {
        self::init();
        $cleanEmail = strtolower(trim($email));
        if (self::getMerchantByEmail($cleanEmail)) {
            throw new Exception('Email merchant sudah terdaftar', 409);
        }

        $id = 'mid_' . self::randId(8);
        $serverKey = 'SB-Mid-server-' . self::randId(16);
        $clientKey = 'SB-Mid-client-' . self::randId(16);
        $webhookSecret = 'whsec_' . self::randId(16);
        $pwdHash = password_hash($password, PASSWORD_BCRYPT);
        $now = time();

        $merchant = [
            'id' => $id,
            'name' => trim($name),
            'email' => $cleanEmail,
            'password_hash' => $pwdHash,
            'phone' => trim($phone),
            'server_key' => $serverKey,
            'client_key' => $clientKey,
            'webhook_secret' => $webhookSecret,
            'webhook_url' => '',
            'provider' => 'platform',
            'custom_qris' => '',
            'created_at' => $now,
        ];

        if (self::$usePdo) {
            $stmt = self::$pdo->prepare("
                INSERT INTO merchants 
                (id, name, email, password_hash, phone, server_key, client_key, webhook_secret, webhook_url, provider, custom_qris, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $id, $merchant['name'], $merchant['email'], $pwdHash, $merchant['phone'],
                $serverKey, $clientKey, $webhookSecret, '', 'platform', '', $now
            ]);
        } else {
            $data = self::readJson();
            $data['merchants'][$id] = $merchant;
            self::writeJson($data);
        }

        $sessionToken = 'sess_' . self::randId(24);
        self::set('merchant:session:' . $sessionToken, $id, 7 * 86400);

        unset($merchant['password_hash']);
        return ['merchant' => $merchant, 'token' => $sessionToken];
    }

    public static function verifyMerchantLogin(string $email, string $password): array
    {
        self::init();
        $cleanEmail = strtolower(trim($email));
        $m = self::getMerchantByEmail($cleanEmail, true);
        if (!$m || !password_verify($password, $m['password_hash'])) {
            throw new Exception('Email atau password salah', 401);
        }

        $sessionToken = 'sess_' . self::randId(24);
        self::set('merchant:session:' . $sessionToken, $m['id'], 7 * 86400);

        unset($m['password_hash']);
        return ['merchant' => $m, 'token' => $sessionToken];
    }

    public static function getMerchantById(string $id, bool $withSecret = false): ?array
    {
        self::init();
        if ($id === 'mid_default') {
            return self::getDefaultMerchant();
        }

        $m = null;
        if (self::$usePdo) {
            $stmt = self::$pdo->prepare("SELECT * FROM merchants WHERE id = ?");
            $stmt->execute([$id]);
            $m = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
        } else {
            $data = self::readJson();
            $m = $data['merchants'][$id] ?? null;
        }

        if ($m && !$withSecret) {
            unset($m['password_hash']);
        }
        return $m;
    }

    public static function getMerchantByEmail(string $email, bool $withSecret = false): ?array
    {
        self::init();
        $cleanEmail = strtolower(trim($email));
        $m = null;

        if (self::$usePdo) {
            $stmt = self::$pdo->prepare("SELECT * FROM merchants WHERE email = ?");
            $stmt->execute([$cleanEmail]);
            $m = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
        } else {
            $data = self::readJson();
            foreach ($data['merchants'] as $item) {
                if (strtolower($item['email']) === $cleanEmail) {
                    $m = $item;
                    break;
                }
            }
        }

        if ($m && !$withSecret) {
            unset($m['password_hash']);
        }
        return $m;
    }

    public static function getMerchantByServerKey(string $key): ?array
    {
        self::init();
        if (!$key) return null;
        $adminKey = getenv('API_KEY') ?: (defined('API_KEY') ? API_KEY : null);
        if ($adminKey && hash_equals($adminKey, $key)) {
            return self::getDefaultMerchant();
        }

        if (self::$usePdo) {
            $stmt = self::$pdo->prepare("SELECT * FROM merchants WHERE server_key = ?");
            $stmt->execute([$key]);
            $m = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
            if ($m) unset($m['password_hash']);
            return $m;
        }

        $data = self::readJson();
        foreach ($data['merchants'] as $m) {
            if ($m['server_key'] === $key) {
                unset($m['password_hash']);
                return $m;
            }
        }
        return null;
    }

    public static function getMerchantByToken(string $token): ?array
    {
        self::init();
        if (!$token) return null;
        $merchantId = self::get('merchant:session:' . $token);
        if (!$merchantId) return null;
        return self::getMerchantById($merchantId);
    }

    public static function getDefaultMerchant(): array
    {
        return [
            'id' => 'mid_default',
            'name' => 'Platform Merchant Utama',
            'email' => 'admin@qrispay.id',
            'phone' => '081200000000',
            'server_key' => getenv('API_KEY') ?: (defined('API_KEY') ? API_KEY : 'SB-Mid-server-default-php-key'),
            'client_key' => 'SB-Mid-client-default-php-key',
            'webhook_secret' => getenv('WEBHOOK_SECRET') ?: (defined('WEBHOOK_SECRET') ? WEBHOOK_SECRET : 'whsec_default_secret'),
            'webhook_url' => getenv('WEBHOOK_URL') ?: '',
            'provider' => 'platform',
            'custom_qris' => '',
            'created_at' => time(),
            'is_default' => true,
        ];
    }

    public static function updateMerchantWebhook(string $merchantId, ?string $url, ?string $secret): void
    {
        self::init();
        if ($merchantId === 'mid_default') return;

        if (self::$usePdo) {
            $stmt = self::$pdo->prepare("UPDATE merchants SET webhook_url = COALESCE(?, webhook_url), webhook_secret = COALESCE(?, webhook_secret) WHERE id = ?");
            $stmt->execute([$url, $secret, $merchantId]);
            return;
        }

        $data = self::readJson();
        if (isset($data['merchants'][$merchantId])) {
            if ($url !== null) $data['merchants'][$merchantId]['webhook_url'] = $url;
            if ($secret !== null) $data['merchants'][$merchantId]['webhook_secret'] = $secret;
            self::writeJson($data);
        }
    }

    public static function getMerchantOverview(string $merchantId): array
    {
        self::init();
        $txs = self::listPaymentsByMerchant($merchantId, 200);

        $totalGross = 0;
        $totalNet = 0;
        $totalMdr = 0;
        $paidCount = 0;
        $pendingCount = 0;
        $expiredCount = 0;

        foreach ($txs as $p) {
            if ($p['status'] === 'paid') {
                $paidCount++;
                $gross = (int)$p['total'];
                $mdr = (int)($p['mdr_fee'] ?: ceil($gross * 0.007));
                $totalGross += $gross;
                $totalMdr += $mdr;
                $totalNet += ($gross - $mdr);
            } elseif ($p['status'] === 'pending') {
                $pendingCount++;
            } else {
                $expiredCount++;
            }
        }

        $totalAttempt = $paidCount + $pendingCount + $expiredCount;
        $rate = $totalAttempt > 0 ? round(($paidCount / $totalAttempt) * 100, 1) : 100.0;

        return [
            'merchant_id' => $merchantId,
            'total_gross' => $totalGross,
            'total_net' => $totalNet,
            'total_mdr' => $totalMdr,
            'mdr_rate' => '0.7%',
            'paid_count' => $paidCount,
            'pending_count' => $pendingCount,
            'expired_count' => $expiredCount,
            'total_transactions' => $totalAttempt,
            'success_rate' => $rate . '%',
        ];
    }

    // === Payment Operations with MDR 0.7% ===

    public static function savePayment(array $p): void
    {
        self::init();
        $mid = $p['merchant_id'] ?? 'mid_default';
        $total = (int)$p['total'];
        $mdrFee = isset($p['mdr_fee']) ? (int)$p['mdr_fee'] : (int)ceil($total * 0.007);
        $netAmount = isset($p['net_amount']) ? (int)$p['net_amount'] : ($total - $mdrFee);

        if (self::$usePdo) {
            $stmt = self::$pdo->prepare("
                REPLACE INTO payments 
                (id, merchant_id, order_id, amount, unique_code, total, mdr_fee, net_amount, status, qris_string, created_at, expires_at, paid_at, callback_url, webhook_sent)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $p['id'],
                $mid,
                $p['order_id'] ?? null,
                $p['amount'],
                $p['unique_code'],
                $total,
                $mdrFee,
                $netAmount,
                $p['status'],
                $p['qris_string'],
                $p['created_at'],
                $p['expires_at'],
                $p['paid_at'] ?? null,
                $p['callback_url'] ?? null,
                !empty($p['webhook_sent']) ? 1 : 0
            ]);
            return;
        }

        $data = self::readJson();
        $p['merchant_id'] = $mid;
        $p['mdr_fee'] = $mdrFee;
        $p['net_amount'] = $netAmount;
        $data['payments'][$p['id']] = $p;
        self::writeJson($data);
    }

    public static function getPayment(string $id): ?array
    {
        self::init();
        if (self::$usePdo) {
            $stmt = self::$pdo->prepare("SELECT * FROM payments WHERE id = ?");
            $stmt->execute([$id]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            return $row ?: null;
        }

        $data = self::readJson();
        return $data['payments'][$id] ?? null;
    }

    public static function listPendingPayments(): array
    {
        self::init();
        if (self::$usePdo) {
            $stmt = self::$pdo->prepare("SELECT * FROM payments WHERE status = 'pending'");
            $stmt->execute();
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        }

        $data = self::readJson();
        $res = [];
        foreach ($data['payments'] as $p) {
            if ($p['status'] === 'pending') $res[] = $p;
        }
        return $res;
    }

    public static function listPaymentsByMerchant(string $merchantId, int $limit = 50): array
    {
        self::init();
        if (self::$usePdo) {
            $limitInt = (int)$limit;
            $stmt = self::$pdo->prepare("SELECT * FROM payments WHERE merchant_id = ? ORDER BY created_at DESC LIMIT {$limitInt}");
            $stmt->execute([$merchantId]);
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        }

        $data = self::readJson();
        $list = [];
        foreach ($data['payments'] as $p) {
            if (($p['merchant_id'] ?? 'mid_default') === $merchantId) {
                $list[] = $p;
            }
        }
        usort($list, fn($a, $b) => ($b['created_at'] ?? 0) <=> ($a['created_at'] ?? 0));
        return array_slice($list, 0, $limit);
    }

    public static function listRecentPayments(int $limit = 50): array
    {
        self::init();
        if (self::$usePdo) {
            $limitInt = (int)$limit;
            $stmt = self::$pdo->query("SELECT * FROM payments ORDER BY created_at DESC LIMIT {$limitInt}");
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        }

        $data = self::readJson();
        $list = array_values($data['payments'] ?? []);
        usort($list, fn($a, $b) => ($b['created_at'] ?? 0) <=> ($a['created_at'] ?? 0));
        return array_slice($list, 0, $limit);
    }
}
