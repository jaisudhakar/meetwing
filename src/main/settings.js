'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULTS = {
  reminders: { leadMinutes: [10, 5], atStart: false },
  flight: {
    seconds: 9, // total time on screen
    size: 1, // 0.6 - 1.6 multiplier
    direction: 'ltr', // ltr | rtl | alternate
    display: 'cursor', // cursor | primary
    sound: false,
  },
  general: { launchAtLogin: false, showInTray: true },
  restUntil: 0, // epoch ms; reminders are paused until then (Infinity is stored as -1)
};

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch || {})) {
    if (!(k in base)) continue;
    out[k] = isPlainObject(v) && isPlainObject(base[k]) ? deepMerge(base[k], v) : v;
  }
  return out;
}

const clone = (o) => JSON.parse(JSON.stringify(o));

/**
 * Settings + calendar list. Calendar feed URLs are effectively passwords (Google's "secret
 * address"), so the whole calendar list is stored encrypted when the OS offers encryption.
 * `cipher` is { available, encrypt, decrypt } so Electron's safeStorage can be stubbed in tests.
 */
class SettingsStore {
  constructor(dir, cipher) {
    this.file = path.join(dir, 'settings.json');
    this.cipher = cipher || { available: () => false, encrypt: (s) => s, decrypt: (s) => s };
    this.data = clone(DEFAULTS);
    this.calendars = []; // [{ id, name, url }]
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
    this._clamp();
    const c = raw.calendars;
    if (!c || !c.value) return;
    try {
      const json = c.enc ? this.cipher.decrypt(c.value) : c.value;
      const list = JSON.parse(json);
      if (Array.isArray(list)) this.calendars = list.filter((x) => x && x.id && x.url);
    } catch {
      this.calendars = [];
    }
  }

  _save() {
    const json = JSON.stringify(this.calendars);
    const enc = this.cipher.available();
    const doc = {
      settings: this.data,
      calendars: { enc, value: enc ? this.cipher.encrypt(json) : json },
    };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(doc, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  _clamp() {
    const r = this.data.reminders;
    const leads = (Array.isArray(r.leadMinutes) ? r.leadMinutes : DEFAULTS.reminders.leadMinutes)
      .map((n) => Math.round(Number(n)))
      .filter((n) => Number.isFinite(n) && n > 0 && n <= 24 * 60);
    r.leadMinutes = [...new Set(leads)].sort((a, b) => b - a).slice(0, 6);
    r.atStart = !!r.atStart;
    const f = this.data.flight;
    f.seconds = Math.min(30, Math.max(5, Number(f.seconds) || DEFAULTS.flight.seconds));
    f.size = Math.min(1.6, Math.max(0.6, Number(f.size) || 1));
    if (!['ltr', 'rtl', 'alternate'].includes(f.direction)) f.direction = 'ltr';
    if (!['cursor', 'primary'].includes(f.display)) f.display = 'cursor';
    f.sound = !!f.sound;
  }

  /** Lead times the scheduler should use (includes 0 when "at start" is on). */
  leads() {
    const r = this.data.reminders;
    return r.atStart ? [...r.leadMinutes, 0] : [...r.leadMinutes];
  }

  getPublic() {
    return {
      ...clone(this.data),
      calendars: this.calendars.map((c) => ({ id: c.id, name: c.name, host: hostOf(c.url) })),
      encrypted: this.cipher.available(),
    };
  }

  update(patch = {}) {
    this.data = deepMerge(this.data, patch);
    this._clamp();
    this._save();
    return this.getPublic();
  }

  addCalendar({ name, url }) {
    const cal = { id: crypto.randomUUID(), name: String(name || '').trim().slice(0, 40) || 'Calendar', url };
    this.calendars.push(cal);
    this._save();
    return cal;
  }

  removeCalendar(id) {
    const before = this.calendars.length;
    this.calendars = this.calendars.filter((c) => c.id !== id);
    if (this.calendars.length !== before) this._save();
    return this.calendars.length !== before;
  }

  setRestUntil(ms) {
    this.data.restUntil = ms;
    this._save();
  }

  isResting(now = Date.now()) {
    const r = this.data.restUntil;
    return r === -1 || r > now;
  }
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

module.exports = { SettingsStore, DEFAULTS };
