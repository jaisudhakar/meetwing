const test = require('node:test');
const assert = require('node:assert');
const { Transcript, isHallucination } = require('../src/shared/transcript');

test('filters silence hallucinations', () => {
  assert.ok(isHallucination('Thank you.'));
  assert.ok(isHallucination(' You '));
  assert.ok(isHallucination('...'));
  assert.ok(!isHallucination('Thank you for the update on the roadmap'));
});

test('merges consecutive same-speaker utterances inside the window', () => {
  const t = new Transcript({ mergeWindowMs: 5000 });
  t.add('them', 'What is your experience', 1000);
  t.add('them', 'with Kubernetes?', 3000);
  t.add('me', 'Quite a lot.', 4000);
  t.add('them', 'Great.', 20000);
  assert.strictEqual(t.entries.length, 3);
  assert.strictEqual(t.entries[0].text, 'What is your experience with Kubernetes?');
  assert.strictEqual(t.toText(), 'Them: What is your experience with Kubernetes?\nYou: Quite a lot.\nThem: Great.');
});

test('recent() keeps newest whole lines within the budget', () => {
  const t = new Transcript({ mergeWindowMs: 0 });
  for (let i = 0; i < 10; i++) t.add(i % 2 ? 'me' : 'them', `line number ${i} with some padding text`, i * 100000);
  const out = t.recent(120);
  const lines = out.split('\n');
  assert.ok(out.length <= 120);
  assert.ok(lines[lines.length - 1].includes('line number 9'));
  assert.ok(!out.includes('line number 0'));
});
