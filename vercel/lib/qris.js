// Parser EMVCo QRIS + konversi statis -> dinamis
function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
function parse(str) {
  const out = [];
  let i = 0;
  while (i < str.length) {
    const tag = str.slice(i, i + 2);
    const len = parseInt(str.slice(i + 2, i + 4), 10);
    if (!/^\d{2}$/.test(tag) || Number.isNaN(len)) throw new Error('QRIS tidak valid');
    const value = str.slice(i + 4, i + 4 + len);
    if (value.length !== len) throw new Error('QRIS terpotong');
    out.push({ tag, value });
    i += 4 + len;
  }
  return out;
}
const enc = (tag, value) => tag + String(value.length).padStart(2, '0') + value;
function validate(str) {
  const items = parse(str);
  const crc = items.find((x) => x.tag === '63');
  if (!crc) throw new Error('CRC tidak ada');
  if (crc16(str.slice(0, -4)) !== crc.value.toUpperCase()) throw new Error('CRC tidak cocok');
  return true;
}
// Ubah QRIS statis menjadi dinamis dengan nominal tertentu (rupiah, bilangan bulat)
function toDynamic(staticQr, amount) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Nominal harus bilangan bulat > 0');
  const items = parse(staticQr.trim()).filter((x) => x.tag !== '63' && x.tag !== '54');
  const out = [];
  let inserted = false;
  for (const it of items) {
    if (it.tag === '01') it.value = '12'; // 12 = dinamis
    // tag 54 harus sebelum tag 58 (country code)
    if (!inserted && Number(it.tag) > 54) {
      out.push({ tag: '54', value: String(amount) });
      inserted = true;
    }
    out.push(it);
  }
  if (!inserted) out.push({ tag: '54', value: String(amount) });
  const body = out.map((x) => enc(x.tag, x.value)).join('') + '6304';
  return body + crc16(body);
}
module.exports = { crc16, parse, validate, toDynamic };
