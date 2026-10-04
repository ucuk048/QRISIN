// Background Daemon Worker untuk VPS / Server Mandiri
// Menjalankan pengecekan mutasi berkala setiap interval (default 12 detik)
// Mendukung GoPay, ShopeePay, dan pengiriman Webhook otomatis.

const payments = require('./lib/payments');
const store = require('./lib/store');
const { logEvent } = require('./lib/logger');

const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS || 12000);
let isRunning = false;

async function tick() {
  if (isRunning) return;
  isRunning = true;
  try {
    const res = await payments.reconcileAll();
    if (res.checked > 0) {
      logEvent('INFO', `Worker tick: ${res.checked} tagihan dicek, ${res.paid} berhasil diselesaikan`);
    }
  } catch (err) {
    logEvent('ERROR', `Worker tick error: ${err.message}`);
  } finally {
    isRunning = false;
  }
}

console.log(`[Qrispay Worker] Memulai background worker (Interval: ${INTERVAL_MS / 1000}s)`);
logEvent('INFO', `Background worker started (Interval: ${INTERVAL_MS / 1000}s)`);

setInterval(tick, INTERVAL_MS);
tick();

process.on('SIGINT', () => {
  console.log('[Qrispay Worker] Menghentikan worker...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[Qrispay Worker] Menghentikan worker...');
  process.exit(0);
});
