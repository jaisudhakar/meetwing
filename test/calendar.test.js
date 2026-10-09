const test = require('node:test');
const assert = require('node:assert');
const { loadEvents, checkCalendar, fetchIcs } = require('../src/main/calendar');

const ics = (uid, start, title) =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:${uid}\r\nDTSTART:${start}\r\nDTEND:${start}\r\nSUMMARY:${title}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
const win = { fromMs: Date.parse('2026-10-12T00:00:00Z'), toMs: Date.parse('2026-10-13T00:00:00Z') };
const respond = (map) => async (url) => {
  const v = map[url];
  if (v instanceof Error) throw v;
  if (typeof v === 'number') return { ok: false, status: v, text: async () => '' };
  return { ok: true, status: 200, text: async () => v };
};

test('merges calendars, dedupes the same meeting, and isolates failures', async () => {
  const cals = [
    { id: '1', name: 'Google Calendar', url: 'u1' },
    { id: '2', name: 'Calendly', url: 'u2' },
    { id: '3', name: 'Broken', url: 'u3' },
  ];
  const f = respond({
    u1: ics('a', '20261012T140000Z', 'Intro call with Alex') + '',
    u2: ics('b', '20261012T140000Z', 'Intro call with Alex'),
    u3: new Error('network down'),
  });
  const { events, errors } = await loadEvents(cals, win, f);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].source, 'Google Calendar');
  assert.deepStrictEqual(errors.map((e) => [e.name, e.error]), [['Broken', 'network down']]);
});

test('rejects non-calendar responses and HTTP errors', async () => {
  await assert.rejects(fetchIcs('x', respond({ x: '<html>login</html>' })), /iCalendar/);
  await assert.rejects(fetchIcs('x', respond({ x: 404 })), /404/);
});

test('checkCalendar normalizes webcal and reports events', async () => {
  const r = await checkCalendar('webcal://h.test/a.ics', 'Work', win, respond({ 'https://h.test/a.ics': ics('a', '20261012T140000Z', 'X') }));
  assert.strictEqual(r.url, 'https://h.test/a.ics');
  assert.strictEqual(r.events.length, 1);
});
