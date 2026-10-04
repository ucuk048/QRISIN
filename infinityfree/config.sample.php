<?php
/**
 * config.sample.php
 * Salin file ini menjadi config.php bila Anda ingin menggunakan MySQL bawaan InfinityFree / cPanel
 * atau mengatur kunci API toko Anda secara statis tanpa file .env.
 */

// 1. Kunci Keamanan Toko
define('API_KEY', 'ganti_dengan_kunci_api_rahasia_toko_anda');
define('WEBHOOK_SECRET', 'ganti_dengan_secret_webhook_anda');

// 2. Database MySQL InfinityFree (Opsional - Jika dikosongkan, gateway otomatis memakai SQLite di folder data/)
// Data ini bisa dilihat di menu "MySQL Databases" di Control Panel InfinityFree Anda:
// define('DB_HOST', 'sqlxxx.epizy.com');
// define('DB_NAME', 'if0_xxxxxxx_qrispay');
// define('DB_USER', 'if0_xxxxxxx');
// define('DB_PASS', 'password_vpanel_anda');

// 3. String QRIS Statis Merchant (Opsional, bisa diatur lewat API / admin)
// define('QRIS_STATIC', '00020101021126...');
