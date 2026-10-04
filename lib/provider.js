// Provider Manager: Mengelola multi-provider (GoPay, ShopeePay, Custom Static QRIS)
const store = require('./store');
const gopay = require('./gopay');
const shopee = require('./shopee');
const qris = require('./qris');
const { logEvent } = require('./logger');

const PROVIDER_KEY = 'gateway:provider';

async function getActiveProvider() {
  const custom = await store.get(PROVIDER_KEY);
  if (custom) return custom;

  // Auto detect: jika shopee terhubung dan gopay belum, gunakan shopee
  const gpStat = await gopay.status().catch(() => ({ connected: false }));
  if (gpStat.connected) return 'gopay';

  const spStat = await shopee.status().catch(() => ({ connected: false }));
  if (spStat.connected) return 'shopee';

  return process.env.DEFAULT_PROVIDER || 'gopay';
}

async function setActiveProvider(name) {
  const norm = String(name).toLowerCase();
  if (!['gopay', 'shopee', 'manual'].includes(norm)) {
    throw new Error('Provider tidak didukung: ' + name);
  }
  await store.set(PROVIDER_KEY, norm);
  logEvent('INFO', `Provider aktif dialihkan ke: ${norm}`);
  return norm;
}

async function getProviderQRIS() {
  const active = await getActiveProvider();
  if (active === 'shopee') {
    const s = await shopee.getSession().catch(() => null);
    if (s?.qris) return s.qris;
  }
  if (active === 'gopay') {
    const s = await gopay.getSession().catch(() => null);
    if (s?.qris) return s.qris;
  }
  // Fallback: cek manual QRIS
  const manualQris = await store.get('manual:qris');
  if (manualQris) return manualQris;

  if (process.env.QRIS_STATIC) {
    qris.validate(process.env.QRIS_STATIC);
    return process.env.QRIS_STATIC;
  }

  throw Object.assign(new Error(`Merchant ${active.toUpperCase()} belum terhubung atau QRIS statis belum diatur. Login di /admin.`), { status: 503 });
}

async function setManualQRIS(rawQris, merchantName = 'Toko QRIS') {
  qris.validate(rawQris);
  await store.set('manual:qris', rawQris);
  await store.set('manual:name', merchantName);
  logEvent('INFO', `Manual static QRIS updated: ${merchantName}`);
  return { ok: true, merchantName };
}

async function listTransactions(startTime, endTime) {
  const active = await getActiveProvider();
  if (active === 'shopee') {
    return shopee.listTransactions(startTime, endTime);
  }
  if (active === 'gopay') {
    return gopay.listTransactions(startTime, endTime);
  }
  // Provider manual: tidak ada polling otomatis, menunggu webhook/manual claim
  return [];
}

async function status() {
  const active = await getActiveProvider();
  const gp = await gopay.status().catch(() => ({ connected: false }));
  const sp = await shopee.status().catch(() => ({ connected: false }));
  const manualQris = await store.get('manual:qris');
  const manualName = await store.get('manual:name');

  return {
    activeProvider: active,
    providers: {
      gopay: gp,
      shopee: sp,
      manual: {
        configured: !!manualQris,
        merchantName: manualName || 'Manual Merchant',
      },
    },
  };
}

module.exports = {
  getActiveProvider,
  setActiveProvider,
  getProviderQRIS,
  setManualQRIS,
  listTransactions,
  status,
  gopay,
  shopee,
};
