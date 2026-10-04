const test = require('node:test');
const assert = require('node:assert');
const store = require('../lib/store');
const { encrypt, decrypt } = require('../lib/crypto');
const gopay = require('../lib/gopay');

process.env.NODE_ENV = 'test';
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

test('Auto-update GoPay token: proactive refresh when near expiry & reactive on 401', async (t) => {
  const origFetch = global.fetch;
  t.after(() => { global.fetch = origFetch; });

  let refreshed = 0;
  global.fetch = async (url, opt) => {
    const u = String(url);
    if (u.includes('/goid/token')) {
      refreshed++;
      return new Response(JSON.stringify({
        access_token: 'new_access_token_' + refreshed,
        refresh_token: 'new_refresh_token_' + refreshed,
        expires_in: 3600,
      }), { status: 200 });
    }
    if (u.includes('/merchant-analytics')) {
      // jika pakai token lama, tolak 401
      if (opt.headers.Authorization.includes('old_access_token')) {
        return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 });
      }
      return new Response(JSON.stringify({ transactions: [] }), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  };

  // 1. Simpan session dengan token yang kedaluwarsa dalam 2 menit (< 5 menit threshold)
  const expiringSoon = Date.now() + 120 * 1000;
  await store.set('gopay:session', encrypt(JSON.stringify({
    access: 'old_access_token',
    refresh: 'valid_refresh_token',
    expiresAt: expiringSoon,
    merchantId: 'M_TEST',
    merchantName: 'Toko Test',
  })));

  // Verifikasi data di storage terenkripsi (bukan plaintext)
  const rawStore = await store.get('gopay:session');
  assert.ok(!rawStore.includes('old_access_token'), 'Session harus terenkripsi di storage');

  // Panggil getSession: harus otomatis refresh karena waktu tersisa < 5 menit
  const session = await gopay.getSession();
  assert.strictEqual(refreshed, 1, 'Token harus otomatis diperbarui ke GoID');
  assert.strictEqual(session.access, 'new_access_token_1');
  assert.strictEqual(session.refresh, 'new_refresh_token_1');

  // 2. Uji reactive refresh saat fetch transaksi menghadapi 401
  // Sengaja set access token lama tapi expiresAt masih lama
  await store.set('gopay:session', encrypt(JSON.stringify({
    access: 'old_access_token',
    refresh: 'valid_refresh_token',
    expiresAt: Date.now() + 3600 * 1000,
    merchantId: 'M_TEST',
  })));

  const txs = await gopay.listTransactions(new Date(Date.now() - 3600000), new Date());
  assert.ok(Array.isArray(txs));
  assert.strictEqual(refreshed, 2, 'Harus otomatis refresh saat terima 401 dari Gojek API');

  const updatedSession = await gopay.getSession();
  assert.strictEqual(updatedSession.access, 'new_access_token_2');
});
