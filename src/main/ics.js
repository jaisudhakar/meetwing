'use strict';
// ICS (iCalendar) parsing: turns a calendar feed into a flat list of upcoming
// occurrences, expanding recurring events and honouring exceptions / cancellations.
const ICAL = require('ical.js');

const MAX_OCCURRENCES_PER_EVENT = 500; // in-window occurrences per series
const MAX_ITERATIONS_PER_EVENT = 50000; // total steps, so ancient daily series still reach today

// Conferencing links we can open with "join meeting".
const MEETING_LINK_RE =
  /https?:\/\/[^\s<>"')\\]*(?:zoom\.us|zoomgov\.com|meet\.google\.com|teams\.microsoft\.com|teams\.live\.com|webex\.com|whereby\.com|gotomeeting\.com|goto\.com|bluejeans\.com|around\.co|chime\.aws|slack\.com\/huddle)[^\s<>"')\\]*/i;

function findMeetingLink(...texts) {
  for (const t of texts) {
    if (!t) continue;
    const m = MEETING_LINK_RE.exec(String(t).replace(/\\n/g, ' '));
    if (m) return m[0].replace(/[.,;]+$/, '');
  }
  return '';
}

/** Label shown on the card: the booking tool when we can tell, else the calendar's name. */
function detectSource(calendarName, ...texts) {
  const blob = texts.filter(Boolean).join(' ').toLowerCase();
  if (blob.includes('calendly.com')) return 'Calendly';
  if (blob.includes('cal.com')) return 'Cal.com';
  return calendarName || 'Calendar';
}

function registerTimezones(comp) {
  for (const vtz of comp.getAllSubcomponents('vtimezone')) {
    try {
      const tz = new ICAL.Timezone(vtz);
      if (!ICAL.TimezoneService.has(tz.tzid)) ICAL.TimezoneService.register(tz.tzid, tz);
    } catch {
      /* unknown tz definitions fall back to UTC/floating handling */
    }
  }
}

/**
 * Parses ICS text and returns occurrences starting in [fromMs, toMs).
 * All-day and cancelled events are skipped (nothing to be "late" for).
 * Each item: { uid, title, start, end, source, link }
 */
function parseOccurrences(icsText, { fromMs, toMs, calendarName = '' }) {
  const comp = new ICAL.Component(ICAL.parse(icsText));
  registerTimezones(comp);

  const masters = new Map(); // uid -> ICAL.Event
  const exceptions = [];
  const singles = [];

  for (const vevent of comp.getAllSubcomponents('vevent')) {
    const ev = new ICAL.Event(vevent);
    if (!ev.startDate) continue;
    if (ev.isRecurrenceException()) exceptions.push(ev);
    else if (ev.isRecurring()) masters.set(ev.uid, ev);
    else singles.push(ev);
  }
  for (const ex of exceptions) {
    const master = masters.get(ex.uid);
    if (master) master.relateException(ex);
    else singles.push(ex); // orphan exception: treat as a one-off event
  }

  const out = [];
  const push = (ev, startDate, endDate, item) => {
    if (startDate.isDate) return; // all-day
    const status = String(item.component.getFirstPropertyValue('status') || '').toUpperCase();
    if (status === 'CANCELLED') return;
    const start = startDate.toJSDate().getTime();
    if (start < fromMs || start >= toMs) return;
    const description = item.description || '';
    const location = item.location || '';
    const url = item.component.getFirstPropertyValue('url') || '';
    out.push({
      uid: `${ev.uid}@${start}`,
      title: (item.summary || '').trim() || '(No title)',
      start,
      end: (endDate || startDate).toJSDate().getTime(),
      source: detectSource(calendarName, description, location, String(url)),
      link: findMeetingLink(url, location, description),
    });
  };

  for (const ev of singles) push(ev, ev.startDate, ev.endDate, ev);

  for (const ev of masters.values()) {
    const it = ev.iterator();
    let steps = 0;
    let inWindow = 0;
    for (let next = it.next(); next; next = it.next()) {
      if (++steps > MAX_ITERATIONS_PER_EVENT) break;
      const ms = next.toJSDate().getTime();
      if (ms >= toMs) break;
      if (ms < fromMs - 24 * 3600 * 1000) continue; // exceptions may move an occurrence later
      if (++inWindow > MAX_OCCURRENCES_PER_EVENT) break;
      const d = ev.getOccurrenceDetails(next);
      push(ev, d.startDate, d.endDate, d.item);
    }
  }

  return out.sort((a, b) => a.start - b.start);
}

/** webcal:// is just https:// for calendar apps. */
function normalizeCalendarUrl(raw) {
  let s = String(raw || '').trim();
  if (/^webcals?:\/\//i.test(s)) s = s.replace(/^webcal/i, 'http').replace(/^http:\/\//i, 'https://');
  let u;
  try {
    u = new URL(s);
  } catch {
    throw new Error('That does not look like a valid URL.');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Calendar URL must start with https:// or webcal://');
  return u.toString();
}

module.exports = { parseOccurrences, normalizeCalendarUrl, findMeetingLink, detectSource };
