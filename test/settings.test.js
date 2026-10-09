const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SettingsStore } = require('../src/main/settings');

const fakeCrypto = {
  available: () => true,
  encrypt: (s) => Buffer.from(s).toString('base64').split('').reverse().join(''),
  decrypt: (s) => Buffer.from(s.split('').reverse().join(''), 'base64').toString(),
};
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mw-settings-'));

test('secrets are encrypted on disk and never in public settings', () => {
  const dir = tmp();
  const s = new SettingsStore(dir, fakeCrypto);
  const pub = s.update({ aiApiKey: 'sk-secret' });
  assert.strictEqual(pub.hasAiKey, true);
  assert.ok(!JSON.stringify(pub).includes('sk-secret'));
  assert.ok(!fs.readFileSync(path.join(dir, 'settings.json'), 'utf8').includes('sk-secret'));
  assert.strictEqual(new SettingsStore(dir, fakeCrypto).getAi().apiKey, 'sk-secret');
});

test('empty key leaves existing key; null clears it', () => {
  const s = new SettingsStore(tmp(), fakeCrypto);
  s.update({ aiApiKey: 'abc' });
  s.update({ aiApiKey: '' });
  assert.strictEqual(s.getAi().apiKey, 'abc');
  s.update({ aiApiKey: null });
  assert.strictEqual(s.getAi().apiKey, '');
});

test('provider presets fill blanks; STT reuses the OpenAI key', () => {
  const s = new SettingsStore(tmp(), fakeCrypto);
  s.update({ aiApiKey: 'k', ai: { provider: 'anthropic' } });
  assert.strictEqual(s.getAi().baseUrl, 'https://api.anthropic.com');
  assert.strictEqual(s.getStt().apiKey, ''); // anthropic key must not leak to the STT endpoint
  s.update({ ai: { provider: 'openai' } });
  assert.strictEqual(s.getStt().apiKey, 'k');
});

test('values are clamped and unknown keys ignored', () => {
  const s = new SettingsStore(tmp(), fakeCrypto);
  const pub = s.update({ audio: { chunkSeconds: 999 }, ui: { opacity: 0 }, bogus: 1 });
  assert.strictEqual(pub.audio.chunkSeconds, 30);
  assert.ok(pub.ui.opacity >= 0.3);
  assert.strictEqual(pub.bogus, undefined);
});

test('falls back to plaintext marker when encryption is unavailable', () => {
  const dir = tmp();
  const noCrypto = { available: () => false, encrypt: (s) => s, decrypt: (s) => s };
  new SettingsStore(dir, noCrypto).update({ aiApiKey: 'plain' });
  assert.strictEqual(new SettingsStore(dir, noCrypto).getAi().apiKey, 'plain');
});
