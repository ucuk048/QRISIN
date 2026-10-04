const test = require('node:test');
const assert = require('node:assert');

process.env.NODE_ENV = 'test';
process.env.API_KEY = 'test-api-key';
process.env.ADMIN_PASSWORD = 'admin-password-test';
process.env.WEBHOOK_SECRET = 'webhook-secret-test';
process.env.ENCRYPTION_KEY = '12'.repeat(32);
process.env.BASE_URL = 'https://qriskuu.test';

const q = require('../lib/qris');
const store = require('../lib/store');
const { encrypt } = require('../lib/crypto');
const handler = require('../api/index');

const m = '0013ID.CO.EXAMPLE.WWW0118936000000000000000';
const b = '000201010211' + '26' + String(m.length).padStart(2, '0') + m + '5204581253033605802ID5909TOKO TEST6007JAKARTA6304';
const STATIC = b + q.crc16(b);

function call(method, path, headers = {}, body) {
  return new Promise(async (resolve) => {
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      end(d) { resolve({ code: this.statusCode, body: d, headers: this.headers }); }
    };
    await handler({ method, url: path, headers, body }, res);
  });
}

test('qriskuu: halaman web utama (Landing, Docs, Admin, Health)', async () => {
  const landing = await call('GET', '/');
  assert.equal(landing.code, 200);
  assert.match(landing.body, /qriskuu/);
  assert.match(landing.body, /data-theme="light"/);

  const docs = await call('GET', '/docs');
  assert.equal(docs.code, 200);
  assert.match(docs.body, /Dokumentasi API/);

  const admin = await call('GET', '/admin');
  assert.equal(admin.code, 200);
  assert.match(admin.body, /Admin Merchant Portal/);

  const health = await call('GET', '/health');
  assert.equal(health.code, 200);
  assert.equal(JSON.parse(health.body).ok, true);
});

test('qriskuu: kompatibilitas endpoint create-qris, check-payment, token-status, cancel', async () => {
  await store.set('gopay:session', encrypt(JSON.stringify({
    access: 'tok', refresh: 'ref', expiresAt: Date.now() + 3600e3, merchantId: 'M1', qris: STATIC, merchantName: 'Toko Uji'
  })));

  // 1. GET /create-qris dengan query params
  const resGet = await call('GET', '/create-qris?amount=50000&api_key=test-api-key&order_id=ORD-99');
  assert.equal(resGet.code, 200);
  const dataGet = JSON.parse(resGet.body);
  assert.equal(dataGet.success, true);
  assert.ok(dataGet.data.qris_id);
  assert.ok(dataGet.data.total >= 50000);
  assert.equal(dataGet.data.amount, 50000);

  // 2. GET /token-status
  const resToken = await call('GET', '/token-status?api_key=test-api-key');
  assert.equal(resToken.code, 200);
  const dataToken = JSON.parse(resToken.body);
  assert.equal(dataToken.success, true);
  assert.equal(dataToken.data.token_status, 'valid');

  // 3. GET /check-payment
  const resCheck = await call('GET', `/check-payment?amount=${dataGet.data.total}&trx_id=${dataGet.data.trx_id}&api_key=test-api-key`);
  assert.equal(resCheck.code, 200);
  const dataCheck = JSON.parse(resCheck.body);
  assert.equal(dataCheck.success, true);
  assert.equal(dataCheck.paid, false);

  // 4. POST /api/v1/payments/:id/cancel
  const resCancel = await call('POST', `/api/v1/payments/${dataGet.data.trx_id}/cancel`, { 'x-api-key': 'test-api-key' });
  assert.equal(resCancel.code, 200);
  const dataCancel = JSON.parse(resCancel.body);
  assert.equal(dataCancel.status, 'cancelled');

  // 5. GET /api/logs
  const resLogs = await call('GET', '/api/logs?api_key=test-api-key');
  assert.equal(resLogs.code, 200);
  const dataLogs = JSON.parse(resLogs.body);
  assert.equal(dataLogs.success, true);
  assert.ok(Array.isArray(dataLogs.logs));
});

test('qriskuu: Shopee token update & manual static QRIS', async () => {
  // Update Shopee token
  const resUpdate = await call('POST', '/update-token?api_key=test-api-key', {}, {
    token: 'B:test-shopee-token',
    staticQris: STATIC,
    merchantName: 'Toko Shopee Test'
  });
  assert.equal(resUpdate.code, 200);

  // Set Manual QRIS via Admin
  const resManual = await call('POST', '/api/admin/manual-qris', { 'x-admin-password': 'admin-password-test' }, {
    qris: STATIC,
    name: 'Toko Manual Test'
  });
  assert.equal(resManual.code, 200);
  assert.equal(JSON.parse(resManual.body).ok, true);

  // Switch Active Provider
  const resProv = await call('POST', '/api/admin/provider', { 'x-admin-password': 'admin-password-test' }, {
    provider: 'shopee'
  });
  assert.equal(resProv.code, 200);
  assert.equal(JSON.parse(resProv.body).activeProvider, 'shopee');
});
