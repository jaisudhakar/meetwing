'use strict';
// In-memory transcript model: filtering of speech-to-text hallucinations,
// merging of consecutive utterances and context windowing for prompts.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MWTranscript = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // Whisper-style models emit these on near-silent audio.
  const HALLUCINATIONS = [
    'thank you',
    'thanks for watching',
    'thank you for watching',
    'thank you very much',
    'bye',
    'you',
    'subtitles by the amara.org community',
    'please subscribe',
  ];

  function normalize(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s.]/gu, '')
      .replace(/\.+$/g, '')
      .trim();
  }

  function isHallucination(text) {
    const n = normalize(text);
    if (!n) return true;
    return HALLUCINATIONS.includes(n);
  }

  class Transcript {
    constructor({ mergeWindowMs = 8000 } = {}) {
      this.entries = [];
      this.mergeWindowMs = mergeWindowMs;
      this._seq = 0;
    }

    /** Adds an utterance. Returns the (possibly merged) entry, or null if filtered. */
    add(speaker, text, ts = Date.now()) {
      const clean = String(text || '').replace(/\s+/g, ' ').trim();
      if (!clean || isHallucination(clean)) return null;
      const last = this.entries[this.entries.length - 1];
      if (last && last.speaker === speaker && ts - last.ts <= this.mergeWindowMs) {
        last.text += ' ' + clean;
        last.ts = ts;
        return last;
      }
      const entry = { id: ++this._seq, speaker, text: clean, ts };
      this.entries.push(entry);
      return entry;
    }

    clear() {
      this.entries = [];
    }

    toText(entries = this.entries) {
      return entries.map((e) => `${e.speaker === 'me' ? 'You' : 'Them'}: ${e.text}`).join('\n');
    }

    /** Most recent transcript text, trimmed to at most maxChars (whole lines only). */
    recent(maxChars = 6000) {
      const lines = this.entries.map((e) => `${e.speaker === 'me' ? 'You' : 'Them'}: ${e.text}`);
      const out = [];
      let total = 0;
      for (let i = lines.length - 1; i >= 0; i--) {
        if (total + lines[i].length + 1 > maxChars && out.length) break;
        out.unshift(lines[i].length > maxChars ? lines[i].slice(-maxChars) : lines[i]);
        total += lines[i].length + 1;
      }
      return out.join('\n');
    }
  }

  return { Transcript, isHallucination, normalize };
});
