const test = require('node:test');
const assert = require('node:assert');
const { THEMES, get } = require('../src/shared/themes');
const { svg, SCENES } = require('../src/shared/jet');

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrastOnWhite = (hex) => 1.05 / (lum(hex) + 0.05);

test('20 named flight colors with unique keys', () => {
  assert.strictEqual(THEMES.length, 20);
  assert.strictEqual(new Set(THEMES.map((t) => t.key)).size, 20);
  for (const t of THEMES) for (const k of ['hi', 'lo', 'stripe', 'light', 'ink']) assert.match(t[k], /^#[0-9a-f]{6}$/, `${t.key}.${k}`);
});

test('every card label color is readable on the white card (WCAG AA)', () => {
  for (const t of THEMES) assert.ok(contrastOnWhite(t.ink) >= 4.5, `${t.name} ink ${t.ink} = ${contrastOnWhite(t.ink).toFixed(2)}`);
});

test('unknown color falls back to Sky', () => {
  assert.strictEqual(get('nope').key, 'sky');
});

test('jet markup uses per-instance ids so many jets can share a page', () => {
  const a = svg('a1');
  const b = svg('b2');
  assert.ok(a.includes('id="a1-tone"') && a.includes('url(#a1-tone)'));
  assert.ok(!b.includes('a1-'));
  assert.strictEqual(SCENES.length, 6);
});
