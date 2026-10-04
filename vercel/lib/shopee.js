// Klien ShopeePay Merchant (API Reverse-Engineered berdasarkan alur dashboard Shopee Merchant).
const store = require('./store');
const { encrypt, decrypt } = require('./crypto');
const qris = require('./qris');
const { logEvent } = require('./logger');

const SHOPEE_BASE = process.env.SHOPEE_BASE_URL || 'https://merchant.shopee.co.id';
const SESSION_KEY = 'shopee:session';

const HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  Origin: 'https://merchant.shopee.co.id',
  Referer: 'https://merchant.shopee.co.id/portal',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};

async function loadSession() {
  const raw = await store.get(SESSION_KEY);
  return raw ? JSON.parse(decrypt(raw)) : null;
}

const saveSession = (s) => store.set(SESSION_KEY, encrypt(JSON.stringify(s)));

async function callShopeeAPI(path, body, token) {
  const url = `${SHOPEE_BASE}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...HEADERS,
      'X-Timestamp-Ms': String(Date.now()),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }

  if (!res.ok) {
    const err = new Error(`Shopee HTTP ${res.status}`);
    err.status = res.status;
    err.detail = json?.message || json?.msg || text;
    throw err;
  }
  return json;
}

async function updateToken({ token, staticQris, merchantName }) {
  if (!token) throw new Error('Token Shopee wajib diisi');
  let current = (await loadSession()) || {};

  let validQris = staticQris || current.qris || process.env.QRIS_STATIC || '';
  if (validQris) {
    try { qris.validate(validQris); } catch (e) {
      throw new Error(`Format QRIS tidak valid: ${e.message}`);
    }
  }

  // Verifikasi token dengan memanggil API transaksi (1 baris)
  const now = Math.floor(Date.now() / 1000);
  const verifyBody = {
    data: {
      metadata: { token, language: 'id', timezone: 'Asia/Jakarta' },
      pageSize: 1,
      filter: { startTime: now - 3600, endTime: now, serviceList: [1, 3] },
      sorter: { field: 'ctime', order: 'descend' },
      next_position: '',
    },
  };

  try {
    const res = await callShopeeAPI('/api/merchant/v1/transaction/list', verifyBody, token);
    if (res && res.code !== undefined && res.code !== 0) {
      throw new Error(res.msg || res.message || `Kode error Shopee: ${res.code}`);
    }
  } catch (e) {
    logEvent('WARN', `Shopee token verification warning: ${e.message}`);
    // Tetap simpan jika offline / transient network
  }

  const session = {
    token,
    merchantName: merchantName || current.merchantName || 'ShopeePay Merchant',
    qris: validQris,
    updatedAt: Date.now(),
  };

  await saveSession(session);
  logEvent('INFO', `ShopeePay session updated successfully.`);
  return { connected: true, merchantName: session.merchantName, hasQris: !!validQris };
}

async function getSession() {
  const s = await loadSession();
  if (!s || !s.token) throw Object.assign(new Error('Akun ShopeePay belum terhubung.'), { status: 503 });
  return s;
}

async function listTransactions(startTime, endTime) {
  const s = await getSession();
  const startSec = Math.floor(new Date(startTime).getTime() / 1000);
  const endSec = Math.floor(new Date(endTime).getTime() / 1000);

  const reqBody = {
    data: {
      metadata: { token: s.token, language: 'id', timezone: 'Asia/Jakarta' },
      pageSize: 50,
      filter: { startTime: startSec, endTime: endSec, serviceList: [1, 3] },
      sorter: { field: 'ctime', order: 'descend' },
      next_position: '',
    },
  };

  const json = await callShopeeAPI('/api/merchant/v1/transaction/list', reqBody, s.token);
  const list = json?.data?.transactions || json?.data?.list || [];

  return list.map((t) => {
    // Normalisasi nominal: hilangkan titik/koma bila string
    let amt = t.amount;
    if (typeof amt === 'string') {
      amt = parseInt(amt.replace(/[.,]/g, ''), 10) || 0;
    }

    return {
      id: String(t.transaction_id || t.transactionId || t.order_sn || t.id),
      orderId: t.order_sn || t.orderId || String(t.transaction_id || ''),
      amount: Number(amt || 0),
      time: t.ctime ? new Date(t.ctime * 1000).toISOString() : (t.time || new Date().toISOString()),
      status: t.status === 1 || t.status === 'success' || t.status === 2 ? 'settlement' : String(t.status),
    };
  });
}

async function status() {
  const s = await loadSession();
  return s && s.token
    ? { connected: true, merchantName: s.merchantName, hasQris: !!s.qris, updatedAt: s.updatedAt }
    : { connected: false };
}

module.exports = { updateToken, getSession, listTransactions, status };
