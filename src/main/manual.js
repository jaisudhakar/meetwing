'use strict';
// Hand-made reminders (no calendar needed): one-off or repeating at a local time of day.

const DAY = 24 * 60 * 60 * 1000;
const REPEATS = ['none', 'daily', 'weekdays', 'weekly'];

/** Validates user input and returns a clean reminder item, or throws a readable error. */
function makeItem({ title, whenMs, repeat = 'none', mode = 'attime', note = '' }, now = Date.now()) {
  const t = String(title || '').trim().slice(0, 120);
  if (!t) throw new Error('Give the reminder a title.');
  const start = Number(whenMs);
  if (!Number.isFinite(start)) throw new Error('Pick a date and time.');
  if (!REPEATS.includes(repeat)) throw new Error('Unknown repeat option.');
  if (repeat === 'none' && start < now - 60 * 1000) throw new Error('That time has already passed.');
  return {
    title: t,
    start,
    repeat,
    mode: mode === 'lead' ? 'lead' : 'attime',
    note: String(note || '').trim().slice(0, 60),
  };
}

function matches(repeat, date, base) {
  if (repeat === 'daily') return true;
  if (repeat === 'weekdays') return date.getDay() >= 1 && date.getDay() <= 5;
  if (repeat === 'weekly') return date.getDay() === base.getDay();
  return false;
}

/** Occurrences of all reminders that start in [fromMs, toMs), as scheduler events. */
function expandManual(items, { fromMs, toMs }) {
  const out = [];
  for (const it of items) {
    const base = new Date(it.start);
    const push = (startMs) => {
      if (startMs < fromMs || startMs >= toMs) return;
      out.push({
        uid: `m:${it.id}@${startMs}`,
        title: it.title,
        start: startMs,
        end: startMs + 5 * 60 * 1000,
        source: it.note || 'Reminder',
        link: '',
        kind: 'reminder',
        leads: it.mode === 'lead' ? null : [0], // null = use the global lead times
      });
    };
    if (it.repeat === 'none') {
      push(it.start);
      continue;
    }
    const first = new Date(fromMs - DAY); // include yesterday so a late tick still sees it
    for (let d = new Date(first.getFullYear(), first.getMonth(), first.getDate()); d.getTime() < toMs; d.setDate(d.getDate() + 1)) {
      const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), base.getHours(), base.getMinutes()).getTime();
      if (at < it.start) continue;
      if (matches(it.repeat, d, base)) push(at);
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

module.exports = { makeItem, expandManual, REPEATS };
