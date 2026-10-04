// Klien GoBiz/GoPay Merchant (API tidak resmi, berdasarkan alur dashboard web).
// Base URL bisa di-override lewat env bila Gojek mengubahnya.
const store = require('./store');
const { encrypt, decrypt } = require('./crypto');
const qris = require('./qris');

const GOID = process.env.GOID_BASE_URL || 'https://api.gobiz.co.id';
const GOBIZ = process.env.GOBIZ_BASE_URL || 'https://api.gobiz.co.id';
const FEED = process.env.GOBIZ_FEED_BASE_URL || GOBIZ;
const CLIENT_ID = process.env.GOID_CLIENT_ID || 'go-biz-web-new';
const SESSION_KEY = 'gopay:session';
const FEED_SCALE = 100; // minor unit -> rupiah

const HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  'Authentication-Type': 'go-id',
  'X-PhoneMake': 'Web', 'X-PhoneModel': 'Web Client', 'x-DeviceOS': 'Web',
  'X-User-Locale': 'id', 'Gojek-Country-Code': 'ID', 'Gojek-Timezone': 'Asia/Jakarta',
  'X-Platform': 'Web', 'X-User-Type': 'merchant',
  'x-appId': process.env.GOID_APP_ID || 'go-biz-web-dashboard',
};

async function http(base, path, { method = 'GET', query, body, token } = {}) {
  const u = new URL(base + path);
  if (query) for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
  const res = await fetch(u, {
    method,
    headers: { ...HEADERS, Authorization: 'Bearer' + (token ? ' ' + token : '') },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!res.ok) {
    const e = new Error(`GoPay HTTP ${res.status}`);
    e.status = res.status;
    e.detail = json?.errors?.[0]?.message || json?.message || undefined;
    throw e;
  }
  return json;
}

const normPhone = (p) => String(p).replace(/\D/g, '').replace(/^0+/, '').replace(/^62/, '');

async function loadSession() {
  const raw = await store.get(SESSION_KEY);
  return raw ? JSON.parse(decrypt(raw)) : null;
}
const saveSession = (s) => store.set(SESSION_KEY, encrypt(JSON.stringify(s)));

async function requestOtp(phone) {
  const json = await http(GOID, '/goid/login/request', {
    method: 'POST',
    body: { client_id: CLIENT_ID, phone_number: normPhone(phone), country_code: '+62' },
  });
  if (json && json.success === false) throw new Error(json.errors?.[0]?.message || 'Gagal meminta OTP');
  const otpToken = json?.data?.otp_token || json?.data?.token;
  if (!otpToken) throw new Error('Respons OTP tidak berisi otp_token');
  // otp_token disimpan di server, tidak dikirim ke browser
  await store.set('gopay:otp', encrypt(otpToken), 600);
}

function toSession(t, prev = {}) {
  if (!t?.access_token) throw new Error('Respons token tidak berisi access_token');
  return {
    ...prev,
    access: t.access_token,
    refresh: t.refresh_token || prev.refresh,
    expiresAt: t.expires_in ? Date.now() + t.expires_in * 1000 : 0,
  };
}

async function verifyOtp(otp) {
  const enc = await store.get('gopay:otp');
  if (!enc) throw new Error('OTP kedaluwarsa, minta OTP baru');
  const t = await http(GOID, '/goid/token', {
    method: 'POST',
    body: { client_id: CLIENT_ID, grant_type: 'otp', data: { otp: String(otp), otp_token: decrypt(enc) } },
  });
  let s = toSession(t);
  // Ambil merchant + string QRIS statis
  const me = await http(GOBIZ, '/v1/users/me', { token: s.access });
  const merchantId = me?.user?.merchant_id;
  if (!merchantId) throw new Error('merchant_id tidak ditemukan pada akun ini');
  const m = await http(GOBIZ, '/v1/merchants/' + merchantId, { token: s.access });
  let qr = '';
  for (const p of m?.pops || []) { if (p?.gopay?.aspi_qr_string) { qr = p.gopay.aspi_qr_string; break; } }
  if (!qr) throw new Error('QRIS statis tidak ditemukan pada merchant ini');
  qris.validate(qr);
  s = { ...s, merchantId, merchantName: m.merchant_name || '', qris: qr };
  await saveSession(s);
  await store.del('gopay:otp');
  return { merchantId, merchantName: s.merchantName };
}

async function refresh(s) {
  const t = await http(GOID, '/goid/token', {
    method: 'POST',
    body: { client_id: CLIENT_ID, grant_type: 'refresh_token', data: { refresh_token: s.refresh } },
  });
  const ns = toSession(t, s);
  await saveSession(ns);
  return ns;
}

async function getSession() {
  let s = await loadSession();
  if (!s) throw Object.assign(new Error('Akun GoPay belum terhubung. Login di /admin.'), { status: 503 });
  if (s.expiresAt && s.expiresAt - Date.now() < 5 * 60 * 1000) s = await refresh(s);
  return s;
}

async function listTransactions(startTime, endTime) {
  let s = await getSession();
  const call = (tok) => http(FEED, '/merchant-analytics/v2/merchants/transactions', {
    token: tok,
    query: {
      from: '0', size: '100',
      start_time: startTime.toISOString(), end_time: endTime.toISOString(),
      merchant_ids: s.merchantId, statuses: 'settlement,capture', payment_types: 'qris,gopay',
    },
  });
  let json;
  try { json = await call(s.access); }
  catch (e) {
    if (e.status !== 401) throw e;
    s = await refresh(s); json = await call(s.access);
  }
  return (json?.transactions || []).map((t) => ({
    id: t.id,
    orderId: t.order_id,
    amount: Math.trunc((t.real_gross_amount || t.gross_amount || 0) / FEED_SCALE),
    time: t.transaction_time || t.settlement_time,
    status: t.transaction_status,
  }));
}

async function status() {
  const s = await loadSession();
  return s ? { connected: true, merchantId: s.merchantId, merchantName: s.merchantName, tokenExpiresAt: s.expiresAt } : { connected: false };
}

module.exports = { requestOtp, verifyOtp, getSession, listTransactions, status };
