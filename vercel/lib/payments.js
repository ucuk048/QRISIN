const store = require('./store');
const qris = require('./qris');
const gopay = require('./gopay');
const provider = require('./provider');
const merchant = require('./merchant');
const { randId, sign, midtransSignature } = require('./crypto');
const { logEvent } = require('./logger');

const EXPIRY_MIN = Number(process.env.PAYMENT_EXPIRY_MINUTES || 15);
const MAX_OFFSET = Number(process.env.MAX_UNIQUE_OFFSET || 999);
const FEED_CACHE_SEC = 4; // lindungi akun dari polling agresif

const pKey = (id) => 'pay:' + id;
const aKey = (amt) => 'amt:' + amt; // kunci nominal unik selama pending

async function getActiveStaticQris() {
  try {
    return await provider.getProviderQRIS();
  } catch (err) {
    const session = await gopay.getSession().catch(() => null);
    if (session?.qris) return session.qris;
    if (process.env.QRIS_STATIC) {
      qris.validate(process.env.QRIS_STATIC);
      return process.env.QRIS_STATIC;
    }
    throw err;
  }
}

function isPrivateUrl(urlStr) {
  if (!urlStr) return false;
  try {
    const parsed = new URL(urlStr);
    if (!['http:', 'https:'].includes(parsed.protocol)) return true;
    const host = parsed.hostname.toLowerCase();
    if (process.env.ALLOW_LOCAL_URL === '1') {
      return false;
    }
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') return true;
    if (host.endsWith('.local') || host.endsWith('.internal')) return true;
    if (host === '169.254.169.254' || host === 'metadata.google.internal') return true;

    const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
      const [_, a, b] = ipv4.map(Number);
      if (a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 0) {
        return true;
      }
    }
    return false;
  } catch {
    return true;
  }
}

async function create({ amount, order_id, description, callback_url, customer, merchant_id }) {
  amount = Number(amount);
  if (!Number.isInteger(amount) || amount < 1000) {
    throw Object.assign(new Error('amount minimal 1000 dan bilangan bulat'), { status: 400 });
  }
  if (callback_url) {
    if (!/^https?:\/\//i.test(callback_url)) {
      throw Object.assign(new Error('callback_url harus http atau https'), { status: 400 });
    }
    if (isPrivateUrl(callback_url)) {
      throw Object.assign(new Error('callback_url dilarang mengarah ke host lokal/privat (SSRF Protection)'), { status: 400 });
    }
  }

  const mid = merchant_id || 'mid_default';
  let staticQris = '';
  if (mid !== 'mid_default') {
    const mData = await merchant.getRawById(mid).catch(() => null);
    if (mData?.custom_qris && mData.custom_qris.trim()) {
      staticQris = mData.custom_qris.trim();
    }
  }
  if (!staticQris) {
    staticQris = await getActiveStaticQris();
  }

  const id = 'pay_' + randId(9);
  const ttl = EXPIRY_MIN * 60;

  // cari nominal unik (base + offset) yang belum dipakai pembayaran pending lain
  let total = 0;
  const offsets = Array.from({ length: MAX_OFFSET }, (_, i) => i);
  for (let i = offsets.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [offsets[i], offsets[j]] = [offsets[j], offsets[i]];
  }
  for (const off of offsets.slice(0, 60)) {
    if (await store.setNX(aKey(amount + off), id, ttl + 60)) {
      total = amount + off;
      break;
    }
  }
  if (!total) {
    throw Object.assign(new Error('Terlalu banyak pembayaran pending dengan nominal ini, coba lagi sebentar'), { status: 429 });
  }

  const now = Date.now();
  const activeProv = await provider.getActiveProvider().catch(() => 'gopay');
  const mdrFee = Math.ceil(total * 0.007);

  const p = {
    id,
    merchant_id: mid,
    order_id: order_id || null,
    description: description || null,
    customer: customer || null,
    amount,
    unique_code: total - amount,
    total,
    mdr_fee: mdrFee,
    net_amount: total - mdrFee,
    provider: activeProv,
    qris_string: qris.toDynamic(staticQris, total),
    status: 'pending',
    created_at: now,
    expires_at: now + ttl * 1000,
    paid_at: null,
    cancelled_at: null,
    callback_url: callback_url || null,
    payment_link: `/pay/${id}`,
    webhook_sent: false,
    gopay_trx_id: null,
  };

  await store.set(pKey(id), p, 60 * 60 * 24 * 30);
  await store.sadd('pay:pending', id);
  await store.lpush('pay:recent', id);
  await merchant.recordPayment(mid, id);

  logEvent('INFO', `Payment created: ${id} - Rp ${total} (Merchant: ${mid}, Order: ${order_id || '-'})`);
  return p;
}

const get = (id) => store.get(pKey(id));

async function webhook(p) {
  let targetUrl = p.callback_url;
  let secret = process.env.WEBHOOK_SECRET || '';
  let serverKey = process.env.API_KEY || '';

  if (p.merchant_id && p.merchant_id !== 'mid_default') {
    const m = await merchant.getRawById(p.merchant_id).catch(() => null);
    if (m) {
      if (!targetUrl && m.webhook_url) targetUrl = m.webhook_url;
      if (m.webhook_secret) secret = m.webhook_secret;
      if (m.server_key) serverKey = m.server_key;
    }
  }

  if (!targetUrl) targetUrl = (await store.get('merchant:webhook_url')) || process.env.WEBHOOK_URL;
  if (!targetUrl || p.webhook_sent) return;

  const midSig = midtransSignature(p.order_id || p.id, '200', String(p.total) + '.00', serverKey);
  const bodyObj = {
    event: 'payment.paid',
    transaction_time: new Date(p.created_at).toISOString(),
    transaction_status: 'settlement',
    transaction_id: p.id,
    status_message: 'midtrans payment notification',
    status_code: '200',
    signature_key: midSig,
    payment_type: 'qris',
    order_id: p.order_id || p.id,
    merchant_id: p.merchant_id || 'mid_default',
    gross_amount: String(p.total) + '.00',
    currency: 'IDR',
    settlement_time: new Date(p.paid_at || Date.now()).toISOString(),
    data: publicView(p),
  };
  const body = JSON.stringify(bodyObj);

  try {
    const r = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': sign(body, secret),
        'X-Midtrans-Signature': midSig,
      },
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) {
      p.webhook_sent = true;
      await store.set(pKey(p.id), p, 60 * 60 * 24 * 30);
      logEvent('INFO', `Webhook delivered to ${targetUrl} for ${p.id}`);
    } else {
      logEvent('WARN', `Webhook failed with status ${r.status} for ${p.id}`);
    }
  } catch (err) {
    logEvent('ERROR', `Webhook error for ${p.id}: ${err.message}`);
  }
}


async function feed(from) {
  const cached = await store.get('feed:cache');
  if (cached && cached.from <= from) return cached.txs;

  let txs = [];
  try {
    txs = await provider.listTransactions(new Date(from), new Date());
  } catch {
    txs = await gopay.listTransactions(new Date(from), new Date()).catch(() => []);
  }

  await store.set('feed:cache', { from, txs }, FEED_CACHE_SEC);
  return txs;
}

// Cek satu pembayaran; ubah status bila lunas / kedaluwarsa
async function check(p) {
  if (!p) return null;
  if (p.status === 'paid') {
    if (!p.webhook_sent) await webhook(p);
    return p;
  }
  if (p.status !== 'pending') return p;
  if (Date.now() > p.expires_at) {
    p.status = 'expired';
    await store.set(pKey(p.id), p, 60 * 60 * 24 * 30);
    await store.srem('pay:pending', p.id);
    await store.del(aKey(p.total));
    logEvent('INFO', `Payment expired: ${p.id}`);
    return p;
  }

  const txs = await feed(p.created_at - 60000);
  for (const t of txs) {
    if (t.amount !== p.total) continue;
    if (t.time && new Date(t.time).getTime() < p.created_at - 60000) continue;
    if (!(await store.setNX('claim:' + t.id, p.id, 60 * 60 * 24 * 30))) continue; // 1 transaksi = 1 pembayaran
    p.status = 'paid';
    p.paid_at = Date.now();
    p.gopay_trx_id = t.id;
    await store.set(pKey(p.id), p, 60 * 60 * 24 * 30);
    await store.srem('pay:pending', p.id);
    await store.del(aKey(p.total));
    logEvent('INFO', `Payment settled: ${p.id} - Rp ${p.total}`);
    await webhook(p);
    break;
  }
  return p;
}

async function cancel(id) {
  const p = await get(id);
  if (!p) throw Object.assign(new Error('Pembayaran tidak ditemukan'), { status: 404 });
  if (p.status !== 'pending') {
    throw Object.assign(new Error(`Pembayaran dengan status ${p.status} tidak dapat dibatalkan`), { status: 400 });
  }
  p.status = 'cancelled';
  p.cancelled_at = Date.now();
  await store.set(pKey(p.id), p, 60 * 60 * 24 * 30);
  await store.srem('pay:pending', p.id);
  await store.del(aKey(p.total));
  logEvent('INFO', `Payment cancelled: ${p.id}`);
  return publicView(p);
}

// Server-to-server check payment by amount (ahmadzakiyox compatibility)
async function checkByAmount({ amount, trx_id, startTime }) {
  amount = Number(amount);
  if (!amount) throw Object.assign(new Error('amount wajib diisi'), { status: 400 });

  if (trx_id) {
    const p = await get(trx_id);
    if (p) {
      await check(p);
      if (p.status === 'paid') {
        return {
          success: true,
          paid: true,
          transaction: {
            transaction_id: p.gopay_trx_id || p.id,
            order_id: p.order_id || p.id,
            amount: p.total,
            status: 'success',
            paid_at: new Date(p.paid_at || Date.now()).toISOString(),
          },
        };
      }
      return { success: true, paid: false, status: p.status };
    }
  }

  // Scan live mutations
  const fromTime = startTime ? new Date(startTime).getTime() : Date.now() - 24 * 3600 * 1000;
  const txs = await feed(fromTime);
  const matched = txs.find((t) => t.amount === amount);

  if (matched) {
    return {
      success: true,
      paid: true,
      transaction: {
        transaction_id: matched.id,
        order_id: matched.orderId || matched.id,
        amount: matched.amount,
        status: 'success',
        time: matched.time,
      },
    };
  }

  return { success: true, paid: false };
}

async function reconcileAll() {
  const ids = await store.smembers('pay:pending');
  let paid = 0;
  for (const id of ids) {
    const p = await check(await get(id));
    if (p?.status === 'paid') paid++;
    if (!p) await store.srem('pay:pending', id);
  }
  return { checked: ids.length, paid };
}

async function listRecent(n = 50) {
  const ids = await store.lrange('pay:recent', n);
  return (await Promise.all(ids.map(get))).filter(Boolean).map(publicView);
}

async function listByMerchant(merchantId, n = 50) {
  const ids = await merchant.getMerchantTxs(merchantId, n);
  return (await Promise.all(ids.map(get))).filter(Boolean).map(publicView);
}

function publicView(p) {
  const base = process.env.BASE_URL || '';
  const total = p.total || p.amount || 0;
  const mdrFee = p.mdr_fee !== undefined ? p.mdr_fee : Math.ceil(total * 0.007);
  const netAmount = p.net_amount !== undefined ? p.net_amount : (total - mdrFee);

  return {
    id: p.id,
    merchant_id: p.merchant_id || 'mid_default',
    order_id: p.order_id,
    description: p.description,
    amount: p.amount,
    unique_code: p.unique_code,
    total: p.total,
    mdr_fee: mdrFee,
    net_amount: netAmount,
    provider: p.provider || 'qris',
    status: p.status,
    created_at: new Date(p.created_at).toISOString(),
    expires_at: new Date(p.expires_at).toISOString(),
    paid_at: p.paid_at ? new Date(p.paid_at).toISOString() : null,
    cancelled_at: p.cancelled_at ? new Date(p.cancelled_at).toISOString() : null,
    payment_link: `${base}/pay/${p.id}`,
    // Compatibility fields with reference projects & Midtrans
    trx_id: p.id,
    qris_id: p.id,
    qris_url: `${base}/pay/${p.id}`,
    qris_code: p.qris_string,
    transaction_status: p.status === 'paid' ? 'settlement' : (p.status === 'expired' ? 'expire' : (p.status === 'cancelled' ? 'cancel' : 'pending')),
  };
}

module.exports = {
  create,
  get,
  check,
  cancel,
  checkByAmount,
  reconcileAll,
  listRecent,
  listByMerchant,
  publicView,
  feed,
  isPrivateUrl,
};

