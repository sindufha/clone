import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
const crc = (data) => {
  let value = 0xffffffff;
  for (const byte of data) { value ^= byte; for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); }
  return (value ^ 0xffffffff) >>> 0;
};
function chunk(type, body) {
  const data = Buffer.concat([Buffer.from(type), body]); const size = Buffer.alloc(4); size.writeUInt32BE(body.length);
  const check = Buffer.alloc(4); check.writeUInt32BE(crc(data)); return Buffer.concat([size, data, check]);
}
mkdirSync('public/icons', { recursive: true });
for (const [name, size] of [['icon-192', 192], ['icon-512', 512], ['maskable-512', 512]]) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = x / size; const ny = y / size;
    const white = ny >= .28 && ny <= .72 && ((nx >= .28 && nx <= .36) || (nx >= .64 && nx <= .72) || (nx >= .34 && nx <= .67 && Math.abs(ny - (.28 + (nx - .34) * 1.3)) < .06));
    const at = y * (size * 3 + 1) + 1 + x * 3;
    raw[at] = white ? 255 : 8; raw[at + 1] = white ? 255 : 124; raw[at + 2] = white ? 255 : 84;
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2;
  writeFileSync(`public/icons/${name}.png`, Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
console.log('Ikon PWA dibuat.');
