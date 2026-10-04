# Qrispay — Laravel Framework & MySQL Edition

Modul integrasi pembayaran QRIS resmi untuk aplikasi **Laravel (versi 9, 10, 11, dan 12)** dengan dukungan penuh **Eloquent ORM** dan database **MySQL / MariaDB / PostgreSQL**.

## Fitur Unggulan di Laravel:
- **Tabel MySQL Otomatis**: Migration schema siap pakai dengan indexing presisi pada `order_id`, `qris_id`, `status`, dan `total`.
- **Eloquent Model (`QrispayPayment`)**: Mendukung casting datetime, query scope `pending()` dan `paid()`, serta helper status.
- **Service Class (`QrispayService`)**: Menggunakan `Illuminate\Support\Facades\Http` native dengan timeout dan exception handling.
- **Verifikasi Webhook HMAC-SHA256**: Otomatis memvalidasi tanda tangan digital gateway untuk mencegah webhook palsu.

---

## Panduan Pemasangan (4 Langkah Cepat)

### 1. Salin File ke Project Laravel Anda
- Salin `config/qrispay.php` ke folder `config/` project Laravel.
- Salin `database/migrations/*` ke folder `database/migrations/` project Laravel.
- Salin folder `app/Models/` dan `app/Services/` ke folder `app/` project Laravel.
- Salin `app/Http/Controllers/QrispayController.php` ke folder controller Anda.
- Salin `routes/qrispay.php` ke folder `routes/`.

### 2. Jalankan Migrasi Database MySQL
```bash
php artisan migrate
```
Tabel `qrispay_payments` akan otomatis dibuat di database MySQL Anda.

### 3. Tambahkan Variabel Lingkungan di `.env` Laravel
```env
QRISPAY_BASE_URL=http://localhost:3000   # Atau URL Vercel / InfinityFree Anda
QRISPAY_API_KEY=kunci_api_rahasia_toko
QRISPAY_WEBHOOK_SECRET=secret_webhook_anda
```

### 4. Daftarkan Routes & Pengecualian CSRF
1. Tambahkan di file `routes/api.php` project Laravel:
   ```php
   require __DIR__ . '/qrispay.php';
   ```
2. **PENTING (CSRF Exemption)**:
   Karena webhook dipanggil dari gateway luar, kecualikan URL webhook dari CSRF:
   - **Laravel 11+** di `bootstrap/app.php`:
     ```php
     ->withMiddleware(function (Middleware $middleware) {
         $middleware->validateCsrfTokens(except: [
             'api/qrispay/webhook',
         ]);
     })
     ```
   - **Laravel 9/10** di `app/Http/Middleware/VerifyCsrfToken.php`:
     ```php
     protected $except = [
         'api/qrispay/webhook',
     ];
     ```
