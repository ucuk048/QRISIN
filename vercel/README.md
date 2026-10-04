# QRISPAY — SaaS Payment Gateway Edition (Vercel Serverless)

Platform SaaS Payment Gateway (PG) multi-tenant modern standar Midtrans, Xendit, dan Stripe untuk QRIS Indonesia.

## Fitur SaaS Payment Gateway
- Multi-Tenant Merchant Isolation: Setiap merchant memiliki akun mandiri, Server Key (`SB-Mid-server-...`), Client Key (`SB-Mid-client-...`), dan Webhook Secret (`whsec_...`).
- Midtrans Core API Compatibility:
  - `POST /api/v1/charge` (atau `/v2/charge`) dengan HTTP Basic Auth `Authorization: Basic base64(server_key:)`.
  - `POST /api/v1/snap/transactions` checkout token generator.
  - `GET /api/v1/transactions/:order_id/status` status pengecekan transaksi real-time.
- Standar Biaya MDR 0.7%: Perhitungan otomatis MDR Bank Indonesia dan pencatatan laba bersih (net payout) per merchant ledger.
- Webhook Notifikasi Midtrans: SHA-512 Signature Key `SHA512(order_id + status_code + gross_amount + server_key)`.
- Merchant Portal UI: Dashboard modern berbasis web (`/admin`) dengan analitik transaksi, generator payment link, manajemen kredensial API, dan webhook testing simulator.
- Proteksi OWASP Enterprise: Anti-Clickjacking framebusting, HTTP security headers, sanitasi SSRF private IP, proteksi DoS CWE-400 (maks 1MB), dan rate limiting.

## Langkah Cepat Deploy ke Vercel
1. Import repositori ini di Vercel Dashboard.
2. Hubungkan Upstash Redis via integrasi Vercel Marketplace (menyediakan `UPSTASH_REDIS_REST_URL` dan `UPSTASH_REDIS_REST_TOKEN`).
3. Konfigurasi Environment Variables di Vercel:
   - `API_KEY`: Server key platform default (contoh: `SB-Mid-server-platform-key`)
   - `ADMIN_PASSWORD`: Kata sandi master administrator portal
   - `WEBHOOK_SECRET`: Secret key default webhook platform
   - `ENCRYPTION_KEY`: 64 hex acak untuk enkripsi token provider
   - `BASE_URL`: URL deployment Vercel Anda (contoh: `https://qrispay.vercel.app`)
4. Klik Deploy.

## Dokumentasi API Singkat

### 1. Registrasi Merchant Baru
```bash
curl -X POST https://qrispay.vercel.app/api/saas/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Toko Berkah",
    "email": "owner@tokoberkah.com",
    "password": "PasswordKuat123",
    "phone": "081234567890"
  }'
```

### 2. Core API Charge (Standar Midtrans)
```bash
curl -X POST https://qrispay.vercel.app/api/v1/charge \
  -u "SB-Mid-server-your-key:" \
  -H "Content-Type: application/json" \
  -d '{
    "payment_type": "qris",
    "transaction_details": {
      "order_id": "ORDER-1001",
      "gross_amount": 50000
    },
    "customer_details": {
      "first_name": "Budi",
      "email": "budi@example.com"
    }
  }'
```

### 3. Snap Checkout Transaction
```bash
curl -X POST https://qrispay.vercel.app/api/v1/snap/transactions \
  -H "Authorization: Bearer SB-Mid-server-your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "transaction_details": {
      "order_id": "SNAP-1001",
      "gross_amount": 75000
    }
  }'
```

### 4. Pengecekan Status Transaksi
```bash
curl -X GET https://qrispay.vercel.app/api/v1/transactions/ORDER-1001/status \
  -u "SB-Mid-server-your-key:"
```

### 5. Verifikasi Webhook Signature (Midtrans SHA-512)
Format signature key yang dikirim dalam payload webhook:
`signature_key = SHA512(order_id + status_code + gross_amount + server_key)`
