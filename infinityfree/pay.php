<?php
/**
 * pay.php - Halaman Checkout QRIS (Pure PHP Edition)
 */

require_once __DIR__ . '/Database.php';

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
}

$id = $_GET['id'] ?? '';
$p = Database::getPayment($id);

if (!$p) {
    http_response_code(404);
    echo '<!DOCTYPE html><html><body style="font-family:sans-serif; text-align:center; padding:50px;"><h1>404 Tagihan Tidak Ditemukan</h1></body></html>';
    exit;
}

$qrString = urlencode($p['qris_string']);
$qrImgUrl = "https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=" . $qrString;
?>
<!DOCTYPE html>
<html lang="id" data-theme="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Bayar Tagihan <?php echo htmlspecialchars($p['order_id'] ?: $p['id']); ?></title>
  <script>
    if (window.top !== window.self) {
      window.top.location = window.self.location.href;
    }
  </script>
  <style>
    :root {
      --bg: #f8fafc; --surface: #ffffff; --border: #e2e8f0;
      --text: #0f172a; --text-muted: #64748b; --primary: #0f172a;
      --accent: #2563eb; --radius: 8px; --success: #16a34a; --warning: #d97706;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); padding: 32px 16px; }
    .card { max-width: 440px; margin: 0 auto; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 28px; text-align: center; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 99px; font-size: 11px; font-weight: 700; background: #fffbeb; color: var(--warning); border: 1px solid #fde68a; }
    .price { font-size: 36px; font-weight: 800; letter-spacing: -0.03em; margin: 8px 0; }
    .btn { display: inline-flex; align-items: center; justify-content: center; width: 100%; height: 44px; border-radius: 6px; font-weight: 600; font-size: 14px; cursor: pointer; text-decoration: none; border: none; background: var(--primary); color: #fff; margin-top: 16px; }
    .qr-box { background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin: 16px 0; }
    .qr-box img { width: 100%; max-width: 280px; height: auto; display: block; margin: 0 auto; }
  </style>
</head>
<body>
  <div class="card">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <span style="font-size:12px; font-weight:600; color:var(--text-muted);"><?php echo htmlspecialchars($p['order_id'] ?: $p['id']); ?></span>
      <span class="badge" id="statusBadge"><?php echo strtoupper($p['status']); ?></span>
    </div>

    <div style="font-size:13px; color:var(--text-muted);">Total Pembayaran</div>
    <div class="price">Rp <?php echo number_format($p['total'], 0, ',', '.'); ?></div>

    <div style="font-size:12px; color:var(--warning); background:#fffbeb; border:1px solid #fde68a; border-radius:6px; padding:8px; margin:12px 0;">
      Termasuk kode unik <b>Rp <?php echo number_format($p['unique_code'], 0, ',', '.'); ?></b>. Transfer tepat sesuai nominal.
    </div>

    <div class="qr-box">
      <img src="<?php echo $qrImgUrl; ?>" alt="QRIS Dinamis">
    </div>

    <div style="font-size:12px; color:var(--text-muted); margin-bottom:16px;">
      Batas Waktu: <b id="timer">--:--</b>
    </div>

    <button class="btn" id="checkBtn" onclick="checkStatus(true)">Cek Status Pembayaran</button>
  </div>

  <script>
    const exp = <?php echo (int)$p['expires_at']; ?> * 1000;
    const id = "<?php echo htmlspecialchars($p['id']); ?>";
    let isPaid = "<?php echo $p['status']; ?>" === "paid";
    let pollTimer = null;

    function updateTimer() {
      if (isPaid) return;
      const diff = Math.max(0, Math.floor((exp - Date.now()) / 1000));
      const m = Math.floor(diff / 60);
      const s = diff % 60;
      document.getElementById('timer').textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
      if (diff <= 0) {
        document.getElementById('statusBadge').textContent = 'EXPIRED';
        if (pollTimer) clearInterval(pollTimer);
      }
    }
    setInterval(updateTimer, 1000);
    updateTimer();

    async function checkStatus(isManual = false) {
      if (isPaid) return;
      const btn = document.getElementById('checkBtn');
      if (isManual && btn) {
        btn.disabled = true;
        btn.textContent = 'Memeriksa mutasi...';
      }

      try {
        const res = await fetch('/api/public/payments/' + id);
        const data = await res.json();
        const status = data.status || (data.data ? data.data.status : '');
        if (status === 'paid') {
          isPaid = true;
          if (pollTimer) clearInterval(pollTimer);
          const badge = document.getElementById('statusBadge');
          if (badge) {
            badge.textContent = 'PAID / LUNAS';
            badge.style.background = '#dcfce7';
            badge.style.color = '#15803d';
            badge.style.borderColor = '#86efac';
          }
          if (btn) {
            btn.textContent = 'Pembayaran Berhasil Diterima';
            btn.style.background = '#16a34a';
            btn.disabled = true;
          }
          if (isManual) alert('Pembayaran BERHASIL DITERIMA!');
        } else if (status === 'expired') {
          if (pollTimer) clearInterval(pollTimer);
          document.getElementById('statusBadge').textContent = 'EXPIRED';
        } else {
          if (isManual) alert('Status: Pembayaran Belum Terdeteksi');
        }
      } catch (err) {
        if (isManual) alert('Gagal mengecek status: ' + err.message);
      } finally {
        if (isManual && btn && !isPaid) {
          btn.disabled = false;
          btn.textContent = 'Cek Status Pembayaran';
        }
      }
    }

    if (!isPaid) {
      pollTimer = setInterval(() => checkStatus(false), 4000);
    }
  </script>
</body>
</html>
