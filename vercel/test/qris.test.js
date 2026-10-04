const test = require('node:test');
const assert = require('node:assert');
const q = require('../lib/qris');
const mk = (body) => body + '6304' + q.crc16(body + '6304');
const merchant = '0013ID.CO.EXAMPLE.WWW0118936000000000000000';
const STATIC = mk('000201010211' + '26' + String(merchant.length).padStart(2, '0') + merchant + '5204581253033605802ID5909TOKO TEST6007JAKARTA');
test('static valid', () => assert.ok(q.validate(STATIC)));
test('dynamic', () => {
  const d = q.toDynamic(STATIC, 10123);
  assert.ok(q.validate(d));
  const items = q.parse(d);
  assert.equal(items.find((x) => x.tag === '01').value, '12');
  assert.equal(items.find((x) => x.tag === '54').value, '10123');
  const tags = items.map((x) => x.tag);
  assert.ok(tags.indexOf('54') < tags.indexOf('58'));
});
test('crc known vector', () => assert.equal(q.crc16('123456789'), '29B1'));
test('reject bad amount', () => assert.throws(() => q.toDynamic(STATIC, 0)));
