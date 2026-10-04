# Qrispay — VPS / Dedicated Server Edition

Paket gateway QRIS lengkap untuk **VPS Linux (Ubuntu / Debian / CentOS)**, **Dedicated Server**, atau **Container Docker**.

## Opsi Deploy 1: Docker Compose (Direkomendasikan - 1 Command)

1. Salin seluruh isi folder ini ke VPS Anda:
   ```bash
   scp -r vps/ user@ip-vps-anda:/var/www/qrispay
   ```
2. Di VPS, buat file `.env`:
   ```bash
   cd /var/www/qrispay
   cp .env.example .env
   nano .env
   ```
3. Jalankan dengan Docker Compose:
   ```bash
   docker compose up -d
   ```
   Web server (port 3000) dan background reconcile worker otomatis berjalan mandiri di latar belakang.

---

## Opsi Deploy 2: PM2 + Node.js Langsung

1. Install dependensi production:
   ```bash
   npm install --production
   ```
2. Jalankan server dan worker dengan PM2:
   ```bash
   npm install -g pm2
   pm2 start ecosystem.config.js
   pm2 save
   pm2 startup
   ```
3. Pasang Nginx Reverse Proxy dan SSL gratis:
   - Salin file `nginx.conf` ke `/etc/nginx/sites-available/qrispay.conf`
   - Aktifkan: `ln -s /etc/nginx/sites-available/qrispay.conf /etc/nginx/sites-enabled/`
   - Install SSL: `certbot --nginx -d bayar.domainanda.com`
   - Reload Nginx: `systemctl reload nginx`

---

## Keunggulan di VPS:
- **Penyimpanan SQLite Native Berkecepatan Tinggi**: Menggunakan `node:sqlite` bawaan dengan mode WAL (`journal_mode = WAL`) di folder `data/`.
- **Auto Reconcile Daemon (`worker.js`)**: Memeriksa mutasi GoPay & ShopeePay setiap 12 detik di latar belakang tanpa henti.
- **Auto-Update Token**: Token GoPay diperbarui secara otomatis sebelum kedaluwarsa.
