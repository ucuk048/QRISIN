# qrispay — Multi-Platform & Multi-Tenant SaaS Payment Gateway QRIS Indonesia

SaaS Payment Gateway (PG) mandiri berstandar enterprise yang setara dengan Midtrans, Xendit, dan Stripe untuk ekosistem QRIS Indonesia.

Terinspirasi dari arsitektur [qriskuu.web.id](http://qriskuu.web.id/) / [qriskuu.com](https://qriskuu.com/), dengan referensi implementasi dari:
- [hirotomasato/paygateme](https://github.com/hirotomasato/paygateme) (Multi-provider SDK GoPay & ShopeePay)
- [ahmadzakiyox/shoppepay-api-gateway](https://github.com/ahmadzakiyox/shoppepay-api-gateway) (ShopeePay API Gateway)
- [ahmadzakiyox/gopay-api-gateaway](https://github.com/ahmadzakiyox/gopay-api-gateaway) (GoPay Merchant API Gateway)

Sistem ini mengubah QRIS statis merchant (GoPay GoBiz, ShopeePay, atau Bank apa pun) menjadi **QRIS dinamis ber-nominal presisi dengan kode unik otomatis (1–999)**. Ketika pembeli mentransfer, gateway mencocokkan mutasi rekening secara real-time dan mengirimkan notifikasi **Webhook Midtrans SHA-512 & HMAC-SHA256**.

Sistem ini dirancang agnostik terhadap infrastruktur dengan 5 folder khusus yang dioptimalkan untuk performa maksimal pada masing-masing platform:
1. [vercel/](file:///c:/Users/Administrator/Downloads/qrispay/qrispay/vercel): Full Node.js 22 LTS Serverless Functions + Upstash Redis REST (Terhubung ke remote `https://github.com/ucuk048/QRISIN.git`).
2. [infinityfree/](file:///c:/Users/Administrator/Downloads/qrispay/qrispay/infinityfree): Full Pure PHP 8.x + MySQL PDO / SQLite + Apache .htaccess + Browser-Driven Reconcile.
3. [vps/](file:///c:/Users/Administrator/Downloads/qrispay/qrispay/vps): Full Node.js 22 LTS + Native SQLite WAL + PM2 Cluster + Docker Compose + Nginx + 24/7 Background Daemon Worker.
4. [laravel/](file:///c:/Users/Administrator/Downloads/qrispay/qrispay/laravel): Paket lengkap Laravel 9–12 dengan Migration MySQL, Model Eloquent, Service, Controller, dan Routes.
5. [codeigniter/](file:///c:/Users/Administrator/Downloads/qrispay/qrispay/codeigniter): Library native CodeIgniter 3 & 4 dengan Skema Tabel MySQL InnoDB.

---

## Fitur Utama SaaS Payment Gateway

- **Multi-Tenant Merchant Isolation**: Setiap merchant memiliki akun mandiri, Server Key (`SB-Mid-server-...`), Client Key (`SB-Mid-client-...`), dan Webhook Secret (`whsec_...`).
- **Midtrans Core API Compatibility**:
  - `POST /api/v1/charge` (atau `/v2/charge`) dengan HTTP Basic Auth standar Midtrans `Authorization: Basic base64(server_key:)`.
  - `POST /api/v1/snap/transactions` Snap checkout token generator.
  - `GET /api/v1/transactions/:order_id/status` pengecekan status transaksi real-time.
- **Standar Biaya MDR 0.7% Bank Indonesia**: Perhitungan MDR otomatis dan pencatatan laba bersih (net payout) per merchant ledger.
- **Webhook Notifikasi Midtrans SHA-512**: Signature verification `SHA512(order_id + status_code + gross_amount + server_key)`.
- **Generator QRIS Dinamis Standar EMVCo**: Injeksi tag 54 (nominal), konversi tag 01 (dinamis `12`), dan kalkulasi ulang CRC16-CCITT secara native.
- **Multi-Provider Merchant**:
  - **GoPay / GoBiz**: Login via OTP nomor HP langsung dari web portal `/admin`, auto-refresh OAuth2 token (proaktif < 5 menit & reaktif 401), auto-fetch static QRIS & mutasi transaksi.
  - **ShopeePay Merchant**: Dukungan token session (`POST /update-token`), verifikasi akun, dan pembacaan riwayat mutasi transaksi.
  - **Manual / Standalone QRIS**: Dukungan string QRIS statis dari bank mana pun (BCA, Mandiri, BRI, BNI, Dana, Nobu, LinkAja, dll).
- **Anti Double-Claim & Lock Nominal**: Nominal unik dikunci secara atomik dengan `SET NX` selama masa pending (15 menit) sehingga dua transaksi tidak saling berebut klaim.
- **Halaman Bayar Interaktif (`/pay/:id` & `/qr/:id`)**: Dilengkapi hitung mundur visual, gambar QR resolusi tinggi, tombol **Cek Status Pembayaran (Instant)**, dan saklar auto-polling background.
- **Portal Admin & Merchant Multi-Tab (`/admin`)**: Dashboard modern (Ringkasan, Pembayaran, Kunci API, Webhook Test Simulator, Pengaturan Provider).
- **Dokumentasi API Interaktif (`/docs`)**: OpenAPI-style explorer dengan fitur live request console langsung di browser.
- **Background Worker Daemon (`worker.js`)**: Rekonsiliasi mutasi otomatis di latar belakang untuk server mandiri/VPS tanpa perlu cron eksternal.

---

## Panduan Folder Khusus Platform

### 1. Vercel Serverless ([vercel/](file:///c:/Users/Administrator/Downloads/qrispay/qrispay/vercel))
Buka folder `vercel/`, deploy langsung menggunakan CLI `vercel` atau import ke Dashboard Vercel. Menggunakan Upstash Redis REST untuk menjamin data pembayaran persisten pada runtime stateless.

### 2. InfinityFree / Shared Hosting ([infinityfree/](file:///c:/Users/Administrator/Downloads/qrispay/qrispay/infinityfree))
Unggah seluruh isi folder `infinityfree/` ke direktori `htdocs/` akun InfinityFree Anda. Menggunakan PHP 8 murni dan database MySQL bawaan InfinityFree via PDO dengan auto-refresh token GoPay.

### 3. VPS / Dedicated ([vps/](file:///c:/Users/Administrator/Downloads/qrispay/qrispay/vps))
Jalankan langsung dengan Docker Compose (`docker compose up -d`) atau PM2 (`pm2 start ecosystem.config.js`). Menggunakan native SQLite WAL bawaan Node 22+ yang ultra-ringan dan cepat.

### 4. Integrasi Laravel ([laravel/](file:///c:/Users/Administrator/Downloads/qrispay/qrispay/laravel))
Salin service, model, migration, dan controller ke dalam proyek Laravel Anda. Jalankan `php artisan migrate` untuk membuat tabel transaksi MySQL.

### 5. Integrasi CodeIgniter ([codeigniter/](file:///c:/Users/Administrator/Downloads/qrispay/qrispay/codeigniter))
Impor file `schema.sql` ke database MySQL Anda dan letakkan `Qrispay.php` ke direktori library CI3 atau CI4.

---

## Ringkasan Endpoint API

Semua request API diproteksi dengan header `X-API-Key: YOUR_API_KEY`.

| Endpoint | Method | Keterangan |
|---|---|---|
| `/api/v1/payments` | `POST` | Buat tagihan baru dengan kode unik otomatis |
| `/api/v1/payments/:id` | `GET` | Cek status tagihan & pemicu rekonsiliasi |
| `/api/public/payments/:id` | `GET` | Cek status tagihan publik untuk browser pembeli (tanpa API key) |
| `/api/v1/payments/:id/cancel` | `POST` | Batalkan tagihan pending & lepas kunci nominal |
| `/api/cron/reconcile` | `GET/POST` | Cron rekonsiliasi Vercel / server eksternal |
| `/pay/:id` | `GET` | Tampilan halaman checkout interaktif pembeli |
| `/link/:slug` | `GET` | Tautan pembayaran tetap toko merchant |
| `/token-status` | `GET` | Cek status koneksi provider aktif |
| `/update-token` | `POST` | Simpan sesi token ShopeePay |
| `/transactions` | `GET` | Baca riwayat mutasi masuk rekening provider |
| `/api/admin/webhook/test` | `POST` | Simulasi pengujian webhook toko secara live |
| `/health` | `GET` | Healthcheck server uptime |

---

## Menjalankan Seluruh Pengujian Otomatis

Jalankan test suite lengkap (Node.js, PHP, CodeIgniter, Laravel):
```bash
node --test test/*.test.js
php test/test_php_edition.php
php test/test_codeigniter.php
php test/test_laravel.php
```
Seluruh 25 test lolos dengan status 100% PASS tanpa kesalahan.
