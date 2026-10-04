// Storage Layer:
// 1. Upstash Redis (bila UPSTASH_REDIS_REST_URL dan UPSTASH_REDIS_REST_TOKEN diset - cocok untuk Vercel multi-region)
// 2. Native SQLite (node:sqlite bawaan Node 22+ tanpa dependency tambahan - cocok untuk VPS/Dedicated/cPanel)
// 3. In-memory Map fallback (bila filesystem read-only atau serverless tanpa Redis)

const fs = require('fs');
const path = require('path');

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const useRedis = () => !!(upstashUrl && upstashToken);

async function redisCmd(args) {
  const r = await fetch(upstashUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${upstashToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const j = await r.json();
  if (j.error) throw new Error('Redis: ' + j.error);
  return j.result;
}

// In-Memory Fallback
const mem = new Map();
const memExp = new Map();

function memGet(k) {
  if (memExp.has(k) && memExp.get(k) < Date.now()) {
    mem.delete(k);
    memExp.delete(k);
  }
  return mem.get(k);
}

// SQLite native engine
let sqliteDb = null;
let useSqlite = false;

if (!useRedis() && process.env.STORE_DRIVER !== 'memory' && process.env.NODE_ENV !== 'test') {
  try {
    const { DatabaseSync } = require('node:sqlite');
    const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
      } catch {}
    }
    const dbPath = path.join(dataDir, 'qrispay.sqlite');
    sqliteDb = new DatabaseSync(dbPath);
    sqliteDb.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT, exp INTEGER);
      CREATE TABLE IF NOT EXISTS sets (k TEXT, m TEXT, PRIMARY KEY(k, m));
      CREATE TABLE IF NOT EXISTS lists (id INTEGER PRIMARY KEY AUTOINCREMENT, k TEXT, v TEXT);
      CREATE INDEX IF NOT EXISTS idx_lists_k ON lists(k, id DESC);
    `);
    useSqlite = true;
  } catch (err) {
    // Filesystem read-only atau lingkungan tanpa akses disk (misal Vercel tanpa Redis)
    useSqlite = false;
    sqliteDb = null;
  }
}

async function get(k) {
  if (useRedis()) {
    const v = await redisCmd(['GET', k]);
    return v ? JSON.parse(v) : null;
  }
  if (useSqlite) {
    try {
      const now = Date.now();
      const row = sqliteDb.prepare('SELECT v, exp FROM kv WHERE k = ?').get(k);
      if (!row) return null;
      if (row.exp && row.exp < now) {
        sqliteDb.prepare('DELETE FROM kv WHERE k = ?').run(k);
        return null;
      }
      return JSON.parse(row.v);
    } catch {
      // fallback in-memory bila terjadi galat sqlite
    }
  }
  const v = memGet(k);
  return v === undefined ? null : JSON.parse(v);
}

async function set(k, v, exSec) {
  const s = JSON.stringify(v);
  if (useRedis()) {
    return redisCmd(exSec ? ['SET', k, s, 'EX', String(exSec)] : ['SET', k, s]);
  }
  if (useSqlite) {
    try {
      const exp = exSec ? Date.now() + exSec * 1000 : null;
      sqliteDb.prepare('INSERT OR REPLACE INTO kv (k, v, exp) VALUES (?, ?, ?)').run(k, s, exp);
      return;
    } catch {}
  }
  mem.set(k, s);
  if (exSec) memExp.set(k, Date.now() + exSec * 1000);
}

async function setNX(k, v, exSec) {
  const s = JSON.stringify(v);
  if (useRedis()) {
    return (await redisCmd(exSec ? ['SET', k, s, 'NX', 'EX', String(exSec)] : ['SET', k, s, 'NX'])) === 'OK';
  }
  if (useSqlite) {
    try {
      const now = Date.now();
      const row = sqliteDb.prepare('SELECT exp FROM kv WHERE k = ?').get(k);
      if (row && (!row.exp || row.exp >= now)) {
        return false;
      }
      const exp = exSec ? now + exSec * 1000 : null;
      sqliteDb.prepare('INSERT OR REPLACE INTO kv (k, v, exp) VALUES (?, ?, ?)').run(k, s, exp);
      return true;
    } catch {}
  }
  if (memGet(k) !== undefined) return false;
  mem.set(k, s);
  if (exSec) memExp.set(k, Date.now() + exSec * 1000);
  return true;
}

async function del(k) {
  if (useRedis()) return redisCmd(['DEL', k]);
  if (useSqlite) {
    try {
      sqliteDb.prepare('DELETE FROM kv WHERE k = ?').run(k);
      sqliteDb.prepare('DELETE FROM sets WHERE k = ?').run(k);
      sqliteDb.prepare('DELETE FROM lists WHERE k = ?').run(k);
    } catch {}
  }
  mem.delete(k);
  memExp.delete(k);
}

async function sadd(k, m) {
  if (useRedis()) return redisCmd(['SADD', k, m]);
  if (useSqlite) {
    try {
      sqliteDb.prepare('INSERT OR IGNORE INTO sets (k, m) VALUES (?, ?)').run(k, String(m));
      return;
    } catch {}
  }
  const s = new Set(JSON.parse(mem.get(k) || '[]'));
  s.add(m);
  mem.set(k, JSON.stringify([...s]));
}

async function srem(k, m) {
  if (useRedis()) return redisCmd(['SREM', k, m]);
  if (useSqlite) {
    try {
      sqliteDb.prepare('DELETE FROM sets WHERE k = ? AND m = ?').run(k, String(m));
      return;
    } catch {}
  }
  const s = new Set(JSON.parse(mem.get(k) || '[]'));
  s.delete(m);
  mem.set(k, JSON.stringify([...s]));
}

async function smembers(k) {
  if (useRedis()) return redisCmd(['SMEMBERS', k]);
  if (useSqlite) {
    try {
      const rows = sqliteDb.prepare('SELECT m FROM sets WHERE k = ?').all(k);
      return rows.map((r) => r.m);
    } catch {}
  }
  return JSON.parse(mem.get(k) || '[]');
}

async function lpush(k, v, max = 500) {
  if (useRedis()) {
    await redisCmd(['LPUSH', k, v]);
    return redisCmd(['LTRIM', k, '0', String(max - 1)]);
  }
  if (useSqlite) {
    try {
      sqliteDb.prepare('INSERT INTO lists (k, v) VALUES (?, ?)').run(k, String(v));
      sqliteDb.prepare(`
        DELETE FROM lists WHERE k = ? AND id NOT IN (
          SELECT id FROM lists WHERE k = ? ORDER BY id DESC LIMIT ?
        )
      `).run(k, k, max);
      return;
    } catch {}
  }
  const a = JSON.parse(mem.get(k) || '[]');
  a.unshift(v);
  mem.set(k, JSON.stringify(a.slice(0, max)));
}

async function lrange(k, n) {
  if (useRedis()) return redisCmd(['LRANGE', k, '0', String(n - 1)]);
  if (useSqlite) {
    try {
      const rows = sqliteDb.prepare('SELECT v FROM lists WHERE k = ? ORDER BY id DESC LIMIT ?').all(k, n);
      return rows.map((r) => r.v);
    } catch {}
  }
  return JSON.parse(mem.get(k) || '[]').slice(0, n);
}

module.exports = {
  get,
  set,
  setNX,
  del,
  sadd,
  srem,
  smembers,
  lpush,
  lrange,
  useRedis,
  isSqlite: () => useSqlite,
};
