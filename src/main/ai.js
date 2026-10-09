'use strict';
const { SSEParser } = require('../shared/sse');

const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Builds the HTTP request (url, headers, body) for a streaming chat call.
 * `images` is an array of { mime, base64 } attached to the final user message.
 */
function buildRequest(cfg, { system, messages, images = [], maxTokens = 1024 }) {
  const base = (cfg.baseUrl || '').replace(/\/+$/, '');
  if (!base) throw new Error('No API base URL configured.');
  if (!cfg.model) throw new Error('No model configured.');

  if (cfg.provider === 'anthropic') {
    const msgs = messages.map((m) => ({ role: m.role, content: m.content }));
    if (images.length && msgs.length) {
      const last = msgs[msgs.length - 1];
      last.content = [
        ...images.map((img) => ({
          type: 'image',
          source: { type: 'base64', media_type: img.mime, data: img.base64 },
        })),
        { type: 'text', text: last.content },
      ];
    }
    return {
      url: `${base}/v1/messages`,
      headers: {
        'content-type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: { model: cfg.model, max_tokens: maxTokens, stream: true, system, messages: msgs },
    };
  }

  // OpenAI-compatible (OpenAI, Ollama, OpenRouter, Groq, LM Studio, ...)
  const msgs = [{ role: 'system', content: system }, ...messages.map((m) => ({ ...m }))];
  if (images.length) {
    const last = msgs[msgs.length - 1];
    last.content = [
      { type: 'text', text: last.content },
      ...images.map((img) => ({
        type: 'image_url',
        image_url: { url: `data:${img.mime};base64,${img.base64}` },
      })),
    ];
  }
  const headers = { 'content-type': 'application/json' };
  if (cfg.apiKey) headers.authorization = `Bearer ${cfg.apiKey}`;
  return {
    url: `${base}/chat/completions`,
    headers,
    body: { model: cfg.model, stream: true, max_tokens: maxTokens, messages: msgs },
  };
}

/** Extracts the text delta (if any) from one parsed SSE event. */
function extractDelta(provider, evt) {
  if (!evt.data || evt.data === '[DONE]') return '';
  let json;
  try {
    json = JSON.parse(evt.data);
  } catch {
    return '';
  }
  if (provider === 'anthropic') {
    if (json.type === 'content_block_delta' && json.delta && json.delta.type === 'text_delta') {
      return json.delta.text || '';
    }
    if (json.type === 'error') throw new Error(json.error && json.error.message ? json.error.message : 'API error');
    return '';
  }
  if (json.error) throw new Error(json.error.message || 'API error');
  const choice = json.choices && json.choices[0];
  return (choice && choice.delta && choice.delta.content) || '';
}

async function describeHttpError(res) {
  let detail = '';
  try {
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      detail = (j.error && (j.error.message || j.error)) || j.message || text;
    } catch {
      detail = text;
    }
  } catch {
    /* ignore */
  }
  return `AI request failed (${res.status}${detail ? ': ' + String(detail).slice(0, 300) : ''})`;
}

/**
 * Streams a chat completion, calling onToken for each text delta.
 * Resolves with the full text. Abort via the signal.
 */
async function streamChat(cfg, input, onToken, signal, fetchImpl = fetch) {
  const needsKey = cfg.provider === 'openai' || cfg.provider === 'anthropic';
  if (needsKey && !cfg.apiKey) throw new Error('No API key set. Open Settings and add one.');
  const req = buildRequest(cfg, input);
  const res = await fetchImpl(req.url, {
    method: 'POST',
    headers: req.headers,
    body: JSON.stringify(req.body),
    signal,
  });
  if (!res.ok) throw new Error(await describeHttpError(res));

  const parser = new SSEParser();
  const decoder = new TextDecoder();
  let full = '';
  const handle = (events) => {
    for (const evt of events) {
      const delta = extractDelta(cfg.provider, evt);
      if (delta) {
        full += delta;
        onToken(delta);
      }
    }
  };
  for await (const chunk of res.body) {
    handle(parser.push(decoder.decode(chunk, { stream: true })));
  }
  handle(parser.push(decoder.decode()));
  handle(parser.flush());
  return full;
}

module.exports = { buildRequest, extractDelta, streamChat };
