const test = require('node:test');
const assert = require('node:assert');
const P = require('../src/shared/prompts');

test('system prompt includes mode and custom instructions', () => {
  const s = P.buildSystemPrompt('interview', 'I am a Go developer');
  assert.ok(/interview/i.test(s));
  assert.ok(s.includes('I am a Go developer'));
});

test('unknown mode falls back to assist', () => {
  assert.strictEqual(P.buildSystemPrompt('nope'), P.buildSystemPrompt('assist'));
});

test('user message handles empty transcript, screenshot and default question', () => {
  const m = P.buildUserMessage({ transcript: '', question: '', hasScreenshot: true });
  assert.ok(m.includes('No transcript'));
  assert.ok(m.includes('screenshot'));
  assert.ok(m.includes(P.QUICK_ACTIONS.answer));
});
