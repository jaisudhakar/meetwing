'use strict';
// Flight colors. hi/lo color the tail and nose, stripe/light the body stripe and trail,
// ink is the card label color (kept dark enough to read on the white card).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MWThemes = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const THEMES = [
    { key: 'sky', name: 'Sky', hi: '#4aa8ff', lo: '#1673d9', stripe: '#2f8cf0', light: '#7bbcff', ink: '#1f6fbf' },
    { key: 'crimson', name: 'Crimson', hi: '#ff5a6e', lo: '#c8102e', stripe: '#e2233f', light: '#ff8f9c', ink: '#b0102a' },
    { key: 'emerald', name: 'Emerald', hi: '#34d399', lo: '#059669', stripe: '#10b981', light: '#6ee7b7', ink: '#047857' },
    { key: 'amber', name: 'Amber', hi: '#fbbf24', lo: '#d97706', stripe: '#f59e0b', light: '#fcd34d', ink: '#92400e' },
    { key: 'violet', name: 'Violet', hi: '#a78bfa', lo: '#7c3aed', stripe: '#8b5cf6', light: '#c4b5fd', ink: '#6d28d9' },
    { key: 'rose', name: 'Rose', hi: '#fb7185', lo: '#e11d48', stripe: '#f43f5e', light: '#fda4af', ink: '#be123c' },
    { key: 'slate', name: 'Slate', hi: '#94a3b8', lo: '#475569', stripe: '#64748b', light: '#cbd5e1', ink: '#334155' },
    { key: 'midnight', name: 'Midnight', hi: '#3b4a7a', lo: '#111a3a', stripe: '#1f2b57', light: '#5b6ca8', ink: '#1f2b57' },
    { key: 'coral', name: 'Coral', hi: '#ff8a65', lo: '#f4511e', stripe: '#ff7043', light: '#ffab91', ink: '#c2410c' },
    { key: 'mint', name: 'Mint', hi: '#6ee7c8', lo: '#14b8a6', stripe: '#2dd4bf', light: '#99f6e4', ink: '#0f766e' },
    { key: 'gold', name: 'Gold', hi: '#fcd34d', lo: '#b8860b', stripe: '#d4a017', light: '#fde68a', ink: '#8a6100' },
    { key: 'indigo', name: 'Indigo', hi: '#818cf8', lo: '#4338ca', stripe: '#6366f1', light: '#a5b4fc', ink: '#4338ca' },
    { key: 'lime', name: 'Lime', hi: '#bef264', lo: '#65a30d', stripe: '#84cc16', light: '#d9f99d', ink: '#4d7c0f' },
    { key: 'fuchsia', name: 'Fuchsia', hi: '#f0abfc', lo: '#c026d3', stripe: '#d946ef', light: '#f5d0fe', ink: '#a21caf' },
    { key: 'ocean', name: 'Ocean', hi: '#38bdf8', lo: '#0369a1', stripe: '#0ea5e9', light: '#7dd3fc', ink: '#075985' },
    { key: 'white', name: 'White', hi: '#ffffff', lo: '#d6dde8', stripe: '#c5cfdd', light: '#e8edf4', ink: '#475569' },
    { key: 'cherry', name: 'Cherry', hi: '#f43f5e', lo: '#9f1239', stripe: '#be123c', light: '#fb7185', ink: '#9f1239' },
    { key: 'graphite', name: 'Graphite', hi: '#6b7280', lo: '#1f2937', stripe: '#374151', light: '#9ca3af', ink: '#374151' },
    { key: 'aurora', name: 'Aurora', hi: '#5eead4', lo: '#8b5cf6', stripe: '#22d3ee', light: '#c4b5fd', ink: '#6d28d9' },
    { key: 'honey', name: 'Honey', hi: '#fde047', lo: '#f59e0b', stripe: '#facc15', light: '#fef08a', ink: '#a16207' },
  ];
  const BY_KEY = Object.fromEntries(THEMES.map((t) => [t.key, t]));

  function get(key) {
    return BY_KEY[key] || BY_KEY.sky;
  }

  /** Sets the CSS variables the jet markup reads, on any element. */
  function apply(el, keyOrTheme) {
    const t = typeof keyOrTheme === 'string' ? get(keyOrTheme) : keyOrTheme || BY_KEY.sky;
    el.style.setProperty('--jet-hi', t.hi);
    el.style.setProperty('--jet-lo', t.lo);
    el.style.setProperty('--jet-stripe', t.stripe);
    el.style.setProperty('--jet-light', t.light);
    el.style.setProperty('--jet-ink', t.ink);
  }

  return { THEMES, get, apply };
});
