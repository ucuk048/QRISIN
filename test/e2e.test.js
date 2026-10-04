const test = require('node:test');
const assert = require('node:assert');
process.env.NODE_ENV = 'test';
process.env.API_KEY = 'k'; process.env.ADMIN_PASSWORD = 'a'; process.env.WEBHOOK_SECRET = 's';
process.env.ENCRYPTION_KEY = 'ab'.repeat(32); process.env.BASE_URL = 'https://x.test';
const q = require('../lib/qris'); const store = require('../lib/store'); const { encrypt, sign } = require('../lib/crypto');
const handler = require('../api/index');
const m = '0013ID.CO.EXAMPLE.WWW0118936000000000000000';
const b = '000201010211' + '26' + String(m.length).padStart(2, '0') + m + '5204581253033605802ID5909TOKO TEST6007JAKARTA6304';
const STATIC = b + q.crc16(b);
let feedTxs = [], hooks = [];
global.fetch = async (url, opt) => {
  const u = String(url);
  if (u.includes('merchant-analytics')) return new Response(JSON.stringify({ transactions: feedTxs }), { status: 200 });
  hooks.push({ url: u, opt }); return new Response('{}', { status: 200 });
};
function call(method, path, headers = {}, body) {
  return new Promise(async (resolve) => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(d) { resolve({ code: this.statusCode, body: d }); } };
    await handler({ method, url: path, headers, body }, res);
  });
}
const origFetch = global.fetch;
test('alur pembayaran', async (t) => {
  t.after(() => { global.fetch = origFetch; });
  await store.set('gopay:session', encrypt(JSON.stringify({ access: 't', refresh: 'r', expiresAt: Date.now() + 3600e3, merchantId: 'M1', qris: STATIC })));
  assert.equal((await call('POST', '/api/v1/payments', {}, { amount: 10000 })).code, 401);
  const c = await call('POST', '/api/v1/payments', { 'x-api-key': 'k' }, { amount: 10000, order_id: 'INV1', callback_url: 'https://shop.test/hook' });
  assert.equal(c.code, 201);
  const p = JSON.parse(c.body);
  assert.ok(p.total > 10000 && p.total <= 10999);
  const page = await call('GET', '/pay/' + p.id);
  assert.match(page.body, /data:image\/png/);
  assert.equal(JSON.parse((await call('GET', '/api/public/payments/' + p.id)).body).status, 'pending');
  feedTxs = [{ id: 'T1', order_id: 'x', real_gross_amount: p.total * 100, transaction_time: new Date().toISOString(), transaction_status: 'settlement' }];
  await new Promise((r) => setTimeout(r, 4200)); // lewati cache feed
  const s = JSON.parse((await call('GET', '/api/public/payments/' + p.id)).body);
  assert.equal(s.status, 'paid');
  assert.equal(hooks.length, 1);
  assert.equal(hooks[0].opt.headers['X-Signature'], sign(hooks[0].opt.body, 's'));
  // transaksi yang sama tidak boleh klaim pembayaran lain dengan nominal sama
  const c2 = JSON.parse((await call('POST', '/api/v1/payments', { 'x-api-key': 'k' }, { amount: 10000 })).body);
  assert.notEqual(c2.total, p.total);
});

