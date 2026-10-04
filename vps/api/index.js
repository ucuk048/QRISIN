const payments = require('../lib/payments');
const provider = require('../lib/provider');
const gopay = require('../lib/gopay');
const shopee = require('../lib/shopee');
const pages = require('../lib/pages');
const logger = require('../lib/logger');
const store = require('../lib/store');
const merchant = require('../lib/merchant');
const { safeEqual, randId, midtransSignature, sign } = require('../lib/crypto');
const QRCode = require('qrcode');

const rateLimitMap = new Map();
function checkRateLimit(req, limit = 120, windowMs = 60000) {
  // Biarkan saat test lingkungan kecuali jika ada header pengujian x-test-ratelimit
  if (process.env.NODE_ENV === 'test' && !req.headers?.['x-test-ratelimit']) return true;
  if (req.headers?.['x-test-ratelimit']) limit = 2; // limit kecil untuk unit test
  const ip = req.headers?.['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || '127.0.0.1';
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) {
    entry.count = 1;
    entry.resetAt = now + windowMs;
  } else {
    entry.count++;
  }
  rateLimitMap.set(ip, entry);
  if (rateLimitMap.size > 2000) {
    for (const [k, v] of rateLimitMap) {
      if (now > v.resetAt) rateLimitMap.delete(k);
    }
  }
  return entry.count <= limit;
}

const send = (res, code, body, type = 'application/json') => {
  res.statusCode = code;
  res.setHeader('Content-Type', type + '; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  // OWASP ZAP Enterprise Security Hardening Headers
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https: blob:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self';");
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  if (typeof res.removeHeader === 'function') {
    res.removeHeader('X-Powered-By');
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, X-Server-Key, Authorization, x-admin-password, X-Shopee-Token');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach((c) => {
      const parts = c.split('=');
      list[parts.shift().trim()] = decodeURI(parts.join('='));
    });
  }
  return list;
}

async function readBody(req) {
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  let s = '';
  let size = 0;
  const MAX_SIZE = 1024 * 1024; // 1 MB limit (CWE-400 DoS defense)
  for await (const c of req) {
    size += c.length;
    if (size > MAX_SIZE) {
      throw Object.assign(new Error('Payload Too Large: Maksimal 1MB'), { status: 413 });
    }
    s += c;
  }
  return s ? JSON.parse(s) : {};
}

const needKey = (req, q = {}) => {
  const k = req.headers['x-api-key'] || q.api_key;
  return safeEqual(k, process.env.API_KEY) && !!process.env.API_KEY;
};

const needAdmin = (req) => {
  const cookies = parseCookies(req);
  if (process.env.GP_SESS && cookies.gp_sess && safeEqual(cookies.gp_sess, process.env.GP_SESS)) {
    return true;
  }
  const p = req.headers['x-admin-password'];
  return safeEqual(p, process.env.ADMIN_PASSWORD) && !!process.env.ADMIN_PASSWORD;
};

async function resolveMerchant(req, q = {}) {
  const auth = req.headers['authorization'] || '';
  if (auth.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(auth.slice(6).trim(), 'base64').toString('utf8');
      const serverKey = decoded.split(':')[0].trim();
      const m = await merchant.getByServerKey(serverKey);
      if (m) return m;
    } catch {}
  }
  if (auth.startsWith('Bearer ')) {
    const tokenOrKey = auth.slice(7).trim();
    if (tokenOrKey.startsWith('sess_')) {
      const m = await merchant.getByToken(tokenOrKey);
      if (m) return m;
    } else {
      const m = await merchant.getByServerKey(tokenOrKey);
      if (m) return m;
    }
  }

  const sKey = req.headers['x-server-key'] || req.headers['x-api-key'] || q.api_key || q.server_key;
  if (sKey) {
    const m = await merchant.getByServerKey(sKey);
    if (m) return m;
  }

  const cookies = parseCookies(req);
  if (cookies.merchant_token) {
    const m = await merchant.getByToken(cookies.merchant_token);
    if (m) return m;
  }

  if (needAdmin(req) || needKey(req, q)) {
    return merchant.getDefaultMerchant();
  }

  return null;
}


module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    return send(res, 204, '');
  }

  if (!checkRateLimit(req)) {
    return send(res, 429, { error: 'Too Many Requests: Rate limit exceeded' });
  }

  const rawUrl = req.headers['x-forwarded-uri'] || req.headers['x-matched-path'] || req.url;
  const urlObj = new URL(rawUrl, 'http://localhost');
  let path = urlObj.pathname.replace(/\/+$/, '') || '/';
  if (path === '/api/index') path = '/';
  const query = Object.fromEntries(urlObj.searchParams.entries());
  const m = req.method;

  try {
    // 1. Web Views
    if (m === 'GET' && path === '/') return send(res, 200, pages.landing(), 'text/html');
    if (m === 'GET' && path === '/docs') return send(res, 200, pages.docsPage(), 'text/html');
    if (m === 'GET' && (path === '/admin' || path === '/dashboard')) return send(res, 200, pages.admin(), 'text/html');
    if (m === 'GET' && (path === '/health' || path === '/api/health')) {
      return send(res, 200, { ok: true, success: true, timestamp: new Date().toISOString() });
    }

    let r;
    // 2. Public Payment / QR Views (/pay/:id dan /qr/:id)
    if ((r = path.match(/^\/(?:pay|qr)\/([\w-]+)$/)) && m === 'GET') {
      const p = await payments.check(await payments.get(r[1]));
      if (!p) return send(res, 404, '<h1>404 Pembayaran Tidak Ditemukan</h1>', 'text/html');

      if (query.raw === '1' || query.format === 'raw') {
        const qrBuffer = await QRCode.toBuffer(p.qris_string, { margin: 1, width: 440 });
        res.statusCode = 200;
        res.setHeader('Content-Type', 'image/png');
        return res.end(qrBuffer);
      }

      return send(res, 200, await pages.payPage(p), 'text/html');
    }

    // 3. Permanent Pay Link (/link/:slug) gaya qriskuu
    if ((r = path.match(/^\/link\/([\w-]+)$/)) && m === 'GET') {
      const provStat = await provider.status();
      const merchantName = provStat.providers.gopay.merchantName
        || provStat.providers.shopee.merchantName
        || provStat.providers.manual.merchantName
        || 'Toko QRIS';
      return send(res, 200, pages.payLinkPage({ name: merchantName, slug: r[1] }), 'text/html');
    }

    // 4. Public Status Check (/api/public/payments/:id & /api/qr-status/:id)
    if ((r = path.match(/^\/(?:api\/public\/payments|api\/qr-status)\/([\w-]+)$/)) && m === 'GET') {
      const p = await payments.check(await payments.get(r[1]));
      return p
        ? send(res, 200, { id: p.id, status: p.status, total: p.total, order_id: p.order_id })
        : send(res, 404, { error: 'not_found' });
    }

    // 5. Public Simulator / Link Create
    if ((path === '/api/public/simulate-create' || path === '/api/public/link-create') && m === 'POST') {
      const b = await readBody(req);
      const amt = Number(b.amount || 25000);
      const p = await payments.create({
        amount: amt,
        order_id: b.order_id || 'LINK-' + Date.now().toString().slice(-4),
        description: b.description || 'Pembayaran QRIS',
        customer: b.customer || null,
      });
      return send(res, 201, payments.publicView(p));
    }

    // 6. Cron Reconcile Trigger
    if (path === '/api/cron/reconcile') {
      const ok = (process.env.CRON_SECRET && safeEqual(req.headers.authorization, 'Bearer ' + process.env.CRON_SECRET))
        || needAdmin(req);
      return ok ? send(res, 200, await payments.reconcileAll()) : send(res, 401, { error: 'unauthorized' });
    }

    // 7. qriskuu Native API Architecture Endpoints
    if (path === '/auth/me' && m === 'GET') {
      const provStat = await provider.status();
      return send(res, 200, {
        success: true,
        code: 200,
        message: 'User info retrieved',
        data: {
          username: 'merchant_qriskuu',
          email: 'merchant@qriskuu.local',
          phone: 'usr_merchant',
          email_verified: true,
          has_password: true,
          gopay_connected: !!provStat.providers.gopay.connected,
          shopee_connected: !!provStat.providers.shopee.connected,
          gopay_has_qris: !!provStat.providers.gopay.merchantId,
          shopee_has_qris: !!provStat.providers.shopee.hasQris,
          created_at: new Date().toISOString(),
        },
        meta: { timestamp: Math.floor(Date.now() / 1000), version: '1.0.0' },
      });
    }

    if (path === '/merchant/profile' && m === 'GET') {
      const provStat = await provider.status();
      return send(res, 200, {
        success: true,
        code: 200,
        message: 'Merchant profile retrieved',
        data: {
          username: 'merchant_qriskuu',
          email: 'merchant@qriskuu.local',
          merchant_name: provStat.providers.gopay.merchantName || provStat.providers.shopee.merchantName || 'Toko Saya',
          logo_url: null,
          gopay_connected: !!provStat.providers.gopay.connected,
          gopay_qris: provStat.providers.gopay.connected ? 'active' : null,
          shopee_connected: !!provStat.providers.shopee.connected,
          shopee_qris: provStat.providers.shopee.connected ? 'active' : null,
        },
        meta: { timestamp: Math.floor(Date.now() / 1000), version: '1.0.0' },
      });
    }

    if (path === '/auth/gopay/overview' && m === 'GET') {
      const gp = await gopay.status();
      return send(res, 200, {
        success: true,
        code: 200,
        message: 'Success',
        data: { total: 0, count: 0, connected: !!gp.connected },
        meta: { timestamp: Math.floor(Date.now() / 1000), version: '1.0.0' },
      });
    }

    if (path === '/auth/shoppee/overview' && m === 'GET') {
      const sp = await shopee.status();
      return send(res, 200, {
        success: true,
        code: 200,
        message: 'Success',
        data: { total: 0, count: 0, connected: !!sp.connected },
        meta: { timestamp: Math.floor(Date.now() / 1000), version: '1.0.0' },
      });
    }

    if (path === '/auth/gopay/request' && m === 'POST') {
      const b = await readBody(req);
      await gopay.requestOtp(b.phone);
      return send(res, 200, { success: true, message: 'OTP terkirim' });
    }

    if (path === '/auth/gopay/verify' && m === 'POST') {
      const b = await readBody(req);
      const resGp = await gopay.verifyOtp(b.otp);
      return send(res, 200, { success: true, data: resGp });
    }

    if (path === '/auth/shoppee/otp/verify' && m === 'POST') {
      const b = await readBody(req);
      const resSp = await shopee.updateToken({ token: b.token || b.otp, staticQris: b.staticQris });
      return send(res, 200, { success: true, data: resSp });
    }

    if (path === '/merchant/pay-link' && m === 'GET') {
      const slug = (await store.get('merchant:pay_link_slug')) || 'main';
      const base = process.env.BASE_URL || 'http://localhost:3000';
      return send(res, 200, {
        success: true,
        code: 200,
        message: 'Payment link retrieved',
        data: { slug, url: `${base}/link/${slug}` },
        meta: { timestamp: Math.floor(Date.now() / 1000), version: '1.0.0' },
      });
    }

    if (path === '/merchant/pay-link/regenerate' && m === 'POST') {
      const newSlug = randId(8);
      await store.set('merchant:pay_link_slug', newSlug);
      const base = process.env.BASE_URL || 'http://localhost:3000';
      return send(res, 200, {
        success: true,
        data: { slug: newSlug, url: `${base}/link/${newSlug}` },
      });
    }

    if (path === '/merchant/webhooks' && m === 'GET') {
      return send(res, 200, {
        success: true,
        code: 200,
        message: 'Webhook settings retrieved',
        data: {
          webhooks: process.env.WEBHOOK_URL ? [process.env.WEBHOOK_URL] : [],
          webhook_secret: process.env.WEBHOOK_SECRET || null,
          notify_email: false,
          gopay_has_qris: true,
          shopee_has_qris: true,
        },
        meta: { timestamp: Math.floor(Date.now() / 1000), version: '1.0.0' },
      });
    }

    if (path === '/payments' && m === 'GET') {
      const recent = await payments.listRecent(50);
      return send(res, 200, {
        success: true,
        code: 200,
        message: 'Transactions retrieved successfully',
        data: recent,
        meta: {
          timestamp: Math.floor(Date.now() / 1000),
          version: '1.0.0',
          pagination: {
            total: recent.length,
            page: 1,
            limit: 50,
            total_pages: 1,
          },
        },
      });
    }

    if (path === '/auth/api-key' && m === 'GET') {
      return send(res, 200, {
        success: true,
        code: 200,
        data: { api_key: process.env.API_KEY || 'Belum diatur di .env' },
      });
    }

    // 8. SaaS Multi-Tenant & Midtrans-Compatible Core Charge API
    // 8a. Midtrans Core API: /api/v1/charge, /v2/charge & Snap /api/v1/snap/transactions
    if ((path === '/api/v1/charge' || path === '/v2/charge') && m === 'POST') {
      const merchantObj = await resolveMerchant(req, query);
      if (!merchantObj) return send(res, 401, { status_code: '401', status_message: 'Unauthorized: Invalid Server Key or API Key' });

      const b = await readBody(req);
      const details = b.transaction_details || {};
      const grossAmount = details.gross_amount || b.gross_amount || b.amount;
      const orderId = details.order_id || b.order_id || 'ORDER-' + randId(6);
      const customer = b.customer_details ? (b.customer_details.first_name || b.customer_details.email || '') : (b.customer || '');
      const callbackUrl = b.callback_url || null;

      const p = await payments.create({
        amount: Number(grossAmount),
        order_id: orderId,
        description: b.description || 'Tagihan QRIS',
        customer,
        callback_url: callbackUrl,
        merchant_id: merchantObj.id,
      });

      return send(res, 201, {
        status_code: '201',
        status_message: 'QRIS transaction is created',
        transaction_id: p.id,
        order_id: p.order_id,
        merchant_id: p.merchant_id,
        gross_amount: String(p.total),
        currency: 'IDR',
        payment_type: 'qris',
        transaction_status: 'pending',
        transaction_time: new Date(p.created_at).toISOString(),
        qr_string: p.qris_string,
        qr_url: `/qr/${p.id}?raw=1`,
        payment_url: p.payment_link,
        actions: [
          { name: 'generate-qr-code', method: 'GET', url: `/qr/${p.id}?raw=1` },
          { name: 'deeplink-checkout', method: 'GET', url: p.payment_link },
        ],
      });
    }

    if ((path === '/api/v1/snap/transactions' || path === '/snap/v1/transactions') && m === 'POST') {
      const merchantObj = await resolveMerchant(req, query);
      if (!merchantObj) return send(res, 401, { error: 'Unauthorized: Invalid Server Key' });

      const b = await readBody(req);
      const details = b.transaction_details || {};
      const grossAmount = details.gross_amount || b.gross_amount || b.amount;
      const orderId = details.order_id || b.order_id || 'SNAP-' + randId(6);
      const customer = b.customer_details ? (b.customer_details.first_name || b.customer_details.email || '') : (b.customer || '');

      const p = await payments.create({
        amount: Number(grossAmount),
        order_id: orderId,
        description: b.description || 'Snap Checkout',
        customer,
        callback_url: b.callback_url || null,
        merchant_id: merchantObj.id,
      });

      return send(res, 201, {
        token: p.id,
        redirect_url: p.payment_link,
        transaction_id: p.id,
      });
    }

    // 8b. Midtrans Status Check: /api/v1/transactions/:order_id/status atau /v2/:order_id/status
    if ((r = path.match(/^\/(?:api\/v1\/transactions|v2)\/([\w-]+)\/status$/)) && m === 'GET') {
      const merchantObj = await resolveMerchant(req, query);
      if (!merchantObj) return send(res, 401, { status_code: '401', status_message: 'Unauthorized' });

      const targetIdOrOrder = r[1];
      let p = await payments.get(targetIdOrOrder);
      if (!p) {
        // Cari by order_id di list merchant
        const list = await payments.listByMerchant(merchantObj.id, 100);
        p = list.find((item) => item.order_id === targetIdOrOrder);
        if (p) p = await payments.get(p.id);
      }

      if (!p) return send(res, 404, { status_code: '404', status_message: 'Transaction not found' });
      p = await payments.check(p);

      return send(res, 200, {
        status_code: '200',
        status_message: 'Success, transaction found',
        transaction_id: p.id,
        order_id: p.order_id || p.id,
        merchant_id: p.merchant_id || 'mid_default',
        gross_amount: String(p.total) + '.00',
        currency: 'IDR',
        payment_type: 'qris',
        transaction_status: p.status === 'paid' ? 'settlement' : (p.status === 'expired' ? 'expire' : (p.status === 'cancelled' ? 'cancel' : 'pending')),
        transaction_time: new Date(p.created_at).toISOString(),
        settlement_time: p.paid_at ? new Date(p.paid_at).toISOString() : null,
      });
    }

    // 8c. SaaS Merchant Portal Management Endpoints
    if (path.startsWith('/api/saas/')) {
      if (path === '/api/saas/auth/register' && m === 'POST') {
        const b = await readBody(req);
        const resAuth = await merchant.register(b);
        res.setHeader('Set-Cookie', `merchant_token=${resAuth.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 86400}`);
        return send(res, 201, { success: true, ...resAuth });
      }

      if (path === '/api/saas/auth/login' && m === 'POST') {
        const b = await readBody(req);
        const resAuth = await merchant.login(b);
        res.setHeader('Set-Cookie', `merchant_token=${resAuth.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 86400}`);
        return send(res, 200, { success: true, ...resAuth });
      }

      if (path === '/api/saas/auth/logout' && m === 'POST') {
        res.setHeader('Set-Cookie', 'merchant_token=; Path=/; HttpOnly; Max-Age=0');
        return send(res, 200, { success: true, message: 'Logged out' });
      }

      // Remaining SaaS endpoints require merchant session or key
      const merchantObj = await resolveMerchant(req, query);
      if (!merchantObj) return send(res, 401, { error: 'unauthenticated', message: 'Sesi merchant tidak valid' });

      if (path === '/api/saas/auth/me' && m === 'GET') {
        return send(res, 200, { success: true, merchant: merchant.sanitize(merchantObj) });
      }

      if (path === '/api/saas/merchant/overview' && m === 'GET') {
        const overview = await merchant.getOverview(merchantObj.id);
        return send(res, 200, { success: true, overview });
      }

      if (path === '/api/saas/merchant/transactions' && m === 'GET') {
        const txs = await payments.listByMerchant(merchantObj.id, Number(query.limit) || 100);
        return send(res, 200, { success: true, transactions: txs });
      }

      if (path === '/api/saas/merchant/keys/regenerate' && m === 'POST') {
        const b = await readBody(req);
        const updated = await merchant.regenerateKeys(merchantObj.id, b.type || 'all');
        return send(res, 200, { success: true, merchant: updated });
      }

      if (path === '/api/saas/merchant/webhook' && m === 'POST') {
        const b = await readBody(req);
        if (b.webhook_url && payments.isPrivateUrl(b.webhook_url)) {
          return send(res, 400, { error: 'SSRF: Webhook URL dilarang mengarah ke host lokal/privat' });
        }
        const updated = await merchant.updateWebhook(merchantObj.id, b);
        return send(res, 200, { success: true, data: updated });
      }

      if (path === '/api/saas/merchant/webhook/test' && m === 'POST') {
        const b = await readBody(req);
        const targetUrl = b.webhook_url || merchantObj.webhook_url;
        if (!targetUrl) return send(res, 400, { error: 'Webhook URL belum diatur' });
        if (payments.isPrivateUrl(targetUrl)) {
          return send(res, 400, { error: 'SSRF: Target URL dilarang mengarah ke host lokal/privat' });
        }
        const secret = b.webhook_secret || merchantObj.webhook_secret || '';
        const serverKey = merchantObj.server_key || '';
        const testOrderId = 'TEST-SAAS-' + randId(6);
        const testAmount = 25000;
        const midSig = midtransSignature(testOrderId, '200', testAmount + '.00', serverKey);

        const mockPayload = JSON.stringify({
          event: 'payment.paid',
          test: true,
          transaction_time: new Date().toISOString(),
          transaction_status: 'settlement',
          transaction_id: 'pay_test_' + randId(6),
          status_message: 'midtrans payment notification test',
          status_code: '200',
          signature_key: midSig,
          payment_type: 'qris',
          order_id: testOrderId,
          merchant_id: merchantObj.id,
          gross_amount: testAmount + '.00',
          currency: 'IDR',
          settlement_time: new Date().toISOString(),
        });

        try {
          const hookRes = await fetch(targetUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Signature': sign(mockPayload, secret),
              'X-Midtrans-Signature': midSig,
            },
            body: mockPayload,
            signal: AbortSignal.timeout(8000),
          });
          const hookText = await hookRes.text();
          return send(res, 200, {
            ok: hookRes.ok,
            status: hookRes.status,
            response: hookText.slice(0, 500),
          });
        } catch (err) {
          return send(res, 200, { ok: false, error: err.message });
        }
      }

      if (path === '/api/saas/merchant/payment-link' && m === 'POST') {
        const b = await readBody(req);
        const p = await payments.create({
          amount: Number(b.amount),
          order_id: b.order_id || 'LINK-' + Date.now().toString().slice(-4),
          description: b.description || 'Pembayaran Toko',
          customer: b.customer || null,
          merchant_id: merchantObj.id,
        });
        return send(res, 201, { success: true, data: payments.publicView(p) });
      }

      if (path === '/api/saas/merchant/provider' && m === 'POST') {
        const b = await readBody(req);
        const updated = await merchant.updateProvider(merchantObj.id, b);
        return send(res, 200, { success: true, merchant: updated });
      }
    }

    // 8d. Modern REST API: /api/v1/payments (With multi-tenant merchant support)
    if (path.startsWith('/api/v1/')) {
      const merchantObj = await resolveMerchant(req, query);
      if (!merchantObj && !needKey(req, query) && !needAdmin(req)) {
        return send(res, 401, { error: 'invalid_api_key' });
      }
      const mid = merchantObj ? merchantObj.id : 'mid_default';

      if (path === '/api/v1/payments' && m === 'POST') {
        const b = await readBody(req);
        const p = await payments.create({ ...b, merchant_id: mid });
        return send(res, 201, payments.publicView(p));
      }
      if (path === '/api/v1/payments' && m === 'GET') {
        const data = merchantObj && merchantObj.id !== 'mid_default'
          ? await payments.listByMerchant(mid, 50)
          : await payments.listRecent(50);
        return send(res, 200, { data });
      }
      if ((r = path.match(/^\/api\/v1\/payments\/([\w-]+)$/)) && m === 'GET') {
        const p = await payments.check(await payments.get(r[1]));
        return p ? send(res, 200, payments.publicView(p)) : send(res, 404, { error: 'not_found' });
      }
      if ((r = path.match(/^\/api\/v1\/payments\/([\w-]+)\/cancel$/)) && m === 'POST') {
        const p = await payments.cancel(r[1]);
        return send(res, 200, p);
      }
    }

    // 9. Backward-Compatible Routes (ahmadzakiyox/gopay-api-gateaway & shoppepay-api-gateway)
    if (path === '/create-qris' && (m === 'GET' || m === 'POST')) {
      if (!needKey(req, query) && !needAdmin(req)) {
        return send(res, 401, { success: false, error: 'Unauthorized: Invalid API Key' });
      }
      const b = m === 'POST' ? await readBody(req) : query;
      const amt = Number(b.amount);
      if (!amt || amt <= 0) return send(res, 400, { success: false, error: 'Provide valid amount (positive integer)' });

      const p = await payments.create({
        amount: amt,
        order_id: b.order_id || b.trx_id || null,
        description: b.description || 'Tagihan QRIS',
      });

      return send(res, 200, {
        success: true,
        data: {
          qris_id: p.id,
          trx_id: p.id,
          qris_url: p.payment_link || `/pay/${p.id}`,
          qris_code: p.qris_string,
          amount: p.amount,
          unique_code: p.unique_code,
          total: p.total,
          expires_at: new Date(p.expires_at).toISOString(),
          expires_in: '15 menit',
        },
      });
    }

    if (path === '/check-payment' && m === 'GET') {
      if (!needKey(req, query) && !needAdmin(req)) {
        return send(res, 401, { success: false, error: 'Unauthorized: Invalid API Key' });
      }
      const result = await payments.checkByAmount({
        amount: query.amount,
        trx_id: query.trx_id,
        startTime: query.startTime,
      });
      return send(res, 200, result);
    }

    if ((path === '/transactions' || path === '/transactions/all') && m === 'GET') {
      if (!needKey(req, query) && !needAdmin(req)) {
        return send(res, 401, { success: false, error: 'Unauthorized' });
      }
      const startTime = query.startTime ? new Date(Number(query.startTime) * 1000) : new Date(Date.now() - 3 * 24 * 3600 * 1000);
      const endTime = query.endTime ? new Date(Number(query.endTime) * 1000) : new Date();
      const txs = await provider.listTransactions(startTime, endTime);
      return send(res, 200, {
        success: true,
        total_transactions: txs.length,
        data: { transactions: txs },
      });
    }

    if (path === '/token-status' && m === 'GET') {
      if (!needKey(req, query) && !needAdmin(req)) {
        return send(res, 401, { success: false, error: 'Unauthorized' });
      }
      const st = await provider.status();
      return send(res, 200, {
        success: true,
        data: {
          token_status: 'valid',
          active_provider: st.activeProvider,
          details: st.providers,
        },
      });
    }

    if (path === '/update-token' && m === 'POST') {
      if (!needKey(req, query) && !needAdmin(req)) {
        return send(res, 401, { success: false, error: 'Unauthorized' });
      }
      const b = await readBody(req);
      const resShopee = await shopee.updateToken({
        token: b.token,
        staticQris: b.staticQris,
        merchantName: b.merchantName,
      });
      return send(res, 200, { success: true, data: resShopee });
    }

    if (path === '/api/logs' && m === 'GET') {
      if (!needKey(req, query) && !needAdmin(req)) {
        return send(res, 401, { success: false, error: 'Unauthorized' });
      }
      return send(res, 200, {
        success: true,
        logs: logger.getLogs(Number(query.limit) || 50),
      });
    }

    // 10. Admin APIs (Protected by ADMIN_PASSWORD or gp_sess cookie)
    if (path.startsWith('/api/admin/')) {
      if (!needAdmin(req)) return send(res, 401, { error: 'Password admin salah' });

      if (path === '/api/admin/status' && m === 'GET') {
        const provStat = await provider.status();
        return send(res, 200, {
          provider: provStat.activeProvider,
          gopay: provStat.providers.gopay,
          shopee: provStat.providers.shopee,
          manual: provStat.providers.manual,
          payments: await payments.listRecent(50),
        });
      }

      if (path === '/api/admin/provider' && m === 'POST') {
        const b = await readBody(req);
        const name = await provider.setActiveProvider(b.provider);
        return send(res, 200, { ok: true, activeProvider: name });
      }

      if (path === '/api/admin/manual-qris' && m === 'POST') {
        const b = await readBody(req);
        const result = await provider.setManualQRIS(b.qris, b.name);
        return send(res, 200, result);
      }

      if (path === '/api/admin/quick-create' && m === 'POST') {
        const b = await readBody(req);
        const p = await payments.create({
          amount: Number(b.amount),
          order_id: b.order_id || null,
          description: b.description || 'Tagihan Admin',
        });
        return send(res, 201, payments.publicView(p));
      }

      if (path === '/api/admin/reconcile' && m === 'POST') {
        return send(res, 200, await payments.reconcileAll());
      }

      if (path === '/api/admin/otp/request' && m === 'POST') {
        await gopay.requestOtp((await readBody(req)).phone);
        return send(res, 200, { ok: true });
      }

      if (path === '/api/admin/otp/verify' && m === 'POST') {
        return send(res, 200, await gopay.verifyOtp((await readBody(req)).otp));
      }

      if (path === '/api/admin/settings/webhook' && m === 'POST') {
        const b = await readBody(req);
        if (b.webhook_url !== undefined) {
          if (b.webhook_url && payments.isPrivateUrl(b.webhook_url)) {
            return send(res, 400, { error: 'webhook_url dilarang mengarah ke host lokal/privat (SSRF Protection)' });
          }
          await store.set('merchant:webhook_url', b.webhook_url);
        }
        if (b.webhook_secret !== undefined) await store.set('merchant:webhook_secret', b.webhook_secret);
        return send(res, 200, { ok: true, message: 'Pengaturan webhook disimpan' });
      }

      if (path === '/api/admin/settings/webhook' && m === 'GET') {
        return send(res, 200, {
          webhook_url: (await store.get('merchant:webhook_url')) || process.env.WEBHOOK_URL || '',
          webhook_secret: (await store.get('merchant:webhook_secret')) || process.env.WEBHOOK_SECRET || '',
        });
      }

      if (path === '/api/admin/webhook/test' && m === 'POST') {
        const b = await readBody(req);
        const targetUrl = b.webhook_url || (await store.get('merchant:webhook_url')) || process.env.WEBHOOK_URL;
        if (!targetUrl) return send(res, 400, { error: 'URL Webhook belum diatur' });
        if (payments.isPrivateUrl(targetUrl)) {
          return send(res, 400, { error: 'targetUrl dilarang mengarah ke host lokal/privat (SSRF Protection)' });
        }
        const secret = b.webhook_secret || (await store.get('merchant:webhook_secret')) || process.env.WEBHOOK_SECRET || '';
        const mockPayload = JSON.stringify({
          event: 'payment.paid',
          test: true,
          timestamp: new Date().toISOString(),
          data: {
            id: 'pay_test_' + randId(6),
            order_id: 'TEST-ORDER-123',
            amount: 50000,
            unique_code: 123,
            total: 50123,
            status: 'paid',
            provider: 'simulator',
            created_at: Date.now(),
            paid_at: Date.now(),
          },
        });
        const { sign } = require('../lib/crypto');
        const signature = sign(mockPayload, secret);
        try {
          const hookRes = await fetch(targetUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Signature': signature,
            },
            body: mockPayload,
            signal: AbortSignal.timeout(10000),
          });
          const hookText = await hookRes.text();
          return send(res, 200, {
            ok: hookRes.ok,
            status: hookRes.status,
            response: hookText.slice(0, 500),
          });
        } catch (err) {
          return send(res, 200, {
            ok: false,
            error: err.message,
          });
        }
      }
    }

    // 11. Cron Reconcile Route (Vercel Cron & External Webhook Ping)
    if ((path === '/api/cron/reconcile' || path === '/api/cron') && (m === 'GET' || m === 'POST')) {
      const authHeader = req.headers['authorization'];
      if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}` && !needAdmin(req) && !needKey(req, query)) {
        return send(res, 401, { error: 'Unauthorized: Invalid Cron Secret' });
      }
      const result = await payments.reconcileAll();
      return send(res, 200, { ok: true, ...result, timestamp: new Date().toISOString() });
    }

    return send(res, 404, { error: 'not_found' });
  } catch (e) {
    logger.logEvent('ERROR', e.message);
    const code = e.status && e.status < 600 ? (e.status >= 400 ? e.status : 502) : 500;
    return send(res, code, { error: e.message, detail: e.detail });
  }
};
