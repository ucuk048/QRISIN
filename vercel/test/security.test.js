const test = require('node:test');
const assert = require('node:assert');
const { safeEqual } = require('../lib/crypto');
const payments = require('../lib/payments');
const handler = require('../api/index');

process.env.NODE_ENV = 'test';
process.env.API_KEY = 'secret_key_123';
process.env.ADMIN_PASSWORD = 'admin_password_456';
process.env.WEBHOOK_SECRET = 'secret_webhook_789';

function call(method, path, headers = {}, body = undefined) {
  return new Promise(async (resolve) => {
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      removeHeader(k) { delete this.headers[k.toLowerCase()]; },
      end(d) {
        resolve({
          code: this.statusCode,
          headers: this.headers,
          body: d ? (typeof d === 'string' ? d : d.toString()) : ''
        });
      }
    };
    const req = {
      method,
      url: path,
      headers,
      body,
      socket: { remoteAddress: '127.0.0.1' },
      [Symbol.asyncIterator]: async function* () {
        if (body !== undefined) {
          const s = typeof body === 'string' ? body : JSON.stringify(body);
          yield Buffer.from(s);
        }
      }
    };
    await handler(req, res);
  });
}

test('OWASP ZAP: Security Headers presence and values', async () => {
  const r = await call('GET', '/health');
  assert.equal(r.code, 200);
  assert.equal(r.headers['x-frame-options'], 'SAMEORIGIN');
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.equal(r.headers['x-xss-protection'], '1; mode=block');
  assert.equal(r.headers['referrer-policy'], 'strict-origin-when-cross-origin');
  assert.match(r.headers['permissions-policy'], /camera=\(\)/);
  assert.match(r.headers['content-security-policy'], /frame-ancestors 'self'/);
  assert.match(r.headers['content-security-policy'], /default-src 'self'/);
  assert.match(r.headers['cache-control'], /no-store/);
  assert.equal(r.headers['x-powered-by'], undefined);
});

test('OWASP ZAP: Anti-Clickjacking Framebusting script in HTML shell', async () => {
  const r = await call('GET', '/');
  assert.equal(r.code, 200);
  assert.match(r.body, /window\.top !== window\.self/);
  assert.match(r.body, /data-theme="light"/);

  const docs = await call('GET', '/docs');
  assert.match(docs.body, /window\.top !== window\.self/);

  const admin = await call('GET', '/admin');
  assert.match(admin.body, /window\.top !== window\.self/);
});

test('OWASP ZAP: SSRF Defense blocks private and loopback addresses', async () => {
  assert.equal(payments.isPrivateUrl('http://127.0.0.1:8080'), true);
  assert.equal(payments.isPrivateUrl('http://localhost:3000'), true);
  assert.equal(payments.isPrivateUrl('http://169.254.169.254/latest/meta-data/'), true);
  assert.equal(payments.isPrivateUrl('http://10.0.0.1/admin'), true);
  assert.equal(payments.isPrivateUrl('http://192.168.1.1/router'), true);
  assert.equal(payments.isPrivateUrl('http://172.16.0.5/internal'), true);
  assert.equal(payments.isPrivateUrl('http://internal.service.local'), true);
  assert.equal(payments.isPrivateUrl('ftp://example.com'), true);
  assert.equal(payments.isPrivateUrl('https://valid-merchant.com/webhook'), false);

  const r = await call('POST', '/api/v1/payments', { 'x-api-key': 'secret_key_123' }, {
    amount: 15000,
    order_id: 'SSRF-TEST',
    callback_url: 'http://169.254.169.254/latest/meta-data/'
  });
  assert.equal(r.code, 400);
  assert.match(r.body, /SSRF Protection/);
});

test('OWASP ZAP: CWE-400 Payload Too Large rejection (>1MB)', async () => {
  const req = {
    method: 'POST',
    url: '/api/v1/payments',
    headers: { 'x-api-key': 'secret_key_123' },
    socket: { remoteAddress: '127.0.0.1' },
    [Symbol.asyncIterator]: async function* () {
      const chunk = Buffer.alloc(600 * 1024, 'x');
      yield chunk;
      yield chunk;
    }
  };

  const res = {
    statusCode: 200,
    headers: {},
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    removeHeader(k) { delete this.headers[k.toLowerCase()]; },
    end(d) { this.body = d; }
  };

  await handler(req, res);
  assert.equal(res.statusCode, 413);
  assert.match(res.body, /Payload Too Large/);
});

test('OWASP ZAP: Rate Limiting defense against Brute Force', async () => {
  const headers = { 'x-test-ratelimit': '1' };
  const r1 = await call('GET', '/health', headers);
  assert.equal(r1.code, 200);

  const r2 = await call('GET', '/health', headers);
  assert.equal(r2.code, 200);

  const r3 = await call('GET', '/health', headers);
  assert.equal(r3.code, 429);
  assert.match(r3.body, /Too Many Requests/);
});

test('OWASP ZAP: Constant-time safeEqual timing attack defense', () => {
  assert.equal(safeEqual('correct-token', 'correct-token'), true);
  assert.equal(safeEqual('correct-token', 'wrong-token'), false);
  assert.equal(safeEqual('correct-token', 'correct-token-extra'), false);
  assert.equal(safeEqual('', 'anything'), false);
  assert.equal(safeEqual(null, undefined), false);
});
