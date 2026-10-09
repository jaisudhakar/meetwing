'use strict';
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  mode: 'assist',
  customInstructions: '',
  ai: {
    provider: 'openai', // openai | anthropic | ollama | custom
    baseUrl: '',
    model: '',
  },
  stt: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'whisper-1',
    language: '',
  },
  audio: {
    micDeviceId: 'default',
    captureMic: true,
    captureSystem: true,
    chunkSeconds: 6,
  },
  ui: {
    opacity: 0.92,
    stealth: true, // hide the window from screen sharing / recordings
    alwaysOnTop: true,
  },
};

const SECRET_KEYS = ['aiApiKey', 'sttApiKey'];

const PROVIDER_PRESETS = {
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  anthropic: { baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-5-5' },
  ollama: { baseUrl: 'http://localhost:11434/v1', model: 'llama3.2-vision' },
  custom: { baseUrl: '', model: '' },
};

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch || {})) {
    if (isPlainObject(v) && isPlainObject(base[k])) out[k] = deepMerge(base[k], v);
    else if (k in base || k === 'customInstructions') out[k] = v;
  }
  return out;
}

/**
 * JSON settings file with encrypted API keys.
 * `crypto` is { encrypt(str)->str, decrypt(str)->str, available() } so Electron's
 * safeStorage can be swapped for a stub in tests.
 */
class SettingsStore {
  constructor(dir, crypto) {
    this.file = path.join(dir, 'settings.json');
    this.crypto = crypto || { available: () => false, encrypt: (s) => s, decrypt: (s) => s };
    this.data = structuredCloneSafe(DEFAULTS);
    this.secrets = { aiApiKey: '', sttApiKey: '' };
    this._load();
  }

  _load() {
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return;
    }
    this.data = deepMerge(DEFAULTS, raw.settings || {});
    for (const key of SECRET_KEYS) {
      const stored = raw.secrets && raw.secrets[key];
      if (!stored) continue;
      try {
        this.secrets[key] = stored.enc ? this.crypto.decrypt(stored.value) : stored.value;
      } catch {
        this.secrets[key] = '';
      }
    }
  }

  _save() {
    const secrets = {};
    for (const key of SECRET_KEYS) {
      const val = this.secrets[key];
      if (!val) continue;
      if (this.crypto.available()) secrets[key] = { enc: true, value: this.crypto.encrypt(val) };
      else secrets[key] = { enc: false, value: val };
    }
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ settings: this.data, secrets }, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  /** Settings safe to send to the renderer: no secrets, only whether they are set. */
  getPublic() {
    return {
      ...structuredCloneSafe(this.data),
      hasAiKey: !!this.secrets.aiApiKey,
      hasSttKey: !!this.secrets.sttApiKey,
      keysEncrypted: this.crypto.available(),
      presets: PROVIDER_PRESETS,
    };
  }

  /** Effective AI config including secrets, for use in the main process only. */
  getAi() {
    const ai = this.data.ai;
    const preset = PROVIDER_PRESETS[ai.provider] || PROVIDER_PRESETS.custom;
    return {
      provider: ai.provider,
      baseUrl: ai.baseUrl || preset.baseUrl,
      model: ai.model || preset.model,
      apiKey: this.secrets.aiApiKey,
    };
  }

  getStt() {
    const stt = this.data.stt;
    return {
      baseUrl: stt.baseUrl || DEFAULTS.stt.baseUrl,
      model: stt.model || DEFAULTS.stt.model,
      language: stt.language,
      // Fall back to the AI key when both use OpenAI.
      apiKey:
        this.secrets.sttApiKey ||
        (this.data.ai.provider === 'openai' ? this.secrets.aiApiKey : ''),
    };
  }

  /**
   * Applies a patch. Secret fields: `aiApiKey` / `sttApiKey` set a new key,
   * `null` clears it, `undefined`/'' leaves it unchanged.
   */
  update(patch = {}) {
    const { aiApiKey, sttApiKey, ...rest } = patch;
    this.data = deepMerge(this.data, rest);
    this._clamp();
    for (const [key, val] of [['aiApiKey', aiApiKey], ['sttApiKey', sttApiKey]]) {
      if (val === null) this.secrets[key] = '';
      else if (typeof val === 'string' && val.trim()) this.secrets[key] = val.trim();
    }
    this._save();
    return this.getPublic();
  }

  _clamp() {
    const a = this.data.audio;
    a.chunkSeconds = Math.min(30, Math.max(2, Number(a.chunkSeconds) || DEFAULTS.audio.chunkSeconds));
    const u = this.data.ui;
    u.opacity = Math.min(1, Math.max(0.3, Number(u.opacity) || DEFAULTS.ui.opacity));
  }
}

function structuredCloneSafe(o) {
  return JSON.parse(JSON.stringify(o));
}

module.exports = { SettingsStore, DEFAULTS, PROVIDER_PRESETS };
