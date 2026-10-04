# Qrispay — InfinityFree / Shared Hosting PHP Edition

Paket gateway QRIS mandiri murni PHP (*zero external dependencies*) yang dirancang khusus untuk **InfinityFree**, **cPanel**, atau **Shared Web Hosting**.

## Fitur Utama di InfinityFree
1. **Nol Konfigurasi Database**: Otomatis membuat SQLite di folder `data/` (dengan fallback file JSON bila `pdo_sqlite` dibatasi).
2. **Rekonsiliasi On-Demand**: Karena hosting gratis tidak mengizinkan background daemon process, rekonsiliasi mutasi GoPay/Shopee berjalan otomatis saat pembeli membuka halaman checkout atau mengklik *Cek Status Pembayaran*.
3. **Nol Ekstensi Berat**: Menggunakan dynamic QR generator fallback tanpa memerlukan ekstensi PHP GD/Imagick.
4. **Keamanan Ekstra**: Disertai `.htaccess` yang memblokir akses publik ke file database `.sqlite` dan `.json`, serta proteksi Anti-Clickjacking dan SSRF.

---

## Panduan Pemasangan (3 Langkah Mudah)

1. Buka **Control Panel** InfinityFree Anda, lalu buka menu **Online File Manager** (atau gunakan FTP FileZilla).
2. Masuk ke folder **`htdocs`** (atau nama sub-domain Anda).
3. Unggah seluruh file di dalam folder ini langsung ke dalam folder `htdocs`:
   - `.htaccess`
   - `index.php`
   - `pay.php`
   - `Qris.php`
   - `Database.php`
   - `GoPay.php`
   - `Shopee.php`

Aplikasi gateway QRIS Anda sudah langsung aktif di domain InfinityFree Anda (misal `https://tokoanda.epizy.com/`).

---

## Endpoint API Penting
- **Buat Tagihan QRIS**: `POST /api/v1/payments` atau `GET /create-qris?amount=50000&api_key=...`
- **Cek Status Pembayaran**: `GET /api/v1/payments/:id` atau `GET /check-payment?id=...`
- **Halaman Bayar Pelanggan**: `/pay.php?id=:id`
- **Health Check**: `GET /health`
