const crypto = require('crypto');

let fallbackKey = null;

function key() {
  const k = process.env.ENCRYPTION_KEY || '';
  if (/^[0-9a-fA-F]{64}$/.test(k)) {
    return Buffer.from(k, 'hex');
  }
  // Fallback aman untuk dev/preview bila ENCRYPTION_KEY belum diset
  if (!fallbackKey) {
    if (process.env.ADMIN_PASSWORD) {
      fallbackKey = crypto.createHash('sha256').update(process.env.ADMIN_PASSWORD).digest();
    } else {
      fallbackKey = crypto.randomBytes(32);
    }
  }
  return fallbackKey;
}

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]).toString('base64');
}

function decrypt(b64) {
  const buf = Buffer.from(b64, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
}

function safeEqual(a, b) {
  if (!a || !b || typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const sign = (body, secret) => crypto.createHmac('sha256', secret).update(body).digest('hex');
const randId = (n = 12) => crypto.randomBytes(n).toString('base64url');

function hashPassword(pwd) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pwd, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(pwd, stored) {
  if (!pwd || !stored || typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, key] = stored.split(':');
  const hash = crypto.scryptSync(pwd, salt, 64).toString('hex');
  return safeEqual(hash, key);
}

function midtransSignature(orderId, statusCode, grossAmount, serverKey) {
  const str = `${orderId}${statusCode}${grossAmount}${serverKey}`;
  return crypto.createHash('sha512').update(str).digest('hex');
}

module.exports = {
  encrypt,
  decrypt,
  safeEqual,
  sign,
  randId,
  hashPassword,
  verifyPassword,
  midtransSignature,
};
