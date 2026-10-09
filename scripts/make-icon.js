'use strict';
// Generates build/icon.png (1024x1024): a gradient rounded square with a "W" wing mark.
// Pure Node, no dependencies. electron-builder derives .ico / .icns from this file.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const N = 1024;
const px = Buffer.alloc(N * N * 4);

const C1 = [124, 156, 255];
const C2 = [180, 140, 255];
const W = [[0.2, 0.32], [0.35, 0.7], [0.5, 0.42], [0.65, 0.7], [0.8, 0.32]];
const STROKE = 0.07;
const RADIUS = 0.22;

function segDist(px_, py_, a, b) {
  const abx = b[0] - a[0], aby = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px_ - a[0]) * abx + (py_ - a[1]) * aby) / (abx * abx + aby * aby)));
  return Math.hypot(px_ - (a[0] + t * abx), py_ - (a[1] + t * aby));
}

const aa = 1.5 / N; // one-and-a-half pixel feather
for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    const u = (x + 0.5) / N, v = (y + 0.5) / N;
    // rounded-rect signed distance
    const qx = Math.abs(u - 0.5) - (0.5 - RADIUS), qy = Math.abs(v - 0.5) - (0.5 - RADIUS);
    const sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - RADIUS;
    const alpha = Math.max(0, Math.min(1, 0.5 - sd / aa));
    const t = (u + v) / 2;
    let rgb = C1.map((c, i) => c + (C2[i] - c) * t);

    let d = Infinity;
    for (let i = 0; i < W.length - 1; i++) d = Math.min(d, segDist(u, v, W[i], W[i + 1]));
    const mark = Math.max(0, Math.min(1, 0.5 - (d - STROKE / 2) / aa));
    rgb = rgb.map((c) => c + (255 - c) * mark);

    const o = (y * N + x) * 4;
    px[o] = rgb[0]; px[o + 1] = rgb[1]; px[o + 2] = rgb[2]; px[o + 3] = Math.round(alpha * 255);
  }
}

function crc32(buf) {
  let c, crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

const raw = Buffer.alloc((N * 4 + 1) * N);
for (let y = 0; y < N; y++) {
  raw[y * (N * 4 + 1)] = 0;
  px.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4);
ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
const out = path.join(__dirname, '..', 'build', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
