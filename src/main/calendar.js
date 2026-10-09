'use strict';
const { parseOccurrences, normalizeCalendarUrl } = require('./ics');

const MAX_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 15000;

async function fetchIcs(url, fetchImpl = fetch) {
  const res = await fetchImpl(url, {
    headers: { 'user-agent': 'Meetwing/1.0', accept: 'text/calendar, text/plain, */*' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`Calendar server answered ${res.status}`);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error('Calendar feed is too large.');
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('That URL did not return an iCalendar (.ics) feed.');
  return text;
}

/** Loads upcoming events from every calendar. A failing calendar never hides the others. */
async function loadEvents(calendars, { fromMs, toMs }, fetchImpl = fetch) {
  const errors = [];
  const results = await Promise.all(
    calendars.map(async (cal) => {
      try {
        const text = await fetchIcs(cal.url, fetchImpl);
        return parseOccurrences(text, { fromMs, toMs, calendarName: cal.name });
      } catch (err) {
        errors.push({ id: cal.id, name: cal.name, error: err.message });
        return [];
      }
    })
  );
  // The same meeting often appears in two feeds (e.g. Calendly + Google). Keep one.
  const seen = new Set();
  const events = [];
  for (const ev of results.flat().sort((a, b) => a.start - b.start)) {
    const key = `${ev.title.toLowerCase()}|${ev.start}`;
    if (seen.has(key)) continue;
    seen.add(key);
    events.push(ev);
  }
  return { events, errors };
}

/** Validates a user-supplied feed: returns the normalized URL and the events found. */
async function checkCalendar(rawUrl, name, { fromMs, toMs }, fetchImpl = fetch) {
  const url = normalizeCalendarUrl(rawUrl);
  const text = await fetchIcs(url, fetchImpl);
  const events = parseOccurrences(text, { fromMs, toMs, calendarName: name });
  return { url, events };
}

module.exports = { fetchIcs, loadEvents, checkCalendar };
