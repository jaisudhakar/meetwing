'use strict';
// Generates build/icon.png (1024x1024): a blue rounded square with a white jet.
// Pure Node, no dependencies. electron-builder derives .ico / .icns from this file.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const N = 1024;
const SS = 2; // supersampling per axis
const RADIUS = 0.22;
const TOP = [92, 178, 255];
const BOTTOM = [18, 108, 214];
const ANGLE = (-14 * Math.PI) / 180;

function segDist(x, y, a, b) {
  const abx = b[0] - a[0], aby = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * abx + (y - a[1]) * aby) / (abx * abx + aby * aby)));
  return Math.hypot(x - (a[0] + t * abx), y - (a[1] + t * aby));
}
function inPoly(x, y, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// Jet in its own space (nose to the right), later rotated.
const FIN = [[-0.27, -0.02], [-0.36, -0.21], [-0.22, -0.21], [-0.12, -0.02]];
const WING = [[-0.03, 0.03], [0.1, 0.03], [-0.07, 0.25], [-0.2, 0.25]];
const STAB = [[-0.3, 0.0], [-0.4, 0.07], [-0.3, 0.07]];
function inJet(u, v) {
  const x = (u - 0.5) * Math.cos(-ANGLE) - (v - 0.5) * Math.sin(-ANGLE) - 0.03;
  const y = (u - 0.5) * Math.sin(-ANGLE) + (v - 0.5) * Math.cos(-ANGLE) + 0.07;
  if (segDist(x, y, [-0.3, 0], [0.31, 0.005]) < 0.075 - Math.max(0, x - 0.2) * 0.2) return true;
  return inPoly(x, y, FIN) || inPoly(x, y, WING) || inPoly(x, y, STAB);
}

const px = Buffer.alloc(N * N * 4);
for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    let a = 0, jet = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const u = (x + (sx + 0.5) / SS) / N, v = (y + (sy + 0.5) / SS) / N;
        const qx = Math.abs(u - 0.5) - (0.5 - RADIUS), qy = Math.abs(v - 0.5) - (0.5 - RADIUS);
        const sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - RADIUS;
        if (sd <= 0) {
          a++;
          if (inJet(u, v)) jet++;
        }
      }
    }
    const total = SS * SS;
    const t = (y + 0.5) / N;
    const bg = TOP.map((c, i) => c + (BOTTOM[i] - c) * t);
    const j = a ? jet / a : 0;
    const o = (y * N + x) * 4;
    px[o] = bg[0] + (255 - bg[0]) * j;
    px[o + 1] = bg[1] + (255 - bg[1]) * j;
    px[o + 2] = bg[2] + (255 - bg[2]) * j;
    px[o + 3] = Math.round((a / total) * 255);
  }
}

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    let c = (crc ^ buf[i]) & 0xff;
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
for (let y = 0; y < N; y++) px.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6;
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
