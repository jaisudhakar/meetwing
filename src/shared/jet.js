'use strict';
// The jet artwork, shared by the flight overlay, the settings preview and the color swatches.
// Colors come from CSS variables (see MWThemes.apply), so each instance can have its own.
// `id` must be unique in the document: gradients and clip paths are referenced by id.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MWJet = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const HULL = 'M44 48 C96 30 214 30 280 46 C304 52 314 59 307 64 C300 70 280 73 256 73 L76 73 C56 73 44 63 44 48 Z';

  function svg(id, cls = 'jet') {
    const b = `${id}-body`;
    const t = `${id}-tone`;
    const h = `${id}-hull`;
    return `<svg id="${id}" class="${cls}" viewBox="0 0 320 110" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
<defs>
<linearGradient id="${b}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.6" stop-color="#eef3fa"/><stop offset="1" stop-color="#c9d6e8"/></linearGradient>
<linearGradient id="${t}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="jt-hi"/><stop offset="1" class="jt-lo"/></linearGradient>
<clipPath id="${h}"><path d="${HULL}"/></clipPath>
</defs>
<g fill="#2b3446"><rect x="226" y="72" width="3" height="9"/><circle cx="227.5" cy="84" r="5.5"/><rect x="112" y="72" width="3" height="9"/><circle cx="113.5" cy="84" r="5.5"/><circle cx="227.5" cy="84" r="2" fill="#9fb0c8"/><circle cx="113.5" cy="84" r="2" fill="#9fb0c8"/></g>
<path d="M150 64 L214 64 L176 92 L146 92 Z" fill="#9db4d4"/>
<path d="M52 50 L34 10 L66 10 L96 44 Z" fill="url(#${t})"/>
<path d="M44 48 L22 40 L26 34 L70 44 Z" fill="#c9d6e8"/>
<rect x="58" y="30" width="46" height="17" rx="8.5" fill="#aebdd3"/><ellipse cx="60" cy="38.5" rx="3.5" ry="7" fill="#46526a"/>
<path d="${HULL}" fill="url(#${b})"/>
<g clip-path="url(#${h})"><path d="M266 20 C284 40 292 60 276 90 L330 90 L330 20 Z" fill="url(#${t})"/><rect x="40" y="60" width="240" height="5" class="jt-stripe"/><rect x="40" y="66" width="240" height="2" class="jt-light"/></g>
<g fill="#27344d"><rect x="112" y="47" width="7" height="8" rx="3"/><rect x="127" y="47" width="7" height="8" rx="3"/><rect x="142" y="47" width="7" height="8" rx="3"/><rect x="157" y="47" width="7" height="8" rx="3"/><rect x="172" y="47" width="7" height="8" rx="3"/><rect x="187" y="47" width="7" height="8" rx="3"/><rect x="202" y="47" width="7" height="8" rx="3"/><rect x="217" y="47" width="7" height="8" rx="3"/><path d="M243 41 C255 41 266 44 272 49 L243 49 Z"/></g>
<path d="M128 62 L206 62 L160 98 L118 98 Z" fill="#c3d2e6"/><path d="M128 62 L206 62 L196 69 L124 69 Z" fill="#e6edf7"/>
<rect x="146" y="82" width="46" height="16" rx="8" fill="#9db4d4"/><ellipse cx="190" cy="90" rx="3.5" ry="7" fill="#46526a"/>
</svg>`;
  }

  // Shared CSS for the color hooks; each page includes these rules in its stylesheet.
  const CSS = '.jt-hi{stop-color:var(--jet-hi,#4aa8ff)}.jt-lo{stop-color:var(--jet-lo,#1673d9)}.jt-stripe{fill:var(--jet-stripe,#2f8cf0)}.jt-light{fill:var(--jet-light,#7bbcff)}';

  // Example scenes for previews (the "Test flight" button flies the selected one).
  const SCENES = [
    { key: 'standup', name: 'Standup', label: 'Starting in 5 min', title: 'Daily standup', source: 'Google Calendar' },
    { key: 'design', name: 'Design', label: 'Starting in 10 min', title: 'Product sync with the team', source: 'Google Calendar' },
    { key: 'calendly', name: 'Calendly', label: 'Starting in 5 min', title: 'Intro call with Alex', source: 'Calendly' },
    { key: 'apple', name: 'Apple', label: 'Starting in 15 min', title: 'Dentist appointment', source: 'Apple Calendar' },
    { key: 'oneone', name: '1:1', label: 'Starting in 10 min', title: '1:1 with your manager', source: 'Outlook' },
    { key: 'reminder', name: 'Reminder', label: 'Reminder', title: 'Stretch your legs', source: 'Stand up for 2 min' },
  ];

  return { svg, CSS, SCENES };
});
