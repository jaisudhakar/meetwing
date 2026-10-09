const test = require('node:test');
const assert = require('node:assert');
const { buildRequest, extractDelta, streamChat } = require('../src/main/ai');

const openai = { provider: 'openai', baseUrl: 'https://api.openai.com/v1/', model: 'gpt-4o-mini', apiKey: 'k' };
const anthropic = { provider: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-5-5', apiKey: 'k' };
const input = { system: 'sys', messages: [{ role: 'user', content: 'hi' }] };

test('openai request shape, with image attached to last message', () => {
  const r = buildRequest(openai, { ...input, images: [{ mime: 'image/jpeg', base64: 'AAA' }] });
  assert.strictEqual(r.url, 'https://api.openai.com/v1/chat/completions');
  assert.strictEqual(r.headers.authorization, 'Bearer k');
  assert.strictEqual(r.body.messages[0].role, 'system');
  assert.strictEqual(r.body.messages[1].content[1].image_url.url, 'data:image/jpeg;base64,AAA');
  assert.strictEqual(r.body.stream, true);
});

test('ollama sends no auth header', () => {
  const r = buildRequest({ provider: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'm', apiKey: '' }, input);
  assert.strictEqual(r.headers.authorization, undefined);
});

test('anthropic request shape', () => {
  const r = buildRequest(anthropic, { ...input, images: [{ mime: 'image/jpeg', base64: 'AAA' }] });
  assert.strictEqual(r.url, 'https://api.anthropic.com/v1/messages');
  assert.strictEqual(r.headers['x-api-key'], 'k');
  assert.strictEqual(r.headers['anthropic-version'], '2023-06-01');
  assert.strictEqual(r.body.system, 'sys');
  assert.strictEqual(r.body.messages[0].content[0].type, 'image');
  assert.strictEqual(r.body.messages[0].content[1].text, 'hi');
});

test('missing model / url throws', () => {
  assert.throws(() => buildRequest({ ...openai, model: '' }, input), /model/);
  assert.throws(() => buildRequest({ ...openai, baseUrl: '' }, input), /base URL/);
});

test('extractDelta for both providers', () => {
  assert.strictEqual(extractDelta('openai', { data: JSON.stringify({ choices: [{ delta: { content: 'Hi' } }] }) }), 'Hi');
  assert.strictEqual(extractDelta('openai', { data: '[DONE]' }), '');
  assert.strictEqual(
    extractDelta('anthropic', { data: JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Yo' } }) }),
    'Yo'
  );
  assert.strictEqual(extractDelta('anthropic', { data: JSON.stringify({ type: 'message_start' }) }), '');
  assert.throws(() => extractDelta('anthropic', { data: JSON.stringify({ type: 'error', error: { message: 'boom' } }) }), /boom/);
});

function fakeStream(parts) {
  const enc = new TextEncoder();
  return {
    ok: true,
    body: (async function* () {
      for (const p of parts) yield enc.encode(p);
    })(),
  };
}

test('streamChat assembles tokens across split chunks', async () => {
  const sse = (t) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`;
  const whole = sse('Hel') + sse('lo') + 'data: [DONE]\n\n';
  const mid = Math.floor(whole.length / 2);
  const tokens = [];
  const text = await streamChat(openai, input, (t) => tokens.push(t), undefined, async () =>
    fakeStream([whole.slice(0, mid), whole.slice(mid)])
  );
  assert.strictEqual(text, 'Hello');
  assert.deepStrictEqual(tokens, ['Hel', 'lo']);
});

test('streamChat surfaces HTTP errors and missing keys', async () => {
  await assert.rejects(
    streamChat(openai, input, () => {}, undefined, async () => ({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: { message: 'bad key' } }),
    })),
    /401: bad key/
  );
  await assert.rejects(streamChat({ ...openai, apiKey: '' }, input, () => {}), /API key/);
});
