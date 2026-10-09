'use strict';

const EXT_BY_MIME = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
};

function extensionFor(mime) {
  const base = String(mime || '').split(';')[0].trim().toLowerCase();
  return EXT_BY_MIME[base] || 'webm';
}

/** Transcribes an audio buffer via an OpenAI-compatible /audio/transcriptions endpoint. */
async function transcribe(cfg, audio, mime, fetchImpl = fetch) {
  if (!cfg.apiKey) throw new Error('No speech-to-text API key set. Open Settings and add one.');
  const base = cfg.baseUrl.replace(/\/+$/, '');
  const form = new FormData();
  const type = String(mime || 'audio/webm').split(';')[0];
  form.append('file', new Blob([audio], { type }), `chunk.${extensionFor(mime)}`);
  form.append('model', cfg.model);
  form.append('response_format', 'json');
  form.append('temperature', '0');
  if (cfg.language) form.append('language', cfg.language);

  const res = await fetchImpl(`${base}/audio/transcriptions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${cfg.apiKey}` },
    body: form,
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 300);
    } catch {
      /* ignore */
    }
    throw new Error(`Transcription failed (${res.status}${detail ? ': ' + detail : ''})`);
  }
  const json = await res.json();
  return (json.text || '').trim();
}

module.exports = { transcribe, extensionFor };
