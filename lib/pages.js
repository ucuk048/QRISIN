const QRCode = require('qrcode');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const rp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

const baseCss = `
:root {
  --bg: #f8fafc;
  --surface: #ffffff;
  --surface-alt: #f1f5f9;
  --surface-hover: #e2e8f0;
  --border: #e2e8f0;
  --border-strong: #cbd5e1;
  --text: #0f172a;
  --text-muted: #64748b;
  --text-subtle: #94a3b8;
  --primary: #0f172a;
  --primary-hover: #1e293b;
  --primary-fg: #ffffff;
  --accent: #2563eb;
  --accent-subtle: #eff6ff;
  --success: #16a34a;
  --success-bg: #f0fdf4;
  --success-border: #bbf7d0;
  --warning: #d97706;
  --warning-bg: #fffbeb;
  --warning-border: #fde68a;
  --danger: #dc2626;
  --danger-bg: #fef2f2;
  --danger-border: #fecaca;
  --radius: 8px;
  --radius-sm: 6px;
  --radius-lg: 12px;
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.04);
}

* { box-sizing: border-box; margin: 0; padding: 0; }
html { font-family: var(--font-sans); color: var(--text); background: var(--bg); -webkit-font-smoothing: antialiased; }
body { min-height: 100vh; display: flex; flex-direction: column; }

a { color: inherit; text-decoration: none; }
button, input, select, textarea { font: inherit; }

/* 2-Cluster Navigation */
.navbar {
  position: sticky; top: 0; z-index: 50;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--border);
  height: 64px;
}
.navbar-inner {
  max-width: 1200px; margin: 0 auto; height: 100%;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 20px;
}
.nav-cluster-left {
  display: flex; align-items: center; gap: 32px;
}
.brand {
  display: flex; align-items: center; gap: 10px;
  font-weight: 700; font-size: 18px; letter-spacing: -0.02em;
}
.brand-badge {
  font-size: 11px; font-weight: 600; padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: var(--surface-alt); color: var(--text-muted);
  border: 1px solid var(--border);
}
.nav-links {
  display: flex; align-items: center; gap: 24px;
  list-style: none;
}
.nav-link {
  font-size: 14px; font-weight: 500; color: var(--text-muted);
  transition: color 0.15s ease;
}
.nav-link:hover { color: var(--text); }
.nav-cluster-right {
  display: flex; align-items: center; gap: 12px;
}

/* 3-Line Hamburger */
.hamburger {
  display: none; width: 44px; height: 44px;
  background: transparent; border: 1px solid var(--border);
  border-radius: var(--radius-sm); cursor: pointer;
  flex-direction: column; justify-content: center; align-items: center; gap: 4px;
}
.hamburger span {
  display: block; width: 18px; height: 2px;
  background: var(--text); transition: transform 0.2s, opacity 0.2s;
}

/* Mobile Drawer */
.mobile-drawer {
  display: none; position: fixed; top: 64px; left: 0; right: 0;
  background: var(--surface); border-bottom: 1px solid var(--border);
  padding: 20px; box-shadow: var(--shadow-lg); z-index: 49;
}
.mobile-drawer.open { display: block; }
.mobile-drawer-links { display: flex; flex-direction: column; gap: 16px; }

/* Buttons */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 40px; padding: 8px 16px; border-radius: var(--radius-sm);
  font-size: 14px; font-weight: 600; cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s, color 0.15s;
  border: 1px solid transparent; text-decoration: none;
}
.btn-primary { background: var(--primary); color: var(--primary-fg); }
.btn-primary:hover { background: var(--primary-hover); }
.btn-secondary { background: var(--surface); border-color: var(--border-strong); color: var(--text); }
.btn-secondary:hover { background: var(--surface-alt); }
.btn-accent { background: var(--accent); color: #fff; }
.btn-accent:hover { background: #1d4ed8; }
.btn-sm { min-height: 32px; padding: 4px 10px; font-size: 13px; }
.btn-full { width: 100%; }

/* Card & Containers */
.card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-lg); box-shadow: var(--shadow-sm);
  padding: 24px;
}
.badge {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px; border-radius: 9999px;
  font-size: 12px; font-weight: 600;
}
.badge-pending { background: var(--warning-bg); color: var(--warning); border: 1px solid var(--warning-border); }
.badge-paid, .badge-settlement { background: var(--success-bg); color: var(--success); border: 1px solid var(--success-border); }
.badge-expired, .badge-expire, .badge-cancelled, .badge-cancel { background: var(--danger-bg); color: var(--danger); border: 1px solid var(--danger-border); }

/* Form */
.form-group { margin-bottom: 16px; display: flex; flex-direction: column; gap: 6px; }
.form-label { font-size: 13px; font-weight: 600; color: var(--text); }
.form-input {
  width: 100%; min-height: 40px; padding: 8px 12px;
  background: var(--surface); border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  color: var(--text); font-size: 14px; outline: none; transition: border-color 0.15s;
}
.form-input:focus { border-color: var(--primary); }
.form-hint { font-size: 12px; color: var(--text-muted); }

/* Tables */
.table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: var(--radius); }
table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
th { background: var(--surface-alt); padding: 10px 14px; font-weight: 600; color: var(--text-muted); border-bottom: 1px solid var(--border); }
td { padding: 12px 14px; border-bottom: 1px solid var(--border); }
tr:last-child td { border-bottom: none; }
tr:hover td { background: rgba(0, 0, 0, 0.015); }

/* Code box */
.code-box {
  background: #090d16; color: #f1f5f9; border-radius: var(--radius);
  padding: 16px; font-family: var(--font-mono); font-size: 13px;
  overflow-x: auto; line-height: 1.6; border: 1px solid #1e293b;
}

/* Footer */
.footer {
  margin-top: auto; border-top: 1px solid var(--border);
  background: var(--surface); padding: 32px 20px;
}
.footer-inner {
  max-width: 1200px; margin: 0 auto;
  display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 16px;
  font-size: 13px; color: var(--text-muted);
}

@media (max-width: 768px) {
  .nav-links, .nav-cluster-right .btn-desktop { display: none; }
  .hamburger { display: flex; }
  .btn, .form-input { min-height: 44px; }
}
`;

function shell(title, body, extraHead = '') {
  return `<!doctype html>
<html lang="id" data-theme="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%230f172a'><rect width='24' height='24' rx='6'/><path d='M7 7h4v4H7V7zm6 0h4v4h-4V7zm-6 6h4v4H7v-4zm6 2h2v2h-2v-2zm2-2h2v2h-2v-2zm-2 4h4v2h-4v-2z' fill='white'/></svg>">
  <style>${baseCss}</style>
  <script>
    if (window.top !== window.self) {
      window.top.location = window.self.location.href;
    }
  </script>
  ${extraHead}
</head>
<body>
  ${navbar()}
  <main style="flex:1;">
    ${body}
  </main>
  ${footer()}
  <script>
    function toggleMobileMenu() {
      const d = document.getElementById('mobileDrawer');
      if (d) d.classList.toggle('open');
    }
  </script>
</body>
</html>`;
}

function navbar() {
  return `
  <nav class="navbar">
    <div class="navbar-inner">
      <div class="nav-cluster-left">
        <a href="/" class="brand">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7" rx="1"></rect>
            <rect x="14" y="3" width="7" height="7" rx="1"></rect>
            <rect x="3" y="14" width="7" height="7" rx="1"></rect>
            <path d="M14 14h3v3h-3z"></path>
            <path d="M17 17h4v4h-4z"></path>
            <path d="M14 21h3"></path>
            <path d="M21 14v3"></path>
          </svg>
          <span>QRISPAY</span>
          <span class="brand-badge">SaaS Gateway</span>
        </a>
        <ul class="nav-links">
          <li><a href="/" class="nav-link">Beranda</a></li>
          <li><a href="/#features" class="nav-link">Fitur SaaS</a></li>
          <li><a href="/#pricing" class="nav-link">Biaya (0.7% MDR)</a></li>
          <li><a href="/docs" class="nav-link">Dokumentasi API</a></li>
          <li><a href="/admin" class="nav-link">Portal Merchant</a></li>
        </ul>
      </div>
      <div class="nav-cluster-right">
        <div style="display:flex; align-items:center; gap:8px; font-size:12px; font-weight:600; color:var(--success); margin-right:8px;">
          <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--success);"></span>
          Sistem Siap (BI 0.7%)
        </div>
        <a href="/docs" class="btn btn-secondary btn-sm btn-desktop">API Docs</a>
        <a href="/admin" class="btn btn-primary btn-sm btn-desktop">Portal Merchant</a>
        <button class="hamburger" aria-label="Menu" onclick="toggleMobileMenu()">
          <span></span><span></span><span></span>
        </button>
      </div>
    </div>
    <div class="mobile-drawer" id="mobileDrawer">
      <div class="mobile-drawer-links">
        <a href="/" class="nav-link">Beranda</a>
        <a href="/#features" class="nav-link">Fitur SaaS</a>
        <a href="/#pricing" class="nav-link">Biaya (0.7% MDR)</a>
        <a href="/docs" class="nav-link">Dokumentasi API</a>
        <a href="/admin" class="nav-link">Portal Merchant</a>
        <hr style="border:none; border-top:1px solid var(--border);">
        <a href="/docs" class="btn btn-secondary btn-full">Buka API Docs</a>
        <a href="/admin" class="btn btn-primary btn-full">Masuk Portal Merchant</a>
      </div>
    </div>
  </nav>`;
}

function footer() {
  return `
  <footer class="footer">
    <div class="footer-inner">
      <div>
        <span style="font-weight:700; color:var(--text);">QRISPAY</span> (qriskuu engine) - Infrastruktur Payment Gateway SaaS Multi-Tenant Indonesia.
      </div>
      <div style="display:flex; gap:16px;">
        <a href="/docs">Dokumentasi API</a>
        <a href="/admin">Portal Merchant</a>
        <a href="/#pricing">Biaya Layanan</a>
        <a href="https://github.com/ucuk048/QRISIN" target="_blank" rel="noopener">GitHub Repo</a>
      </div>
    </div>
  </footer>`;
}

// ----------------------------------------------------
// 1. LANDING PAGE (Midtrans/Stripe-tier SaaS Gateway)
// ----------------------------------------------------
function landing() {
  const content = `
  <section style="max-width:1200px; margin:0 auto; padding:60px 20px 80px;">
    <!-- Asymmetric Split Hero -->
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:48px; align-items:center;">
      <div>
        <div style="display:inline-flex; align-items:center; gap:8px; padding:6px 12px; background:var(--surface); border:1px solid var(--border); border-radius:999px; font-size:12px; font-weight:600; color:var(--text-muted); margin-bottom:20px;">
          <span style="width:6px; height:6px; border-radius:50%; background:var(--accent);"></span>
          Platform SaaS Payment Gateway Indonesia
        </div>
        <h1 style="font-size:clamp(32px, 5vw, 48px); font-weight:800; line-height:1.15; letter-spacing:-0.03em; color:var(--text); margin-bottom:18px;">
          Infrastruktur Payment Gateway QRIS Multi-Tenant
        </h1>
        <p style="font-size:16px; line-height:1.6; color:var(--text-muted); margin-bottom:28px;">
          Terima pembayaran QRIS real-time dari seluruh e-wallet & mobile banking Indonesia. Arsitektur multi-tenant serupa Midtrans & Stripe dengan biaya terendah flat 0.7% MDR Bank Indonesia, rekonsiliasi otomatis, dan integrasi API super cepat.
        </p>
        <div style="display:flex; flex-wrap:wrap; gap:12px; margin-bottom:36px;">
          <a href="/admin" class="btn btn-primary" style="padding:10px 22px; font-size:15px;">Daftar Merchant Gratis</a>
          <a href="#simulator" class="btn btn-secondary" style="padding:10px 22px; font-size:15px;">Coba Sandbox Simulator</a>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center;">
          <span style="font-size:12px; font-weight:600; color:var(--text-subtle);">Mendukung:</span>
          <span class="badge" style="background:#e0f2fe; color:#0369a1;">GoPay</span>
          <span class="badge" style="background:#ffedd5; color:#c2410c;">ShopeePay</span>
          <span class="badge" style="background:#dcfce7; color:#15803d;">BCA / Mandiri</span>
          <span class="badge" style="background:#f3e8ff; color:#7e22ce;">OVO / DANA</span>
          <span class="badge" style="background:var(--surface-alt); color:var(--text-muted);">Semua Bank QRIS</span>
        </div>
      </div>

      <!-- Live Interactive Snap Simulator Card -->
      <div id="simulator" class="card" style="padding:32px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <div>
            <h2 style="font-size:18px; font-weight:700;">Simulator Snap Checkout</h2>
            <p style="font-size:13px; color:var(--text-muted);">Uji alur pembuatan tagihan QRIS instan</p>
          </div>
          <span class="badge badge-pending">Midtrans Core Sandbox</span>
        </div>

        <form id="simForm" onsubmit="runSimulator(event)">
          <div class="form-group">
            <label class="form-label">Nominal Pembayaran (Rp)</label>
            <input type="number" id="simAmount" class="form-input" value="50000" min="1000" step="1000" required>
          </div>
          <div class="form-group">
            <label class="form-label">Order ID</label>
            <input type="text" id="simOrder" class="form-input" value="ORDER-SAAS-001">
          </div>
          <div class="form-group">
            <label class="form-label">Nama Pelanggan (Opsional)</label>
            <input type="text" id="simCustomer" class="form-input" value="Budi Santoso">
          </div>
          <button type="submit" class="btn btn-primary btn-full" id="simBtn">Buat Tagihan QRIS Instan</button>
        </form>

        <div id="simResult" style="display:none; margin-top:20px; padding-top:20px; border-top:1px solid var(--border);">
          <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:8px;">
            <span style="font-size:13px; color:var(--text-muted);">Total Pembayaran:</span>
            <span id="simTotal" style="font-size:22px; font-weight:800; color:var(--text);"></span>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--text-muted); margin-bottom:12px;">
            <span>Biaya MDR (0.7%): <b id="simMdr">Rp 350</b></span>
            <span>Net Payout Merchant: <b id="simNet" style="color:var(--success);">Rp 49.650</b></span>
          </div>
          <p id="simHint" style="font-size:12px; color:var(--text-muted); margin-bottom:14px;"></p>
          <div style="display:flex; gap:8px;">
            <a id="simLink" href="#" target="_blank" class="btn btn-accent btn-full btn-sm">Buka Halaman Checkout</a>
            <button type="button" class="btn btn-secondary btn-sm" onclick="simTriggerPaid()">Simulasi Lunas</button>
          </div>
          <div id="simPaidBanner" style="display:none; margin-top:12px; padding:10px; background:var(--success-bg); border:1px solid var(--success-border); border-radius:var(--radius-sm); font-size:12px; color:var(--success); font-weight:600; text-align:center;">
            Status Pembayaran Terverifikasi LUNAS (Settlement)
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- How It Works Architecture Pipeline -->
  <section style="background:var(--surface); border-top:1px solid var(--border); border-bottom:1px solid var(--border); padding:64px 20px;">
    <div style="max-width:1200px; margin:0 auto;">
      <div style="text-align:center; max-width:680px; margin:0 auto 48px;">
        <h2 style="font-size:28px; font-weight:700; letter-spacing:-0.02em; margin-bottom:12px;">Arsitektur Pembayaran Real-Time</h2>
        <p style="font-size:15px; color:var(--text-muted);">Alur kerja otomatis dari request API merchant hingga settlement dan webhook signature.</p>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:24px;">
        <div class="card">
          <div style="font-size:28px; font-weight:800; color:var(--accent); margin-bottom:8px;">01</div>
          <h3 style="font-size:16px; font-weight:700; margin-bottom:6px;">API Charge (Midtrans Core)</h3>
          <p style="font-size:13px; color:var(--text-muted); line-height:1.5;">Server merchant memanggil POST /api/v1/charge dengan Server Key dan detail pesanan.</p>
        </div>
        <div class="card">
          <div style="font-size:28px; font-weight:800; color:var(--accent); margin-bottom:8px;">02</div>
          <h3 style="font-size:16px; font-weight:700; margin-bottom:6px;">Dynamic QRIS Injection</h3>
          <p style="font-size:13px; color:var(--text-muted); line-height:1.5;">QRIS diinjeksi tag 54 nominal dinamis EMVCo dengan kode unik acak untuk diferensiasi transaksi.</p>
        </div>
        <div class="card">
          <div style="font-size:28px; font-weight:800; color:var(--accent); margin-bottom:8px;">03</div>
          <h3 style="font-size:16px; font-weight:700; margin-bottom:6px;">Deteksi Mutasi Otomatis</h3>
          <p style="font-size:13px; color:var(--text-muted); line-height:1.5;">Mesin rekonsiliasi mencocokkan mutasi masuk secara instan tanpa campur tangan staf administrasi.</p>
        </div>
        <div class="card">
          <div style="font-size:28px; font-weight:800; color:var(--accent); margin-bottom:8px;">04</div>
          <h3 style="font-size:16px; font-weight:700; margin-bottom:6px;">Webhook Bertanda Tangan</h3>
          <p style="font-size:13px; color:var(--text-muted); line-height:1.5;">Webhook berformat Midtrans bertanda tangan SHA-512 dikirim seketika ke URL toko Anda.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- 6 SaaS Core Pillars Bento Grid -->
  <section id="features" style="max-width:1200px; margin:0 auto; padding:64px 20px;">
    <div style="text-align:center; max-width:680px; margin:0 auto 44px;">
      <h2 style="font-size:28px; font-weight:700; letter-spacing:-0.02em; margin-bottom:12px;">Keunggulan Arsitektur SaaS</h2>
      <p style="font-size:15px; color:var(--text-muted);">Dibangun untuk platform modern yang membutuhkan skalabilitas, isolasi merchant, dan kehandalan tinggi.</p>
    </div>

    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:24px;">
      <div class="card" style="padding:24px;">
        <h3 style="font-size:17px; font-weight:700; margin-bottom:8px;">Isolasi Multi-Tenant Mandiri</h3>
        <p style="font-size:13px; color:var(--text-muted); line-height:1.6;">
          Setiap merchant mendapatkan Server Key, Client Key, dan Webhook Secret unik. Ledger transaksi, saldo bersih, dan webhook terisolasi 100% per akun merchant.
        </p>
      </div>

      <div class="card" style="padding:24px;">
        <h3 style="font-size:17px; font-weight:700; margin-bottom:8px;">Kompatibilitas Standar Midtrans</h3>
        <p style="font-size:13px; color:var(--text-muted); line-height:1.6;">
          Mendukung endpoint <code>POST /api/v1/charge</code>, Basic Auth header, format response status, dan algoritma signature SHA-512 standar industri pembayaran Indonesia.
        </p>
      </div>

      <div class="card" style="padding:24px;">
        <h3 style="font-size:17px; font-weight:700; margin-bottom:8px;">MDR Transparan Flat 0.7%</h3>
        <p style="font-size:13px; color:var(--text-muted); line-height:1.6;">
          Kalkulasi MDR otomatis sesuai regulasi resmi Bank Indonesia untuk QRIS. Tanpa biaya tersembunyi, tanpa komisi bulanan, dan tanpa biaya registrasi.
        </p>
      </div>

      <div class="card" style="padding:24px;">
        <h3 style="font-size:17px; font-weight:700; margin-bottom:8px;">Instant Payment Link & Invoicing</h3>
        <p style="font-size:13px; color:var(--text-muted); line-height:1.6;">
          Buat tautan invoice instan tanpa baris kode untuk dibagikan ke pelanggan via WhatsApp, Email, atau media sosial dengan tampilan checkout responsif.
        </p>
      </div>

      <div class="card" style="padding:24px;">
        <h3 style="font-size:17px; font-weight:700; margin-bottom:8px;">Keamanan Enterprise & Anti-Fraud</h3>
        <p style="font-size:13px; color:var(--text-muted); line-height:1.6;">
          Lolos audit OWASP ZAP: proteksi SSRF terhadap private network, proteksi DoS 1MB payload limit, framebusting anti-clickjacking, dan timing-safe signature comparison.
        </p>
      </div>

      <div class="card" style="padding:24px;">
        <h3 style="font-size:17px; font-weight:700; margin-bottom:8px;">Multi-Platform Deployment</h3>
        <p style="font-size:13px; color:var(--text-muted); line-height:1.6;">
          Siap dijalankan di Vercel Serverless, VPS Docker/PM2 dengan SQLite WAL, atau diunggah ke shared hosting PHP/InfinityFree dengan SDK resmi untuk Laravel & CodeIgniter.
        </p>
      </div>
    </div>
  </section>

  <!-- Pricing Comparison Section (Midtrans Style) -->
  <section id="pricing" style="background:var(--surface); border-top:1px solid var(--border); border-bottom:1px solid var(--border); padding:64px 20px;">
    <div style="max-width:1200px; margin:0 auto;">
      <div style="text-align:center; max-width:680px; margin:0 auto 44px;">
        <h2 style="font-size:28px; font-weight:700; letter-spacing:-0.02em; margin-bottom:12px;">Skema Biaya Jujur & Transparan</h2>
        <p style="font-size:15px; color:var(--text-muted);">Sama seperti standar industri pembayaran nasional: bayar hanya ketika menerima transaksi sukses.</p>
      </div>

      <div style="max-width:540px; margin:0 auto;">
        <div class="card" style="padding:36px; border:2px solid var(--primary); text-align:center;">
          <div style="font-size:13px; font-weight:700; color:var(--accent); text-transform:uppercase; margin-bottom:8px;">Standard QRIS Merchant</div>
          <div style="display:flex; justify-content:center; align-items:baseline; gap:6px; margin-bottom:16px;">
            <span style="font-size:48px; font-weight:800; color:var(--text);">0.7%</span>
            <span style="font-size:14px; color:var(--text-muted);">/ transaksi sukses</span>
          </div>
          <p style="font-size:14px; color:var(--text-muted); margin-bottom:24px;">
            Sesuai regulasi MDR (Merchant Discount Rate) resmi Bank Indonesia untuk kategori usaha reguler.
          </p>
          <ul style="list-style:none; text-align:left; font-size:14px; color:var(--text); margin-bottom:28px; display:flex; flex-direction:column; gap:12px;">
            <li style="display:flex; align-items:center; gap:10px;">
              <span style="color:var(--success); font-weight:700;">&#10003;</span> Rp 0 Biaya Pendaftaran Akun
            </li>
            <li style="display:flex; align-items:center; gap:10px;">
              <span style="color:var(--success); font-weight:700;">&#10003;</span> Rp 0 Biaya Pemeliharaan Bulanan
            </li>
            <li style="display:flex; align-items:center; gap:10px;">
              <span style="color:var(--success); font-weight:700;">&#10003;</span> Akses Penuh API & Webhook Realtime
            </li>
            <li style="display:flex; align-items:center; gap:10px;">
              <span style="color:var(--success); font-weight:700;">&#10003;</span> Sandbox Testing & Live Environment
            </li>
            <li style="display:flex; align-items:center; gap:10px;">
              <span style="color:var(--success); font-weight:700;">&#10003;</span> Dashboard Merchant & Generator Link Bayar
            </li>
          </ul>
          <a href="/admin" class="btn btn-primary btn-full" style="min-height:44px; font-size:15px;">Daftar Akun Merchant Sekarang</a>
        </div>
      </div>
    </div>
  </section>

  <!-- Interactive Code Examples (Midtrans Format) -->
  <section style="max-width:1200px; margin:0 auto; padding:64px 20px;">
    <div style="text-align:center; max-width:640px; margin:0 auto 36px;">
      <h2 style="font-size:28px; font-weight:700; letter-spacing:-0.02em; margin-bottom:12px;">Integrasi API Standar Midtrans</h2>
      <p style="font-size:15px; color:var(--text-muted);">Panggil API pembayaran dengan Basic Auth Server Key atau SDK siap pakai.</p>
    </div>

    <div class="card" style="padding:0; overflow:hidden;">
      <div style="display:flex; background:var(--surface-alt); border-bottom:1px solid var(--border); padding:8px 16px; gap:8px; overflow-x:auto;">
        <button class="btn btn-sm btn-secondary" onclick="setLang('curl')">cURL (Midtrans)</button>
        <button class="btn btn-sm btn-secondary" onclick="setLang('node')">Node.js</button>
        <button class="btn btn-sm btn-secondary" onclick="setLang('php')">PHP Native</button>
        <button class="btn btn-sm btn-secondary" onclick="setLang('laravel')">Laravel</button>
        <button class="btn btn-sm btn-secondary" onclick="setLang('python')">Python</button>
      </div>
      <div style="padding:20px;">
        <pre class="code-box" id="codeSnippet"></pre>
      </div>
    </div>
  </section>

  <script>
    const snippets = {
      curl: \`# Panggilan Standar Midtrans Core API
curl -X POST https://domain-anda.com/api/v1/charge \\\\
  -u "SB-Mid-server-YOUR_SERVER_KEY:" \\\\
  -H "Content-Type: application/json" \\\\
  -d '{
    "payment_type": "qris",
    "transaction_details": {
      "order_id": "ORDER-101",
      "gross_amount": 50000
    },
    "customer_details": {
      "first_name": "Budi",
      "email": "budi@example.com"
    }
  }'\`,
      node: \`// Node.js (Fetch Native)
const serverKey = 'SB-Mid-server-YOUR_SERVER_KEY';
const authHeader = 'Basic ' + Buffer.from(serverKey + ':').toString('base64');

const response = await fetch('https://domain-anda.com/api/v1/charge', {
  method: 'POST',
  headers: {
    'Authorization': authHeader,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    payment_type: 'qris',
    transaction_details: {
      order_id: 'ORDER-101',
      gross_amount: 50000
    },
    customer_details: {
      first_name: 'Budi',
      email: 'budi@example.com'
    }
  })
});
const result = await response.json();
console.log('Tautan Bayar QRIS:', result.payment_url);\`,
      php: \`<?php
// PHP Native cURL
$serverKey = 'SB-Mid-server-YOUR_SERVER_KEY';
$payload = [
    'payment_type' => 'qris',
    'transaction_details' => [
        'order_id' => 'ORDER-101',
        'gross_amount' => 50000
    ],
    'customer_details' => [
        'first_name' => 'Budi',
        'email' => 'budi@example.com'
    ]
];

$ch = curl_init('https://domain-anda.com/api/v1/charge');
curl_setopt($ch, CURLOPT_USERPWD, $serverKey . ':');
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$response = json_decode(curl_exec($ch), true);
curl_close($ch);

echo "Tautan Bayar: " . $response['payment_url'];\`,
      laravel: \`// Controller Laravel
namespace App\\\\Http\\\\Controllers;
use Illuminate\\\\Http\\\\Request;
use Illuminate\\\\Support\\\\Facades\\\\Http;

class CheckoutController extends Controller
{
    public function pay(Request $request)
    {
        $serverKey = config('services.qrispay.server_key');
        
        $response = Http::withBasicAuth($serverKey, '')
            ->post('https://domain-anda.com/api/v1/charge', [
                'payment_type' => 'qris',
                'transaction_details' => [
                    'order_id' => 'ORDER-' . time(),
                    'gross_amount' => 50000,
                ],
                'customer_details' => [
                    'first_name' => $request->user()->name,
                    'email' => $request->user()->email,
                ],
            ]);

        $data = $response->json();
        return redirect($data['payment_url']);
    }
}\`,
      python: \`import requests

server_key = "SB-Mid-server-YOUR_SERVER_KEY"
payload = {
    "payment_type": "qris",
    "transaction_details": {
        "order_id": "ORDER-101",
        "gross_amount": 50000
    },
    "customer_details": {
        "first_name": "Budi",
        "email": "budi@example.com"
    }
}

r = requests.post("https://domain-anda.com/api/v1/charge", json=payload, auth=(server_key, ""))
data = r.json()
print("Tautan Bayar:", data["payment_url"])\`
    };

    function setLang(l) {
      document.getElementById('codeSnippet').textContent = snippets[l] || snippets.curl;
    }
    setLang('curl');

    let currentSimPayId = null;

    async function runSimulator(e) {
      e.preventDefault();
      const btn = document.getElementById('simBtn');
      btn.textContent = 'Membuat Tagihan QRIS...';
      btn.disabled = true;

      const amt = parseInt(document.getElementById('simAmount').value, 10);
      const ord = document.getElementById('simOrder').value;
      const cust = document.getElementById('simCustomer').value;

      try {
        const res = await fetch('/api/public/simulate-create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: amt, order_id: ord, customer: cust })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Gagal simulasi');

        currentSimPayId = data.id;
        document.getElementById('simTotal').textContent = 'Rp ' + Number(data.total).toLocaleString('id-ID');
        const mdr = Math.ceil(data.total * 0.007);
        document.getElementById('simMdr').textContent = 'Rp ' + mdr.toLocaleString('id-ID');
        document.getElementById('simNet').textContent = 'Rp ' + (data.total - mdr).toLocaleString('id-ID');

        document.getElementById('simHint').textContent = 'Injeksi EMVCo tag 54: Rp ' + data.total + ' (Termasuk kode unik Rp ' + data.unique_code + '). Berlaku 15 menit.';
        const link = document.getElementById('simLink');
        link.href = data.payment_link;
        link.textContent = 'Buka Halaman Checkout (' + data.id + ')';
        document.getElementById('simPaidBanner').style.display = 'none';
        document.getElementById('simResult').style.display = 'block';
      } catch (err) {
        alert(err.message);
      } finally {
        btn.textContent = 'Buat Tagihan QRIS Instan';
        btn.disabled = false;
      }
    }

    async function simTriggerPaid() {
      if (!currentSimPayId) return;
      try {
        await fetch('/api/public/payments/' + currentSimPayId);
        document.getElementById('simPaidBanner').style.display = 'block';
      } catch (err) {
        alert('Gagal trigger status: ' + err.message);
      }
    }
  </script>
  `;
  return shell('QRISPAY - Gateway Pembayaran QRIS Multi-Tenant Indonesia', content);
}

// ----------------------------------------------------
// 2. PAYMENT / CHECKOUT PAGE (/pay/:id & /qr/:id)
// ----------------------------------------------------
async function payPage(p) {
  const qr = await QRCode.toDataURL(p.qris_string, { margin: 1, width: 440, errorCorrectionLevel: 'M' });

  const content = `
  <div style="max-width:480px; margin:32px auto; padding:0 16px;">
    <div class="card" style="padding:28px; text-align:center;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <span class="badge" style="background:var(--surface-alt); color:var(--text); border:1px solid var(--border);">
          ${esc(p.order_id || p.id)}
        </span>
        <span id="statusBadge" class="badge badge-${p.status}">
          ${p.status.toUpperCase()}
        </span>
      </div>

      <div style="font-size:13px; color:var(--text-muted); margin-bottom:4px;">
        ${esc(p.description || 'Pembayaran Tagihan')}
      </div>
      <div style="font-size:32px; font-weight:800; letter-spacing:-0.03em; color:var(--text); margin-bottom:4px;">
        ${rp(p.total)}
      </div>

      ${p.unique_code > 0 ? `
      <div style="font-size:12px; color:var(--text-muted); margin-bottom:20px;">
        (Nominal Rp ${p.amount.toLocaleString('id-ID')} + Kode Unik Rp ${p.unique_code})
      </div>` : '<div style="margin-bottom:20px;"></div>'}

      <!-- QR Display Box -->
      <div id="qrBox" style="background:var(--surface-alt); border:1px solid var(--border); border-radius:var(--radius); padding:16px; margin-bottom:20px; display:inline-block;">
        <img src="${qr}" alt="QRIS QR Code" style="width:260px; height:260px; display:block; margin:0 auto; border-radius:4px;">
      </div>

      <!-- Expiry Countdown -->
      <div id="countdownBox" style="margin-bottom:20px;">
        <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--text-muted); margin-bottom:6px;">
          <span>Sisa Waktu Pembayaran</span>
          <span id="countdownTimer" style="font-weight:700; color:var(--danger); font-family:var(--font-mono);">15:00</span>
        </div>
        <div style="width:100%; height:6px; background:var(--surface-alt); border-radius:999px; overflow:hidden;">
          <div id="progressBar" style="width:100%; height:100%; background:var(--danger); transition:width 1s linear;"></div>
        </div>
      </div>

      <!-- Action Button -->
      <div style="display:flex; flex-direction:column; gap:10px;">
        <button id="checkBtn" class="btn btn-primary btn-full" onclick="manualCheck()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
          </svg>
          Cek Status Pembayaran
        </button>
        <a href="/qr/${p.id}?raw=1" target="_blank" class="btn btn-secondary btn-full btn-sm">Unduh QR Code</a>
      </div>

      <!-- Security Notice -->
      <p style="font-size:11px; color:var(--text-subtle); margin-top:20px; line-height:1.4;">
        Scan dengan BCA, Mandiri, BRI, BNI, GoPay, OVO, Dana, ShopeePay, LinkAja, atau aplikasi m-Banking apa pun yang mendukung QRIS.
      </p>
    </div>
  </div>

  <script>
    const exp = ${p.expires_at};
    const start = ${p.created_at};
    const id = ${JSON.stringify(p.id)};
    let pollTimer = null;

    function updateCountdown() {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((exp - now) / 1000));
      const m = Math.floor(diff / 60);
      const s = diff % 60;
      const el = document.getElementById('countdownTimer');
      if (el) el.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');

      const totalSec = Math.max(1, Math.floor((exp - start) / 1000));
      const pct = Math.max(0, Math.min(100, (diff / totalSec) * 100));
      const bar = document.getElementById('progressBar');
      if (bar) bar.style.width = pct + '%';

      if (diff <= 0) {
        markExpired();
      }
    }
    setInterval(updateCountdown, 1000);
    updateCountdown();

    async function checkStatus(isManual = false) {
      const btn = document.getElementById('checkBtn');
      if (isManual && btn) {
        btn.disabled = true;
        btn.textContent = 'Memeriksa mutasi...';
      }

      try {
        const res = await fetch('/api/public/payments/' + id);
        const data = await res.json();
        const badge = document.getElementById('statusBadge');
        if (badge) {
          badge.textContent = data.status.toUpperCase();
          badge.className = 'badge badge-' + data.status;
        }

        if (data.status === 'paid') {
          markPaid();
        } else if (data.status === 'expired' || data.status === 'cancelled') {
          markExpired();
        }
      } catch (err) {
        console.error('Poll failed:', err);
      } finally {
        if (isManual && btn) {
          btn.disabled = false;
          btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg> Cek Status Pembayaran';
        }
      }
    }

    function manualCheck() {
      checkStatus(true);
    }

    function toggleAutoPoll(enabled) {
      if (pollTimer) clearInterval(pollTimer);
      if (enabled) {
        pollTimer = setInterval(() => checkStatus(false), 5000);
      }
    }

    function markPaid() {
      if (pollTimer) clearInterval(pollTimer);
      const box = document.getElementById('qrBox');
      if (box) {
        box.innerHTML = \`
          <div style="padding:24px 12px; color:var(--success);">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin:0 auto 12px;">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            <h3 style="font-size:18px; font-weight:700; color:var(--text); margin-bottom:6px;">Pembayaran Berhasil!</h3>
            <p style="font-size:13px; color:var(--text-muted);">Dana telah diverifikasi masuk ke rekening merchant.</p>
          </div>
        \`;
      }
      const count = document.getElementById('countdownBox');
      if (count) count.style.display = 'none';
      const btn = document.getElementById('checkBtn');
      if (btn) btn.style.display = 'none';
    }

    function markExpired() {
      if (pollTimer) clearInterval(pollTimer);
      const box = document.getElementById('qrBox');
      if (box) {
        box.innerHTML = \`
          <div style="padding:24px 12px; color:var(--danger);">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin:0 auto 12px;">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <h3 style="font-size:18px; font-weight:700; color:var(--text); margin-bottom:6px;">Pembayaran Kedaluwarsa</h3>
            <p style="font-size:13px; color:var(--text-muted);">Waktu pembayaran telah habis. Silakan buat pesanan baru.</p>
          </div>
        \`;
      }
    }

    if (${JSON.stringify(p.status)} === 'paid') {
      markPaid();
    } else if (${JSON.stringify(p.status)} === 'expired' || ${JSON.stringify(p.status)} === 'cancelled') {
      markExpired();
    } else {
      toggleAutoPoll(true);
    }
  </script>
  `;

  return shell(`Pembayaran ${p.id}`, content);
}

// ----------------------------------------------------
// 3. API DOCUMENTATION PAGE (/docs)
// ----------------------------------------------------
function docsPage() {
  const content = `
  <div style="max-width:1200px; margin:32px auto; padding:0 20px;">
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:32px; align-items:start;">
      <!-- Main Content -->
      <div style="grid-column: span 2;">
        <div style="margin-bottom:28px;">
          <h1 style="font-size:32px; font-weight:800; letter-spacing:-0.02em; margin-bottom:8px;">Dokumentasi API Payment Gateway</h1>
          <p style="font-size:15px; color:var(--text-muted);">
            Spesifikasi lengkap REST API untuk integrasi pembayaran QRIS dinamis multi-tenant, Snap checkout, dan webhook berstandar Midtrans.
          </p>
        </div>

        <!-- Authentication -->
        <div class="card" style="margin-bottom:24px;">
          <h2 style="font-size:18px; font-weight:700; margin-bottom:10px;">Autentikasi API</h2>
          <p style="font-size:14px; color:var(--text-muted); margin-bottom:14px;">
            Mendukung autentikasi standar industri perbankan & gateway pembayaran:
          </p>
          <pre class="code-box"># 1. Standar Midtrans (HTTP Basic Auth dengan Server Key):
Authorization: Basic base64(SB-Mid-server-XXXX:)

# 2. Standar Bearer Token:
Authorization: Bearer SB-Mid-server-XXXX

# 3. Header Kunci API Langsung:
X-Server-Key: SB-Mid-server-XXXX
X-API-Key: &lt;API_KEY&gt;</pre>
        </div>

        <!-- Endpoint: POST /api/v1/charge (Midtrans Core API) -->
        <div class="card" style="margin-bottom:24px;">
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
            <span class="badge" style="background:#1e293b; color:#fff;">POST</span>
            <span style="font-family:var(--font-mono); font-weight:700; font-size:15px;">/api/v1/charge</span>
            <span class="badge badge-paid">Midtrans Standard</span>
          </div>
          <p style="font-size:14px; color:var(--text-muted); margin-bottom:14px;">
            Membuat tagihan transaksi QRIS dinamis dengan alokasi kode unik acak dan kalkulasi MDR 0.7%.
          </p>

          <h3 style="font-size:13px; font-weight:700; margin-bottom:8px;">Request Body (JSON)</h3>
          <div class="table-wrap" style="margin-bottom:14px;">
            <table>
              <tr><th>Parameter</th><th>Tipe</th><th>Wajib</th><th>Keterangan</th></tr>
              <tr><td><code>payment_type</code></td><td>String</td><td>Ya</td><td>Isi dengan <code>"qris"</code></td></tr>
              <tr><td><code>transaction_details.order_id</code></td><td>String</td><td>Ya</td><td>ID unik pesanan dari toko Anda</td></tr>
              <tr><td><code>transaction_details.gross_amount</code></td><td>Integer</td><td>Ya</td><td>Nominal tagihan dalam Rupiah (min 1000)</td></tr>
              <tr><td><code>customer_details.first_name</code></td><td>String</td><td>Tidak</td><td>Nama pembeli</td></tr>
              <tr><td><code>customer_details.email</code></td><td>String</td><td>Tidak</td><td>Email pembeli</td></tr>
            </table>
          </div>

          <h3 style="font-size:13px; font-weight:700; margin-bottom:8px;">Contoh Response (201 Created)</h3>
          <pre class="code-box">{
  "status_code": "201",
  "status_message": "QRIS transaction is created",
  "transaction_id": "pay_9x8k2p1m0",
  "order_id": "ORDER-101",
  "merchant_id": "mid_7a8b9c",
  "gross_amount": "50123",
  "currency": "IDR",
  "payment_type": "qris",
  "transaction_status": "pending",
  "transaction_time": "2026-10-04T12:00:00.000Z",
  "qr_string": "00020101021226...",
  "qr_url": "/qr/pay_9x8k2p1m0?raw=1",
  "payment_url": "https://domain.com/pay/pay_9x8k2p1m0",
  "actions": [
    { "name": "generate-qr-code", "method": "GET", "url": "/qr/pay_9x8k2p1m0?raw=1" },
    { "name": "deeplink-checkout", "method": "GET", "url": "https://domain.com/pay/pay_9x8k2p1m0" }
  ]
}</pre>
        </div>

        <!-- Endpoint: GET /api/v1/transactions/:order_id/status -->
        <div class="card" style="margin-bottom:24px;">
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
            <span class="badge" style="background:#0284c7; color:#fff;">GET</span>
            <span style="font-family:var(--font-mono); font-weight:700; font-size:15px;">/api/v1/transactions/:order_id/status</span>
          </div>
          <p style="font-size:14px; color:var(--text-muted); margin-bottom:14px;">
            Memeriksa status pembayaran. Sistem secara otomatis mencocokkan mutasi rekening jika status masih <code>pending</code>.
          </p>
        </div>

        <!-- Endpoint: Webhook Signature -->
        <div class="card" style="margin-bottom:24px;">
          <h2 style="font-size:18px; font-weight:700; margin-bottom:10px;">Verifikasi Signature Webhook (SHA-512)</h2>
          <p style="font-size:14px; color:var(--text-muted); margin-bottom:14px;">
            Notifikasi pembayaran dikirim dengan signature standar Midtrans: <code>SHA512(order_id + status_code + gross_amount + ServerKey)</code>.
          </p>
          <pre class="code-box">// Verifikasi Signature di PHP
$serverKey = "SB-Mid-server-YOUR_SERVER_KEY";
$rawBody = file_get_contents('php://input');
$data = json_decode($rawBody, true);

$expectedSignature = hash('sha512', $data['order_id'] . $data['status_code'] . $data['gross_amount'] . $serverKey);

if (!hash_equals($expectedSignature, $data['signature_key'])) {
    http_response_code(401);
    exit('Invalid signature');
}

// Proses pesanan jika settlement
if ($data['transaction_status'] === 'settlement') {
    // Tandai pesanan lunas
}</pre>
        </div>
      </div>

      <!-- Live Interactive API Console -->
      <div>
        <div class="card" style="position:sticky; top:84px;">
          <h2 style="font-size:16px; font-weight:700; margin-bottom:6px;">Interactive API Tester</h2>
          <p style="font-size:12px; color:var(--text-muted); margin-bottom:16px;">Uji request langsung dengan Server Key</p>

          <div class="form-group">
            <label class="form-label">Server Key / API Key</label>
            <input type="text" id="testKey" class="form-input" placeholder="SB-Mid-server-XXXX atau API_KEY">
          </div>
          <div class="form-group">
            <label class="form-label">Endpoint</label>
            <select id="testEndpoint" class="form-input" onchange="adjustTestForm()">
              <option value="charge">POST /api/v1/charge (Midtrans)</option>
              <option value="snap">POST /api/v1/snap/transactions</option>
              <option value="create">POST /api/v1/payments</option>
              <option value="list">GET /api/v1/payments</option>
              <option value="status">GET /token-status</option>
            </select>
          </div>
          <div class="form-group" id="testBodyGroup">
            <label class="form-label">Request Body (JSON)</label>
            <textarea id="testBody" class="form-input" rows="5" style="font-family:var(--font-mono); font-size:12px;">{
  "payment_type": "qris",
  "transaction_details": {
    "order_id": "INV-LIVE-001",
    "gross_amount": 25000
  }
}</textarea>
          </div>
          <button class="btn btn-primary btn-full btn-sm" onclick="sendTestRequest()">Kirim Request</button>

          <div style="margin-top:16px;">
            <label class="form-label">Response:</label>
            <pre class="code-box" id="testOutput" style="font-size:11px; max-height:220px; margin-top:4px;">Klik "Kirim Request" untuk melihat hasil.</pre>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    function adjustTestForm() {
      const ep = document.getElementById('testEndpoint').value;
      const bg = document.getElementById('testBodyGroup');
      const tb = document.getElementById('testBody');
      if (ep === 'charge') {
        bg.style.display = 'flex';
        tb.value = JSON.stringify({
          payment_type: "qris",
          transaction_details: {
            order_id: "INV-TEST-" + Math.floor(Math.random() * 1000),
            gross_amount: 50000
          }
        }, null, 2);
      } else if (ep === 'snap') {
        bg.style.display = 'flex';
        tb.value = JSON.stringify({
          amount: 25000,
          order_id: "SNAP-" + Math.floor(Math.random() * 1000)
        }, null, 2);
      } else if (ep === 'create') {
        bg.style.display = 'flex';
        tb.value = JSON.stringify({
          amount: 25000,
          order_id: "INV-" + Math.floor(Math.random() * 1000)
        }, null, 2);
      } else {
        bg.style.display = 'none';
      }
    }

    async function sendTestRequest() {
      const key = document.getElementById('testKey').value;
      const ep = document.getElementById('testEndpoint').value;
      const out = document.getElementById('testOutput');
      out.textContent = 'Mengirim request...';

      let url = '/api/v1/charge';
      let method = 'POST';
      let body = undefined;

      if (ep === 'charge') {
        method = 'POST';
        url = '/api/v1/charge';
        try { body = document.getElementById('testBody').value; } catch {}
      } else if (ep === 'snap') {
        method = 'POST';
        url = '/api/v1/snap/transactions';
        try { body = document.getElementById('testBody').value; } catch {}
      } else if (ep === 'create') {
        method = 'POST';
        url = '/api/v1/payments';
        try { body = document.getElementById('testBody').value; } catch {}
      } else if (ep === 'list') {
        method = 'GET';
        url = '/api/v1/payments';
      } else if (ep === 'status') {
        method = 'GET';
        url = '/token-status';
      }

      try {
        const headers = { 'Content-Type': 'application/json' };
        if (key) {
          if (key.startsWith('SB-Mid-server-')) {
            headers['Authorization'] = 'Basic ' + btoa(key + ':');
          } else {
            headers['X-API-Key'] = key;
          }
        }

        const res = await fetch(url, {
          method,
          headers,
          body: method === 'POST' ? body : undefined
        });
        const json = await res.json();
        out.textContent = 'HTTP ' + res.status + '\\n' + JSON.stringify(json, null, 2);
      } catch (err) {
        out.textContent = 'Error: ' + err.message;
      }
    }
  </script>
  `;
  return shell('Dokumentasi API - QRISPAY SaaS', content);
}

// ----------------------------------------------------
// 4. MERCHANT PORTAL (/admin, /portal, /dashboard)
// ----------------------------------------------------
function admin() {
  const content = `
  <div style="max-width:1120px; margin:32px auto; padding:0 20px;">
    <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:16px; margin-bottom:24px;">
      <div>
        <div style="display:flex; align-items:center; gap:8px;">
          <h1 style="font-size:24px; font-weight:800; letter-spacing:-0.02em;">Admin Merchant Portal</h1>
          <span id="badgeEnv" class="badge" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd;">LIVE ENVIRONMENT</span>
        </div>
        <p id="portalSub" style="font-size:13px; color:var(--text-muted); margin-top:4px;">
          Kelola transaksi, kunci API per-merchant, konfigurasi webhook, dan generator payment link.
        </p>
      </div>

      <div id="authActions" style="display:none; gap:8px;">
        <button class="btn btn-secondary btn-sm" onclick="loadDashboard()">Muat Ulang</button>
        <button class="btn btn-secondary btn-sm" onclick="handleLogout()">Keluar</button>
      </div>
    </div>

    <!-- Multi-Tab Auth Card (Masuk vs Daftar) -->
    <div id="loginCard" class="card" style="max-width:460px; margin:40px auto; padding:32px;">
      <div style="display:flex; border-bottom:1px solid var(--border); margin-bottom:20px; gap:8px;">
        <button id="authTabLogin" class="btn btn-sm btn-primary" onclick="switchAuthTab('login')">Masuk Merchant</button>
        <button id="authTabRegister" class="btn btn-sm btn-secondary" onclick="switchAuthTab('register')">Daftar Akun Baru</button>
      </div>

      <!-- Form Login -->
      <form id="formLogin" onsubmit="handleLogin(event)">
        <h2 style="font-size:18px; font-weight:700; margin-bottom:6px;">Masuk ke Portal Merchant</h2>
        <p style="font-size:13px; color:var(--text-muted); margin-bottom:18px;">Akses dashboard keuangan dan kredensial API Anda.</p>
        <div class="form-group">
          <label class="form-label">Email Bisnis</label>
          <input type="email" id="loginEmail" class="form-input" placeholder="nama@perusahaan.com" required>
        </div>
        <div class="form-group">
          <label class="form-label">Password</label>
          <input type="password" id="loginPw" class="form-input" placeholder="Password akun" required>
        </div>
        <button type="submit" class="btn btn-primary btn-full" style="min-height:44px; margin-top:8px;">Masuk ke Dashboard</button>
        
        <div style="margin-top:16px; padding-top:16px; border-top:1px solid var(--border); text-align:center;">
          <button type="button" class="btn btn-secondary btn-full btn-sm" onclick="loginDemoDefault()">
            Login Demo 1-Klik (Platform Default)
          </button>
        </div>
        <p id="loginError" style="font-size:12px; color:var(--danger); margin-top:12px; display:none; text-align:center;"></p>
      </form>

      <!-- Form Register -->
      <form id="formRegister" onsubmit="handleRegister(event)" style="display:none;">
        <h2 style="font-size:18px; font-weight:700; margin-bottom:6px;">Pendaftaran Merchant Baru</h2>
        <p style="font-size:13px; color:var(--text-muted); margin-bottom:18px;">Dapatkan Server Key & Client Key instan untuk integrasi QRIS.</p>
        <div class="form-group">
          <label class="form-label">Nama Bisnis / Brand</label>
          <input type="text" id="regName" class="form-input" placeholder="Contoh: Toko Kopi Nusantara" required>
        </div>
        <div class="form-group">
          <label class="form-label">Email Bisnis</label>
          <input type="email" id="regEmail" class="form-input" placeholder="admin@tokokopi.com" required>
        </div>
        <div class="form-group">
          <label class="form-label">Nomor WhatsApp / HP (Opsional)</label>
          <input type="tel" id="regPhone" class="form-input" placeholder="08xxxxxxxxxx">
        </div>
        <div class="form-group">
          <label class="form-label">Password Akun (min. 6 karakter)</label>
          <input type="password" id="regPw" class="form-input" placeholder="Minimal 6 karakter" required minlength="6">
        </div>
        <button type="submit" class="btn btn-primary btn-full" style="min-height:44px; margin-top:8px;">Daftar Akun Merchant</button>
        <p id="regError" style="font-size:12px; color:var(--danger); margin-top:12px; display:none; text-align:center;"></p>
      </form>
    </div>

    <!-- Dashboard Main Area -->
    <div id="dashContent" style="display:none;">
      <!-- Merchant Info Ribbon -->
      <div class="card" style="padding:16px 20px; margin-bottom:24px; display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:12px; background:var(--surface-alt);">
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="width:40px; height:40px; border-radius:50%; background:var(--primary); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700;">
            <span id="merchantAvatar">M</span>
          </div>
          <div>
            <div style="font-weight:700; font-size:15px;" id="merchantBusinessName">Nama Merchant</div>
            <div style="font-size:12px; color:var(--text-muted);">
              ID: <code id="merchantIdCode" style="font-family:var(--font-mono); font-weight:600;">mid_default</code>
            </div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:16px;">
          <div style="text-align:right;">
            <div style="font-size:11px; font-weight:600; color:var(--text-muted);">MDR RATE</div>
            <div style="font-size:13px; font-weight:700; color:var(--accent);">0.7% Standar BI</div>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="switchNavTab('paymentLink')">Buat Link Bayar</button>
        </div>
      </div>

      <!-- Tab Navigation -->
      <div style="display:flex; border-bottom:1px solid var(--border); margin-bottom:24px; gap:8px; overflow-x:auto;">
        <button id="tabBtnOverview" class="btn btn-sm btn-primary" onclick="switchNavTab('overview')">Ringkasan & Analytics</button>
        <button id="tabBtnPayments" class="btn btn-sm btn-secondary" onclick="switchNavTab('payments')">Riwayat Transaksi</button>
        <button id="tabBtnIntegration" class="btn btn-sm btn-secondary" onclick="switchNavTab('integration')">Kredensial API & Webhook</button>
        <button id="tabBtnPaymentLink" class="btn btn-sm btn-secondary" onclick="switchNavTab('paymentLink')">Buat Payment Link</button>
        <button id="tabBtnProvider" class="btn btn-sm btn-secondary" onclick="switchNavTab('provider')">Pengaturan Provider</button>
        <button id="tabBtnLogs" class="btn btn-sm btn-secondary" onclick="switchNavTab('logs')">Log Gateway</button>
      </div>

      <!-- TAB 1: OVERVIEW -->
      <div id="panelOverview">
        <!-- 4 Metrics SaaS Cards -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:16px; margin-bottom:24px;">
          <div class="card" style="padding:18px;">
            <div style="font-size:12px; font-weight:600; color:var(--text-muted); margin-bottom:4px;">Total Volume Transaksi</div>
            <div id="statTotalGross" style="font-size:22px; font-weight:800; color:var(--text);">Rp 0</div>
            <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">Gross GMV Lunas</div>
          </div>
          <div class="card" style="padding:18px;">
            <div style="font-size:12px; font-weight:600; color:var(--text-muted); margin-bottom:4px;">Saldo Bersih Payout</div>
            <div id="statTotalNet" style="font-size:22px; font-weight:800; color:var(--success);">Rp 0</div>
            <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">Net setelah dipotong MDR</div>
          </div>
          <div class="card" style="padding:18px;">
            <div style="font-size:12px; font-weight:600; color:var(--text-muted); margin-bottom:4px;">Biaya MDR Terpotong (0.7%)</div>
            <div id="statTotalMdr" style="font-size:22px; font-weight:800; color:var(--warning);">Rp 0</div>
            <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">Potongan resmi Bank Indonesia</div>
          </div>
          <div class="card" style="padding:18px;">
            <div style="font-size:12px; font-weight:600; color:var(--text-muted); margin-bottom:4px;">Total Transaksi & Success Rate</div>
            <div id="statSuccessRate" style="font-size:22px; font-weight:800; color:var(--accent);">100%</div>
            <div style="font-size:11px; color:var(--text-muted); margin-top:4px;" id="statCountBreakdown">0 lunas / 0 pending</div>
          </div>
        </div>

        <!-- Quick Bill & Reconcile -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:24px; margin-bottom:24px;">
          <div class="card">
            <h2 style="font-size:16px; font-weight:700; margin-bottom:12px;">Buat Tagihan Cepat</h2>
            <form onsubmit="handleQuickCreate(event)">
              <div class="form-group">
                <label class="form-label">Nominal Pembayaran (Rp)</label>
                <input type="number" id="qcAmount" class="form-input" value="25000" min="1000" step="1000" required>
              </div>
              <div class="form-group">
                <label class="form-label">Order ID (Opsional)</label>
                <input type="text" id="qcOrder" class="form-input" placeholder="INV-2026-001">
              </div>
              <button type="submit" class="btn btn-primary btn-full btn-sm">Buat Tagihan QRIS</button>
              <div id="qcResult" style="font-size:12px; margin-top:8px;"></div>
            </form>
          </div>

          <div class="card">
            <h2 style="font-size:16px; font-weight:700; margin-bottom:12px;">Pengecekan Mutasi Otomatis</h2>
            <p style="font-size:13px; color:var(--text-muted); margin-bottom:16px;">
              Picu rekonsiliasi seketika untuk memeriksa seluruh tagihan pending terhadap mutasi rekening terkini.
            </p>
            <button class="btn btn-secondary btn-full" onclick="reconcileAll()">
              Pindai & Sinkronisasi Mutasi Pending
            </button>
            <p id="recMsg" style="font-size:12px; color:var(--text-muted); margin-top:10px;"></p>
          </div>
        </div>

        <!-- Recent 5 Payments Overview -->
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
            <h2 style="font-size:16px; font-weight:700;">Transaksi Terkini Merchant</h2>
            <button class="btn btn-secondary btn-sm" onclick="switchNavTab('payments')">Buka Semua</button>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID Transaksi</th>
                  <th>Order ID</th>
                  <th>Total Bruto</th>
                  <th>MDR (0.7%)</th>
                  <th>Net Payout</th>
                  <th>Status</th>
                  <th>Waktu</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody id="overviewPaymentsBody">
                <tr><td colspan="8" style="text-align:center; color:var(--text-muted);">Memuat data transaksi...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- TAB 2: DAFTAR TRANSAKSI LENGKAP -->
      <div id="panelPayments" style="display:none;">
        <div class="card">
          <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:12px; margin-bottom:16px;">
            <div style="display:flex; gap:6px;">
              <button class="btn btn-sm btn-secondary" onclick="filterStatus('all')">Semua</button>
              <button class="btn btn-sm btn-secondary" onclick="filterStatus('settlement')">Settlement (Lunas)</button>
              <button class="btn btn-sm btn-secondary" onclick="filterStatus('pending')">Pending</button>
              <button class="btn btn-sm btn-secondary" onclick="filterStatus('expire')">Expired</button>
            </div>
            <div style="display:flex; gap:8px;">
              <input type="text" id="searchTrx" class="form-input" placeholder="Cari Order ID / Trx ID..." oninput="searchPayments(this.value)" style="height:32px; font-size:13px; width:220px;">
            </div>
          </div>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID Transaksi</th>
                  <th>Order ID</th>
                  <th>Total Bruto</th>
                  <th>MDR (0.7%)</th>
                  <th>Net Payout</th>
                  <th>Status</th>
                  <th>Waktu</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody id="paymentsBody">
                <tr><td colspan="8" style="text-align:center; color:var(--text-muted);">Memuat data transaksi...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- TAB 3: KREDENSIAL API & WEBHOOK -->
      <div id="panelIntegration" style="display:none;">
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:24px; margin-bottom:24px;">
          <!-- API Keys Box -->
          <div class="card">
            <h2 style="font-size:16px; font-weight:700; margin-bottom:10px;">Kredensial API Merchant (Standar Midtrans)</h2>
            <p style="font-size:13px; color:var(--text-muted); margin-bottom:14px;">Gunakan kunci ini untuk memanggil endpoint pembayaran via backend atau widget frontend.</p>
            
            <div class="form-group">
              <label class="form-label">Server Key (Rahasia)</label>
              <div style="display:flex; gap:8px;">
                <input type="password" id="serverKeyInput" class="form-input" readonly value="Memuat..." style="font-family:var(--font-mono); font-size:12px;">
                <button class="btn btn-secondary btn-sm" onclick="toggleServerKeyVisibility()">Lihat</button>
                <button class="btn btn-primary btn-sm" onclick="copyServerKey()">Salin</button>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Client Key (Publik)</label>
              <div style="display:flex; gap:8px;">
                <input type="text" id="clientKeyInput" class="form-input" readonly value="Memuat..." style="font-family:var(--font-mono); font-size:12px;">
                <button class="btn btn-secondary btn-sm" onclick="copyClientKey()">Salin</button>
              </div>
            </div>

            <button class="btn btn-secondary btn-sm" style="margin-top:4px;" onclick="regenerateKeys()">Regenerasi Kunci API</button>
          </div>

          <!-- Webhook Config Section -->
          <div class="card">
            <h2 style="font-size:16px; font-weight:700; margin-bottom:10px;">Konfigurasi Webhook Merchant</h2>
            <form onsubmit="saveWebhookSettings(event)">
              <div class="form-group">
                <label class="form-label">URL Webhook Notifikasi</label>
                <input type="url" id="whUrl" class="form-input" placeholder="https://tokoanda.com/api/payment-callback" required>
              </div>
              <div class="form-group">
                <label class="form-label">Webhook Secret (HMAC-SHA256)</label>
                <input type="text" id="whSecret" class="form-input" placeholder="Secret otomatis terbuat" readonly style="font-family:var(--font-mono); font-size:12px;">
              </div>
              <button type="submit" class="btn btn-primary btn-sm">Simpan Pengaturan Webhook</button>
              <p id="whSaveMsg" style="font-size:12px; margin-top:8px;"></p>
            </form>
          </div>
        </div>

        <!-- Webhook Simulator Box -->
        <div class="card">
          <h2 style="font-size:16px; font-weight:700; margin-bottom:10px;">Simulator Test Ping Webhook</h2>
          <p style="font-size:13px; color:var(--text-muted); margin-bottom:14px;">
            Kirimkan simulasi event <code>settlement</code> berformat Midtrans bertanda tangan SHA-512 ke URL webhook toko Anda untuk menguji respons server secara live.
          </p>
          <div style="display:flex; gap:12px; align-items:center; margin-bottom:12px;">
            <button class="btn btn-accent btn-sm" id="btnTestWebhook" onclick="testWebhookPing()">Kirim Test Ping Notifikasi</button>
            <span id="testWhStatus" style="font-size:12px; font-weight:600;"></span>
          </div>
          <div>
            <label class="form-label">Respons Server Toko Anda:</label>
            <pre class="code-box" id="whResponseBox" style="font-size:11px; max-height:160px; margin-top:4px;">Belum ada pengujian.</pre>
          </div>
        </div>
      </div>

      <!-- TAB 4: BUAT PAYMENT LINK -->
      <div id="panelPaymentLink" style="display:none;">
        <div style="max-width:560px; margin:0 auto;">
          <div class="card">
            <h2 style="font-size:18px; font-weight:700; margin-bottom:6px;">Generator Payment Link Instan</h2>
            <p style="font-size:13px; color:var(--text-muted); margin-bottom:20px;">
              Buat invoice tagihan QRIS instan tanpa menulis kode program untuk dibagikan langsung ke pelanggan.
            </p>
            <form onsubmit="handleGeneratePaymentLink(event)">
              <div class="form-group">
                <label class="form-label">Nominal Pembayaran (Rp)</label>
                <input type="number" id="plAmount" class="form-input" placeholder="Contoh: 100000" min="1000" step="1000" required>
              </div>
              <div class="form-group">
                <label class="form-label">Nomor Invoice / Order ID (Opsional)</label>
                <input type="text" id="plOrder" class="form-input" placeholder="INV-2026-001">
              </div>
              <div class="form-group">
                <label class="form-label">Nama Pelanggan (Opsional)</label>
                <input type="text" id="plCustomer" class="form-input" placeholder="Nama pembeli">
              </div>
              <div class="form-group">
                <label class="form-label">Deskripsi / Catatan Pembelian</label>
                <input type="text" id="plDesc" class="form-input" placeholder="Contoh: Pembelian Paket Hosting">
              </div>
              <button type="submit" id="plBtn" class="btn btn-primary btn-full" style="min-height:44px;">Buat Tautan Bayar</button>
            </form>

            <div id="plResultBox" style="display:none; margin-top:20px; padding-top:20px; border-top:1px solid var(--border);">
              <div class="form-group">
                <label class="form-label">Tautan Checkout Siap Dibagikan:</label>
                <div style="display:flex; gap:8px;">
                  <input type="text" id="plGeneratedUrl" class="form-input" readonly>
                  <button type="button" class="btn btn-secondary btn-sm" onclick="copyPaymentLink()">Salin</button>
                </div>
              </div>
              <a id="plPreviewLink" href="#" target="_blank" class="btn btn-accent btn-full btn-sm">Buka Halaman Checkout</a>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB 5: PENGATURAN PROVIDER -->
      <div id="panelProvider" style="display:none;">
        <div class="card">
          <h2 style="font-size:16px; font-weight:700; margin-bottom:14px;">Pengaturan Channel & Provider Merchant</h2>
          <p style="font-size:13px; color:var(--text-muted); margin-bottom:20px;">
            Pilih apakah akun merchant Anda menggunakan pool provider bersama platform, atau menghubungkan akun GoPay/Shopee/QRIS statis Anda sendiri.
          </p>

          <div style="display:flex; border-bottom:1px solid var(--border); margin-bottom:16px; gap:8px;">
            <button class="btn btn-sm btn-secondary" onclick="switchProvTab('platform')">Platform Shared Pool</button>
            <button class="btn btn-sm btn-secondary" onclick="switchProvTab('customqris')">QRIS Statis Sendiri</button>
            <button class="btn btn-sm btn-secondary" onclick="switchProvTab('gopay')">GoBiz Merchant</button>
          </div>

          <div id="tabPlatform">
            <p style="font-size:13px; color:var(--text-muted); margin-bottom:14px;">
              Menggunakan pool koneksi gateway bawaan server untuk pencocokan otomatis. Anda tidak perlu mengonfigurasi perangkat keras atau kredensial tambahan.
            </p>
            <button class="btn btn-primary btn-sm" onclick="saveProviderPlatform()">Aktifkan Platform Pool</button>
          </div>

          <div id="tabCustomQris" style="display:none;">
            <p style="font-size:13px; color:var(--text-muted); margin-bottom:14px;">
              Masukkan raw payload string QRIS statis dari rekening bank toko Anda (BCA, Mandiri, BRI, Danamon, Nobu, dll).
            </p>
            <div class="form-group">
              <label class="form-label">Raw String QRIS Statis</label>
              <textarea id="provCustomQris" class="form-input" rows="3" placeholder="00020101021126..."></textarea>
            </div>
            <button class="btn btn-primary btn-sm" onclick="saveCustomQris()">Simpan QRIS Statis</button>
          </div>

          <div id="tabGopay" style="display:none;">
            <p style="font-size:13px; color:var(--text-muted); margin-bottom:14px;">
              Hubungkan akun GoBiz Merchant untuk membaca mutasi otomatis akun Anda sendiri.
            </p>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:12px; margin-bottom:12px;">
              <div>
                <label class="form-label">Nomor HP GoBiz</label>
                <input type="text" id="gpPhone" class="form-input" placeholder="08xxxxxxxxxx">
                <button class="btn btn-secondary btn-sm" style="margin-top:8px;" onclick="reqGpOtp()">Kirim OTP GoBiz</button>
              </div>
              <div>
                <label class="form-label">Kode OTP</label>
                <input type="text" id="gpOtp" class="form-input" placeholder="Kode OTP">
                <button class="btn btn-primary btn-sm" style="margin-top:8px;" onclick="verGpOtp()">Verifikasi</button>
              </div>
            </div>
          </div>
          <p id="provSaveMsg" style="font-size:12px; margin-top:12px;"></p>
        </div>
      </div>

      <!-- TAB 6: LOG SISTEM -->
      <div id="panelLogs" style="display:none;">
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <h2 style="font-size:16px; font-weight:700;">Log Aktivitas Transaksi</h2>
            <button class="btn btn-secondary btn-sm" onclick="loadLogs()">Segarkan Log</button>
          </div>
          <pre class="code-box" id="logsBox" style="max-height:360px; font-size:11px;">Memuat log...</pre>
        </div>
      </div>
    </div>
  </div>

  <script>
    let merchantSessionToken = sessionStorage.getItem('qris_merchant_token') || '';
    let currentMerchant = null;
    let allPayments = [];
    let currentFilter = 'all';

    function getHeaders() {
      const h = { 'Content-Type': 'application/json' };
      if (merchantSessionToken) {
        h['Authorization'] = 'Bearer ' + merchantSessionToken;
      }
      return h;
    }

    async function api(path, method = 'GET', body = null) {
      const res = await fetch(path, {
        method,
        headers: getHeaders(),
        body: body ? JSON.stringify(body) : undefined
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Request gagal (' + res.status + ')');
      return data;
    }

    function switchAuthTab(tab) {
      document.getElementById('authTabLogin').className = (tab === 'login') ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-secondary';
      document.getElementById('authTabRegister').className = (tab === 'register') ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-secondary';
      document.getElementById('formLogin').style.display = (tab === 'login') ? 'block' : 'none';
      document.getElementById('formRegister').style.display = (tab === 'register') ? 'block' : 'none';
    }

    async function handleLogin(e) {
      e.preventDefault();
      const errEl = document.getElementById('loginError');
      errEl.style.display = 'none';

      try {
        const res = await fetch('/api/saas/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: document.getElementById('loginEmail').value,
            password: document.getElementById('loginPw').value
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Login gagal');

        merchantSessionToken = data.token;
        sessionStorage.setItem('qris_merchant_token', data.token);
        currentMerchant = data.merchant;
        loadDashboard();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
      }
    }

    async function handleRegister(e) {
      e.preventDefault();
      const errEl = document.getElementById('regError');
      errEl.style.display = 'none';

      try {
        const res = await fetch('/api/saas/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: document.getElementById('regName').value,
            email: document.getElementById('regEmail').value,
            phone: document.getElementById('regPhone').value,
            password: document.getElementById('regPw').value
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Pendaftaran gagal');

        merchantSessionToken = data.token;
        sessionStorage.setItem('qris_merchant_token', data.token);
        currentMerchant = data.merchant;
        loadDashboard();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
      }
    }

    async function loginDemoDefault() {
      document.getElementById('loginEmail').value = 'admin@qrispay.id';
      document.getElementById('loginPw').value = 'admin123';
      try {
        const res = await fetch('/api/saas/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'admin@qrispay.id', password: 'admin123' })
        });
        const data = await res.json();
        if (data.token) {
          merchantSessionToken = data.token;
          sessionStorage.setItem('qris_merchant_token', data.token);
          loadDashboard();
        }
      } catch {
        handleLogin(new Event('submit'));
      }
    }

    function handleLogout() {
      sessionStorage.removeItem('qris_merchant_token');
      merchantSessionToken = '';
      currentMerchant = null;
      fetch('/api/saas/auth/logout', { method: 'POST' }).finally(() => location.reload());
    }

    function switchNavTab(tab) {
      const tabs = ['overview', 'payments', 'integration', 'paymentLink', 'provider', 'logs'];
      tabs.forEach(t => {
        const btn = document.getElementById('tabBtn' + t.charAt(0).toUpperCase() + t.slice(1));
        const panel = document.getElementById('panel' + t.charAt(0).toUpperCase() + t.slice(1));
        if (btn) btn.className = (t === tab) ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-secondary';
        if (panel) panel.style.display = (t === tab) ? 'block' : 'none';
      });
      if (tab === 'logs') loadLogs();
      if (tab === 'integration') loadIntegration();
    }

    function switchProvTab(tab) {
      document.getElementById('tabPlatform').style.display = tab === 'platform' ? 'block' : 'none';
      document.getElementById('tabCustomQris').style.display = tab === 'customqris' ? 'block' : 'none';
      document.getElementById('tabGopay').style.display = tab === 'gopay' ? 'block' : 'none';
    }

    async function loadDashboard() {
      try {
        const authData = await api('/api/saas/auth/me');
        currentMerchant = authData.merchant;

        document.getElementById('loginCard').style.display = 'none';
        document.getElementById('dashContent').style.display = 'block';
        document.getElementById('authActions').style.display = 'flex';

        document.getElementById('merchantBusinessName').textContent = currentMerchant.name;
        document.getElementById('merchantIdCode').textContent = currentMerchant.id;
        document.getElementById('merchantAvatar').textContent = currentMerchant.name.charAt(0).toUpperCase();

        // Load overview analytics
        const ovData = await api('/api/saas/merchant/overview');
        const ov = ovData.overview || {};
        document.getElementById('statTotalGross').textContent = 'Rp ' + Number(ov.total_gross || 0).toLocaleString('id-ID');
        document.getElementById('statTotalNet').textContent = 'Rp ' + Number(ov.total_net || 0).toLocaleString('id-ID');
        document.getElementById('statTotalMdr').textContent = 'Rp ' + Number(ov.total_mdr || 0).toLocaleString('id-ID');
        document.getElementById('statSuccessRate').textContent = ov.success_rate || '100%';
        document.getElementById('statCountBreakdown').textContent = (ov.paid_count || 0) + ' lunas / ' + (ov.pending_count || 0) + ' pending';

        // Load transactions
        const txData = await api('/api/saas/merchant/transactions');
        allPayments = txData.transactions || [];
        renderOverviewPayments(allPayments.slice(0, 5));
        renderPayments(allPayments);

        // Load integration
        document.getElementById('serverKeyInput').value = currentMerchant.server_key || '';
        document.getElementById('clientKeyInput').value = currentMerchant.client_key || '';
        document.getElementById('whSecret').value = currentMerchant.webhook_secret || '';
        document.getElementById('whUrl').value = currentMerchant.webhook_url || '';
      } catch (err) {
        document.getElementById('loginCard').style.display = 'block';
        document.getElementById('dashContent').style.display = 'none';
        document.getElementById('authActions').style.display = 'none';
      }
    }

    function renderOverviewPayments(list) {
      const tbody = document.getElementById('overviewPaymentsBody');
      if (!list || list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--text-muted);">Belum ada pembayaran.</td></tr>';
        return;
      }
      tbody.innerHTML = list.map(p => {
        const gross = p.total || p.amount;
        const mdr = p.mdr_fee || Math.ceil(gross * 0.007);
        const net = p.net_amount || (gross - mdr);
        const st = p.transaction_status || p.status;
        return \`
          <tr>
            <td><a href="/pay/\${p.id}" target="_blank" style="font-weight:600; color:var(--accent);">\${p.id}</a></td>
            <td>\${esc(p.order_id || '-')}</td>
            <td><b>Rp \${Number(gross).toLocaleString('id-ID')}</b></td>
            <td style="color:var(--warning);">Rp \${Number(mdr).toLocaleString('id-ID')}</td>
            <td style="color:var(--success); font-weight:600;">Rp \${Number(net).toLocaleString('id-ID')}</td>
            <td><span class="badge badge-\${st}">\${st.toUpperCase()}</span></td>
            <td style="color:var(--text-muted); font-size:12px;">\${new Date(p.created_at).toLocaleString('id-ID')}</td>
            <td><a href="/pay/\${p.id}" target="_blank" class="btn btn-secondary btn-sm">Buka</a></td>
          </tr>
        \`;
      }).join('');
    }

    function renderPayments(list) {
      const tbody = document.getElementById('paymentsBody');
      if (!list || list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--text-muted);">Tidak ada transaksi yang cocok.</td></tr>';
        return;
      }
      tbody.innerHTML = list.map(p => {
        const gross = p.total || p.amount;
        const mdr = p.mdr_fee || Math.ceil(gross * 0.007);
        const net = p.net_amount || (gross - mdr);
        const st = p.transaction_status || p.status;
        return \`
          <tr>
            <td><a href="/pay/\${p.id}" target="_blank" style="font-weight:600; color:var(--accent);">\${p.id}</a></td>
            <td>\${esc(p.order_id || '-')}</td>
            <td><b>Rp \${Number(gross).toLocaleString('id-ID')}</b></td>
            <td style="color:var(--warning);">Rp \${Number(mdr).toLocaleString('id-ID')}</td>
            <td style="color:var(--success); font-weight:600;">Rp \${Number(net).toLocaleString('id-ID')}</td>
            <td><span class="badge badge-\${st}">\${st.toUpperCase()}</span></td>
            <td style="color:var(--text-muted); font-size:12px;">\${new Date(p.created_at).toLocaleString('id-ID')}</td>
            <td><a href="/pay/\${p.id}" target="_blank" class="btn btn-secondary btn-sm">Buka</a></td>
          </tr>
        \`;
      }).join('');
    }

    function filterStatus(status) {
      currentFilter = status;
      if (status === 'all') {
        renderPayments(allPayments);
      } else {
        renderPayments(allPayments.filter(p => (p.transaction_status || p.status) === status || p.status === status));
      }
    }

    function searchPayments(query) {
      const q = query.toLowerCase().trim();
      const filtered = allPayments.filter(p => {
        const st = p.transaction_status || p.status;
        const matchesStatus = currentFilter === 'all' || st === currentFilter || p.status === currentFilter;
        const matchesText = !q || p.id.toLowerCase().includes(q) || (p.order_id && p.order_id.toLowerCase().includes(q));
        return matchesStatus && matchesText;
      });
      renderPayments(filtered);
    }

    async function handleQuickCreate(e) {
      e.preventDefault();
      const amt = Number(document.getElementById('qcAmount').value);
      const ord = document.getElementById('qcOrder').value;
      const resEl = document.getElementById('qcResult');
      resEl.textContent = 'Membuat tagihan...';

      try {
        const data = await api('/api/saas/merchant/payment-link', 'POST', { amount: amt, order_id: ord });
        const p = data.data;
        resEl.innerHTML = '<span style="color:var(--success);">Berhasil!</span> <a href="' + p.payment_link + '" target="_blank" style="color:var(--accent); font-weight:600;">Buka Tagihan ' + p.id + '</a>';
        loadDashboard();
      } catch (err) {
        resEl.textContent = 'Error: ' + err.message;
        resEl.style.color = 'var(--danger)';
      }
    }

    async function handleGeneratePaymentLink(e) {
      e.preventDefault();
      const amt = Number(document.getElementById('plAmount').value);
      const ord = document.getElementById('plOrder').value;
      const cust = document.getElementById('plCustomer').value;
      const desc = document.getElementById('plDesc').value;

      try {
        const res = await api('/api/saas/merchant/payment-link', 'POST', {
          amount: amt,
          order_id: ord,
          customer: cust,
          description: desc
        });
        const p = res.data;
        document.getElementById('plGeneratedUrl').value = p.payment_link;
        document.getElementById('plPreviewLink').href = p.payment_link;
        document.getElementById('plResultBox').style.display = 'block';
      } catch (err) {
        alert('Gagal membuat tautan bayar: ' + err.message);
      }
    }

    function copyPaymentLink() {
      const inp = document.getElementById('plGeneratedUrl');
      navigator.clipboard.writeText(inp.value);
      alert('Tautan bayar berhasil disalin!');
    }

    function toggleServerKeyVisibility() {
      const inp = document.getElementById('serverKeyInput');
      inp.type = inp.type === 'password' ? 'text' : 'password';
    }

    function copyServerKey() {
      const inp = document.getElementById('serverKeyInput');
      navigator.clipboard.writeText(inp.value);
      alert('Server Key berhasil disalin!');
    }

    function copyClientKey() {
      const inp = document.getElementById('clientKeyInput');
      navigator.clipboard.writeText(inp.value);
      alert('Client Key berhasil disalin!');
    }

    async function regenerateKeys() {
      if (!confirm('Apakah Anda yakin ingin meregenerasi kunci API? Kunci lama tidak akan dapat digunakan lagi.')) return;
      try {
        const data = await api('/api/saas/merchant/keys/regenerate', 'POST', { type: 'all' });
        currentMerchant = data.merchant;
        document.getElementById('serverKeyInput').value = currentMerchant.server_key;
        document.getElementById('clientKeyInput').value = currentMerchant.client_key;
        alert('Kunci API baru berhasil dibuat!');
      } catch (err) {
        alert('Gagal regenerasi kunci: ' + err.message);
      }
    }

    async function saveWebhookSettings(e) {
      e.preventDefault();
      const url = document.getElementById('whUrl').value;
      const msg = document.getElementById('whSaveMsg');
      msg.textContent = 'Menyimpan...';

      try {
        await api('/api/saas/merchant/webhook', 'POST', { webhook_url: url });
        msg.textContent = 'Pengaturan webhook berhasil disimpan!';
        msg.style.color = 'var(--success)';
      } catch (err) {
        msg.textContent = 'Error: ' + err.message;
        msg.style.color = 'var(--danger)';
      }
    }

    async function testWebhookPing() {
      const st = document.getElementById('testWhStatus');
      const box = document.getElementById('whResponseBox');
      st.textContent = 'Mengirim ping notifikasi...';
      st.style.color = 'var(--text-muted)';
      box.textContent = 'Mengirim request ke webhook...';

      try {
        const data = await api('/api/saas/merchant/webhook/test', 'POST', { webhook_url: document.getElementById('whUrl').value });
        if (data.ok) {
          st.textContent = 'HTTP ' + data.status + ' OK';
          st.style.color = 'var(--success)';
          box.textContent = 'HTTP ' + data.status + '\\n' + (data.response || '(Respons kosong)');
        } else {
          st.textContent = 'HTTP ' + (data.status || 'FAIL');
          st.style.color = 'var(--danger)';
          box.textContent = 'Error: ' + (data.error || 'Server webhook merespons status ' + data.status);
        }
      } catch (err) {
        st.textContent = 'Gagal';
        st.style.color = 'var(--danger)';
        box.textContent = 'Error: ' + err.message;
      }
    }

    async function reconcileAll() {
      const msg = document.getElementById('recMsg');
      msg.textContent = 'Memindai mutasi...';
      try {
        const res = await api('/api/admin/reconcile', 'POST');
        msg.textContent = 'Selesai: ' + res.checked + ' transaksi diperiksa, ' + res.paid + ' lunas baru.';
        msg.style.color = 'var(--success)';
        loadDashboard();
      } catch (err) {
        msg.textContent = 'Error: ' + err.message;
        msg.style.color = 'var(--danger)';
      }
    }

    async function saveProviderPlatform() {
      const msg = document.getElementById('provSaveMsg');
      msg.textContent = 'Menyimpan...';
      try {
        await api('/api/saas/merchant/provider', 'POST', { provider: 'platform' });
        msg.textContent = 'Provider Platform Pool aktif!';
        msg.style.color = 'var(--success)';
      } catch (err) {
        msg.textContent = 'Error: ' + err.message;
        msg.style.color = 'var(--danger)';
      }
    }

    async function saveCustomQris() {
      const msg = document.getElementById('provSaveMsg');
      const qrisStr = document.getElementById('provCustomQris').value;
      msg.textContent = 'Menyimpan...';
      try {
        await api('/api/saas/merchant/provider', 'POST', { provider: 'custom', custom_qris: qrisStr });
        msg.textContent = 'QRIS Statis custom berhasil disimpan!';
        msg.style.color = 'var(--success)';
      } catch (err) {
        msg.textContent = 'Error: ' + err.message;
        msg.style.color = 'var(--danger)';
      }
    }

    async function loadLogs() {
      const box = document.getElementById('logsBox');
      box.textContent = 'Memuat log aktivitas...';
      try {
        const data = await api('/api/logs');
        box.textContent = (data.logs || []).join('\\n') || 'Belum ada log.';
      } catch (err) {
        box.textContent = 'Gagal memuat log: ' + err.message;
      }
    }

    // Auto-init on load if session exists
    if (merchantSessionToken) {
      loadDashboard();
    }
  </script>
  `;
  return shell('Portal Merchant - QRISPAY SaaS Gateway', content);
}

// ----------------------------------------------------
// 5. PERMANENT PAY LINK PAGE (/link/:slug)
// ----------------------------------------------------
function payLinkPage({ name, slug }) {
  const content = `
  <div style="max-width:440px; margin:40px auto; padding:0 16px;">
    <div class="card" style="padding:32px; text-align:center;">
      <div style="font-size:12px; font-weight:600; color:var(--text-muted); margin-bottom:4px;">PEMBAYARAN KE</div>
      <h1 style="font-size:22px; font-weight:800; letter-spacing:-0.02em; margin-bottom:16px;">${esc(name)}</h1>
      
      <form id="linkPayForm" onsubmit="handleLinkPay(event)">
        <div class="form-group" style="text-align:left;">
          <label class="form-label">Nominal Pembayaran (Rp)</label>
          <input type="number" id="lpAmount" class="form-input" placeholder="Contoh: 50000" min="1000" step="1000" required autofocus>
        </div>
        <div class="form-group" style="text-align:left;">
          <label class="form-label">Nama Anda (Opsional)</label>
          <input type="text" id="lpCustomer" class="form-input" placeholder="Nama pembeli">
        </div>
        <div class="form-group" style="text-align:left;">
          <label class="form-label">Catatan / Keterangan (Opsional)</label>
          <input type="text" id="lpDesc" class="form-input" placeholder="Untuk pesanan #...">
        </div>
        <button type="submit" id="lpBtn" class="btn btn-primary btn-full" style="min-height:44px; margin-top:8px;">Lanjut ke QRIS</button>
      </form>
    </div>
  </div>
  <script>
    async function handleLinkPay(e) {
      e.preventDefault();
      const btn = document.getElementById('lpBtn');
      btn.textContent = 'Membuat QRIS...';
      btn.disabled = true;
      const amt = parseInt(document.getElementById('lpAmount').value, 10);
      const cust = document.getElementById('lpCustomer').value;
      const desc = document.getElementById('lpDesc').value;

      try {
        const res = await fetch('/api/public/link-create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: amt, customer: cust, description: desc })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Gagal membuat QRIS');
        window.location.href = data.payment_link;
      } catch (err) {
        alert(err.message);
        btn.textContent = 'Lanjut ke QRIS';
        btn.disabled = false;
      }
    }
  </script>`;
  return shell('Bayar ke ' + name, content);
}

module.exports = {
  shell,
  landing,
  payPage,
  payLinkPage,
  docsPage,
  admin,
};
