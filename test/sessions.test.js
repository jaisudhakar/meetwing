const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SessionStore, toMarkdown } = require('../src/main/sessions');
const { extensionFor } = require('../src/main/transcribe');

test('save / list / read / delete round-trip, newest first', () => {
  const store = new SessionStore(fs.mkdtempSync(path.join(os.tmpdir(), 'mw-sessions-')));
  store.save({ id: 'a', title: 'Old', startedAt: 1, entries: [{ speaker: 'me', text: 'x', ts: 1 }] });
  store.save({ id: 'b', title: 'New', startedAt: 2, entries: [], summary: 's' });
  assert.deepStrictEqual(store.list().map((s) => s.id), ['b', 'a']);
  assert.strictEqual(store.list()[0].hasSummary, true);
  assert.strictEqual(store.read('a').title, 'Old');
  assert.strictEqual(store.delete('a'), true);
  assert.strictEqual(store.read('a'), null);
});

test('rejects path traversal ids without touching files outside the store', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mw-trav-'));
  const dir = path.join(root, 'sessions');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(root, 'secret.json'), JSON.stringify({ id: 'secret' }));
  const store = new SessionStore(dir);
  assert.strictEqual(store.read('../secret'), null);
  assert.strictEqual(store.delete('../secret'), false);
  assert.throws(() => store.save({ id: '../evil' }), /Invalid/);
  assert.ok(fs.existsSync(path.join(root, 'secret.json')));
  assert.ok(!fs.existsSync(path.join(root, 'evil.json')));
});

test('markdown export includes summary, transcript and answers', () => {
  const md = toMarkdown({
    title: 'Standup',
    startedAt: Date.now(),
    summary: '## Summary\nAll good',
    entries: [{ speaker: 'them', text: 'Status?', ts: Date.now() }],
    answers: [{ question: 'Q1', answer: 'A1' }],
  });
  assert.ok(md.startsWith('# Standup'));
  assert.ok(md.includes('**Them**') && md.includes('Status?'));
  assert.ok(md.includes('**Q:** Q1'));
});

test('audio extension mapping', () => {
  assert.strictEqual(extensionFor('audio/webm;codecs=opus'), 'webm');
  assert.strictEqual(extensionFor('audio/mp4'), 'm4a');
  assert.strictEqual(extensionFor('weird/type'), 'webm');
});
