const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.NODE_ENV = 'test';
process.env.STORE_DRIVER = 'memory';
process.env.API_KEY = 'test_global_key';
process.env.QRIS_STATIC = '00020101021126430013ID.CO.EXAMPLE.WWW01189360000000000000005204581253033605802ID5909TOKO TEST6007JAKARTA63041F0D';

const handler = require('../api/index');
const merchant = require('../lib/merchant');
const { midtransSignature } = require('../lib/crypto');

function mockReq(method, path, headers = {}, body = null) {
  const req = {
    method,
    url: path,
    headers: { ...headers },
    async *[Symbol.asyncIterator]() {
      if (body !== null) {
        yield typeof body === 'string' ? body : JSON.stringify(body);
      }
    },
  };
  return req;
}

function mockRes() {
  const headers = {};
  let body = '';
  return {
    statusCode: 200,
    setHeader(k, v) { headers[k.toLowerCase()] = v; },
    removeHeader(k) { delete headers[k.toLowerCase()]; },
    end(data) { body = data; },
    get response() {
      let parsed = null;
      try { parsed = JSON.parse(body); } catch {}
      return { code: this.statusCode, headers, body, json: parsed };
    },
  };
}

async function callApi(method, path, headers = {}, body = null) {
  const req = mockReq(method, path, headers, body);
  const res = mockRes();
  await handler(req, res);
  return res.response;
}

test('SaaS: Registrasi merchant baru dan generasi kredensial dedicated', async () => {
  const email = 'merchant_' + Date.now() + '@tokosaya.com';
  const res = await callApi('POST', '/api/saas/auth/register', {}, {
    name: 'Toko Sukses Berkah',
    email,
    phone: '081299887766',
    password: 'passwordRahasia123',
  });

  assert.equal(res.code, 201);
  assert.equal(res.json.success, true);
  assert.ok(res.json.merchant.id.startsWith('mid_'));
  assert.ok(res.json.merchant.server_key.startsWith('SB-Mid-server-'));
  assert.ok(res.json.merchant.client_key.startsWith('SB-Mid-client-'));
  assert.ok(res.json.merchant.webhook_secret.startsWith('whsec_'));
  assert.equal(res.json.merchant.name, 'Toko Sukses Berkah');
  assert.ok(res.json.token.startsWith('sess_'));
});

test('SaaS: Autentikasi login merchant dengan password hash', async () => {
  const email = 'auth_' + Date.now() + '@test.id';
  await callApi('POST', '/api/saas/auth/register', {}, {
    name: 'Bisnis Maju',
    email,
    password: 'securePassword999',
  });

  // Login gagal: password salah
  const failRes = await callApi('POST', '/api/saas/auth/login', {}, {
    email,
    password: 'wrongPassword',
  });
  assert.equal(failRes.code, 401);

  // Login sukses
  const successRes = await callApi('POST', '/api/saas/auth/login', {}, {
    email,
    password: 'securePassword999',
  });
  assert.equal(successRes.code, 200);
  assert.equal(successRes.json.success, true);
  assert.ok(successRes.json.token);

  // Cek /api/saas/auth/me dengan Bearer token
  const meRes = await callApi('GET', '/api/saas/auth/me', {
    authorization: 'Bearer ' + successRes.json.token,
  });
  assert.equal(meRes.code, 200);
  assert.equal(meRes.json.merchant.email, email);
});

test('SaaS Midtrans Core API: POST /api/v1/charge dengan Basic Auth Server Key', async () => {
  const email = 'midtrans_' + Date.now() + '@test.id';
  const reg = await callApi('POST', '/api/saas/auth/register', {}, {
    name: 'Midtrans Partner Store',
    email,
    password: 'secretPassword123',
  });
  const serverKey = reg.json.merchant.server_key;
  const merchantId = reg.json.merchant.id;

  // Basic Auth standar Midtrans: base64(server_key + ":")
  const basicAuth = 'Basic ' + Buffer.from(serverKey + ':').toString('base64');
  const orderId = 'MID-ORDER-' + Date.now();

  const chargeRes = await callApi('POST', '/api/v1/charge', {
    authorization: basicAuth,
    'content-type': 'application/json',
  }, {
    payment_type: 'qris',
    transaction_details: {
      order_id: orderId,
      gross_amount: 50000,
    },
    customer_details: {
      first_name: 'Budi Santoso',
      email: 'budi@example.com',
    },
  });

  assert.equal(chargeRes.code, 201);
  assert.equal(chargeRes.json.status_code, '201');
  assert.equal(chargeRes.json.payment_type, 'qris');
  assert.equal(chargeRes.json.order_id, orderId);
  assert.equal(chargeRes.json.merchant_id, merchantId);
  assert.ok(chargeRes.json.transaction_id.startsWith('pay_'));
  assert.ok(chargeRes.json.qr_string.startsWith('000201'));
  assert.ok(chargeRes.json.payment_url);
  assert.ok(Array.isArray(chargeRes.json.actions));

  // Cek Midtrans status endpoint: GET /api/v1/transactions/:order_id/status
  const statusRes = await callApi('GET', `/api/v1/transactions/${orderId}/status`, {
    authorization: basicAuth,
  });
  assert.equal(statusRes.code, 200);
  assert.equal(statusRes.json.status_code, '200');
  assert.equal(statusRes.json.order_id, orderId);
  assert.equal(statusRes.json.transaction_status, 'pending');
});

test('SaaS Snap: POST /api/v1/snap/transactions menghasilkan checkout token', async () => {
  const email = 'snap_' + Date.now() + '@test.id';
  const reg = await callApi('POST', '/api/saas/auth/register', {}, {
    name: 'Snap Store',
    email,
    password: 'password12345',
  });
  const serverKey = reg.json.merchant.server_key;

  const snapRes = await callApi('POST', '/api/v1/snap/transactions', {
    authorization: 'Bearer ' + serverKey,
    'content-type': 'application/json',
  }, {
    transaction_details: {
      order_id: 'SNAP-101',
      gross_amount: 75000,
    },
  });

  assert.equal(snapRes.code, 201);
  assert.ok(snapRes.json.token.startsWith('pay_'));
  assert.ok(snapRes.json.redirect_url.includes('/pay/'));
});

test('SaaS: Isolasi transaksi dan kalkulasi MDR 0.7% antar merchant', async () => {
  // Merchant A
  const regA = await callApi('POST', '/api/saas/auth/register', {}, {
    name: 'Merchant A',
    email: 'merchA_' + Date.now() + '@test.id',
    password: 'password123',
  });
  // Merchant B
  const regB = await callApi('POST', '/api/saas/auth/register', {}, {
    name: 'Merchant B',
    email: 'merchB_' + Date.now() + '@test.id',
    password: 'password123',
  });

  // Merchant A buat 1 transaksi
  await callApi('POST', '/api/saas/merchant/payment-link', {
    authorization: 'Bearer ' + regA.json.token,
  }, {
    amount: 100000,
    order_id: 'ORD-A-1',
  });

  // Merchant B lihat transaksinya: harus 0
  const txB = await callApi('GET', '/api/saas/merchant/transactions', {
    authorization: 'Bearer ' + regB.json.token,
  });
  assert.equal(txB.code, 200);
  assert.equal(txB.json.transactions.length, 0);

  // Merchant A lihat transaksinya: harus 1 dengan hitungan MDR 0.7% (Rp 700)
  const txA = await callApi('GET', '/api/saas/merchant/transactions', {
    authorization: 'Bearer ' + regA.json.token,
  });
  assert.equal(txA.code, 200);
  assert.equal(txA.json.transactions.length, 1);
  assert.equal(txA.json.transactions[0].amount, 100000);
  assert.ok(txA.json.transactions[0].mdr_fee > 0);
  assert.ok(txA.json.transactions[0].net_amount < txA.json.transactions[0].total);
});

test('SaaS: Formula Midtrans SHA-512 Signature Key dan verifikasi webhook test ping', async () => {
  const orderId = 'ORD-MID-555';
  const statusCode = '200';
  const grossAmount = '50000.00';
  const serverKey = 'SB-Mid-server-testkey123';

  // Standar Midtrans: SHA512(order_id + status_code + gross_amount + server_key)
  const expectedSig = crypto.createHash('sha512').update(`${orderId}${statusCode}${grossAmount}${serverKey}`).digest('hex');
  const computedSig = midtransSignature(orderId, statusCode, grossAmount, serverKey);

  assert.equal(computedSig, expectedSig);
});

test('SaaS: Proteksi SSRF pada pengaturan webhook merchant', async () => {
  const reg = await callApi('POST', '/api/saas/auth/register', {}, {
    name: 'Secure Merchant',
    email: 'sec_' + Date.now() + '@test.id',
    password: 'password123',
  });

  // Coba pasang IP lokal/internal
  const resBad = await callApi('POST', '/api/saas/merchant/webhook', {
    authorization: 'Bearer ' + reg.json.token,
  }, {
    webhook_url: 'http://127.0.0.1:8080/hack',
  });
  assert.equal(resBad.code, 400);
  assert.match(resBad.json.error, /SSRF/);

  // Pasang URL publik valid
  const resGood = await callApi('POST', '/api/saas/merchant/webhook', {
    authorization: 'Bearer ' + reg.json.token,
  }, {
    webhook_url: 'https://webhook.site/my-endpoint',
  });
  assert.equal(resGood.code, 200);
  assert.equal(resGood.json.data.webhook_url, 'https://webhook.site/my-endpoint');
});
