const store = require('./store');
const { randId, hashPassword, verifyPassword, safeEqual } = require('./crypto');

const MDR_PERCENT = 0.007; // 0.7% MDR standar Bank Indonesia untuk QRIS

function getDefaultMerchant() {
  return {
    id: 'mid_default',
    email: 'admin@qrispay.id',
    name: 'Platform Merchant Utama',
    phone: '081200000000',
    server_key: process.env.API_KEY || 'SB-Mid-server-default-live-key',
    client_key: 'SB-Mid-client-default-live-key',
    webhook_secret: process.env.WEBHOOK_SECRET || 'whsec_default_live_secret',
    webhook_url: process.env.WEBHOOK_URL || '',
    provider: 'platform',
    custom_qris: process.env.QRIS_STATIC || '',
    created_at: Date.now(),
    is_default: true,
  };
}

function sanitize(m) {
  if (!m) return null;
  const copy = { ...m };
  delete copy.password_hash;
  return copy;
}

async function register({ email, name, password, phone }) {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    throw Object.assign(new Error('Format email tidak valid'), { status: 400 });
  }
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    throw Object.assign(new Error('Nama bisnis minimal 2 karakter'), { status: 400 });
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    throw Object.assign(new Error('Password minimal 6 karakter'), { status: 400 });
  }

  const cleanEmail = email.trim().toLowerCase();
  const existingId = await store.get('merchant:by_email:' + cleanEmail);
  if (existingId) {
    throw Object.assign(new Error('Email bisnis sudah terdaftar'), { status: 409 });
  }

  const id = 'mid_' + randId(8);
  const serverKey = 'SB-Mid-server-' + randId(16);
  const clientKey = 'SB-Mid-client-' + randId(16);
  const webhookSecret = 'whsec_' + randId(16);
  const pwdHash = hashPassword(password);
  const now = Date.now();

  const merchant = {
    id,
    email: cleanEmail,
    name: name.trim(),
    phone: phone ? String(phone).trim() : '',
    password_hash: pwdHash,
    server_key: serverKey,
    client_key: clientKey,
    webhook_secret: webhookSecret,
    webhook_url: '',
    provider: 'platform',
    custom_qris: '',
    created_at: now,
    updated_at: now,
  };

  await store.set('merchant:' + id, merchant);
  await store.set('merchant:by_email:' + cleanEmail, id);
  await store.set('merchant:by_server_key:' + serverKey, id);
  await store.set('merchant:by_client_key:' + clientKey, id);
  await store.sadd('merchants:all', id);

  const sessionToken = 'sess_' + randId(24);
  await store.set('merchant:session:' + sessionToken, id, 7 * 86400);

  return {
    merchant: sanitize(merchant),
    token: sessionToken,
  };
}

async function login({ email, password }) {
  if (!email || !password) {
    throw Object.assign(new Error('Email dan password wajib diisi'), { status: 400 });
  }
  const cleanEmail = email.trim().toLowerCase();

  // Cek admin master login fallback
  if (cleanEmail === 'admin@qrispay.id' && process.env.ADMIN_PASSWORD && safeEqual(password, process.env.ADMIN_PASSWORD)) {
    const defaultM = getDefaultMerchant();
    const token = 'sess_' + randId(24);
    await store.set('merchant:session:' + token, defaultM.id, 7 * 86400);
    return { merchant: defaultM, token };
  }

  const id = await store.get('merchant:by_email:' + cleanEmail);
  if (!id) {
    throw Object.assign(new Error('Email atau password salah'), { status: 401 });
  }

  const merchant = await store.get('merchant:' + id);
  if (!merchant || !verifyPassword(password, merchant.password_hash)) {
    throw Object.assign(new Error('Email atau password salah'), { status: 401 });
  }

  const sessionToken = 'sess_' + randId(24);
  await store.set('merchant:session:' + sessionToken, id, 7 * 86400);

  return {
    merchant: sanitize(merchant),
    token: sessionToken,
  };
}

async function getById(id) {
  if (!id || id === 'mid_default') return getDefaultMerchant();
  const m = await store.get('merchant:' + id);
  return m ? sanitize(m) : null;
}

async function getRawById(id) {
  if (!id || id === 'mid_default') return getDefaultMerchant();
  return store.get('merchant:' + id);
}

async function getByToken(token) {
  if (!token) return null;
  if (process.env.GP_SESS && safeEqual(token, process.env.GP_SESS)) {
    return getDefaultMerchant();
  }
  const id = await store.get('merchant:session:' + token);
  if (!id) return null;
  return getById(id);
}

async function getByServerKey(key) {
  if (!key) return null;
  if (process.env.API_KEY && safeEqual(key, process.env.API_KEY)) {
    return getDefaultMerchant();
  }
  const id = await store.get('merchant:by_server_key:' + key);
  if (!id) return null;
  return getRawById(id);
}

async function getByClientKey(key) {
  if (!key) return null;
  const id = await store.get('merchant:by_client_key:' + key);
  if (!id) return null;
  return getById(id);
}

async function regenerateKeys(merchantId, type = 'all') {
  const m = await getRawById(merchantId);
  if (!m) throw Object.assign(new Error('Merchant tidak ditemukan'), { status: 404 });
  if (m.is_default) {
    throw Object.assign(new Error('Kunci merchant platform utama diatur via file konfigurasi/env'), { status: 400 });
  }

  if (type === 'server' || type === 'all') {
    if (m.server_key) await store.del('merchant:by_server_key:' + m.server_key);
    m.server_key = 'SB-Mid-server-' + randId(16);
    await store.set('merchant:by_server_key:' + m.server_key, m.id);
  }

  if (type === 'client' || type === 'all') {
    if (m.client_key) await store.del('merchant:by_client_key:' + m.client_key);
    m.client_key = 'SB-Mid-client-' + randId(16);
    await store.set('merchant:by_client_key:' + m.client_key, m.id);
  }

  if (type === 'webhook' || type === 'all') {
    m.webhook_secret = 'whsec_' + randId(16);
  }

  m.updated_at = Date.now();
  await store.set('merchant:' + m.id, m);
  return sanitize(m);
}

async function updateWebhook(merchantId, { webhook_url, webhook_secret }) {
  const m = await getRawById(merchantId);
  if (!m) throw Object.assign(new Error('Merchant tidak ditemukan'), { status: 404 });

  if (m.is_default) {
    if (webhook_url !== undefined) await store.set('merchant:webhook_url', webhook_url);
    if (webhook_secret !== undefined) await store.set('merchant:webhook_secret', webhook_secret);
    return { webhook_url, webhook_secret };
  }

  if (webhook_url !== undefined) m.webhook_url = webhook_url;
  if (webhook_secret !== undefined) m.webhook_secret = webhook_secret;
  m.updated_at = Date.now();
  await store.set('merchant:' + m.id, m);
  return { webhook_url: m.webhook_url, webhook_secret: m.webhook_secret };
}

async function updateProvider(merchantId, { provider: provName, custom_qris }) {
  const m = await getRawById(merchantId);
  if (!m) throw Object.assign(new Error('Merchant tidak ditemukan'), { status: 404 });

  if (provName) m.provider = provName;
  if (custom_qris !== undefined) m.custom_qris = custom_qris;
  m.updated_at = Date.now();
  if (!m.is_default) {
    await store.set('merchant:' + m.id, m);
  }
  return sanitize(m);
}

async function recordPayment(merchantId, paymentId) {
  const id = merchantId || 'mid_default';
  await store.lpush(`merchant:${id}:txs`, paymentId, 1000);
}

async function getMerchantTxs(merchantId, limit = 50) {
  const id = merchantId || 'mid_default';
  return store.lrange(`merchant:${id}:txs`, limit);
}

async function getOverview(merchantId) {
  const id = merchantId || 'mid_default';
  const paymentsLib = require('./payments');
  const txIds = await getMerchantTxs(id, 200);

  let totalGross = 0;
  let totalNet = 0;
  let totalMdr = 0;
  let paidCount = 0;
  let pendingCount = 0;
  let expiredCount = 0;

  for (const tid of txIds) {
    const p = await paymentsLib.get(tid);
    if (!p) continue;
    if (p.status === 'paid') {
      paidCount++;
      const gross = p.total || p.amount;
      const mdr = Math.ceil(gross * MDR_PERCENT);
      totalGross += gross;
      totalMdr += mdr;
      totalNet += gross - mdr;
    } else if (p.status === 'pending') {
      pendingCount++;
    } else {
      expiredCount++;
    }
  }

  const totalAttempt = paidCount + pendingCount + expiredCount;
  const successRate = totalAttempt > 0 ? ((paidCount / totalAttempt) * 100).toFixed(1) : '100.0';

  return {
    merchant_id: id,
    total_gross: totalGross,
    total_net: totalNet,
    total_mdr: totalMdr,
    mdr_rate: '0.7%',
    paid_count: paidCount,
    pending_count: pendingCount,
    expired_count: expiredCount,
    total_transactions: totalAttempt,
    success_rate: `${successRate}%`,
  };
}

module.exports = {
  MDR_PERCENT,
  getDefaultMerchant,
  sanitize,
  register,
  login,
  getById,
  getRawById,
  getByToken,
  getByServerKey,
  getByClientKey,
  regenerateKeys,
  updateWebhook,
  updateProvider,
  recordPayment,
  getMerchantTxs,
  getOverview,
};
