const test = require('node:test');
const assert = require('node:assert');
const { parseOccurrences, normalizeCalendarUrl, findMeetingLink, detectSource } = require('../src/main/ics');

const wrap = (body) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//EN\r\n${body}END:VCALENDAR\r\n`;
const utc = (iso) => Date.parse(iso);
const win = (from, to) => ({ fromMs: utc(from), toMs: utc(to), calendarName: 'Google Calendar' });

test('single UTC event, with Zoom link detection and calendar name as source', () => {
  const ics = wrap(`BEGIN:VEVENT
UID:a1
DTSTART:20261012T140000Z
DTEND:20261012T143000Z
SUMMARY:Product sync with the team
DESCRIPTION:Join: https://acme.zoom.us/j/12345?pwd=abc\\nThanks
END:VEVENT
`);
  const [e] = parseOccurrences(ics, win('2026-10-12T00:00:00Z', '2026-10-13T00:00:00Z'));
  assert.strictEqual(e.title, 'Product sync with the team');
  assert.strictEqual(e.start, utc('2026-10-12T14:00:00Z'));
  assert.strictEqual(e.end, utc('2026-10-12T14:30:00Z'));
  assert.strictEqual(e.source, 'Google Calendar');
  assert.strictEqual(e.link, 'https://acme.zoom.us/j/12345?pwd=abc');
});

test('Calendly bookings are labelled Calendly', () => {
  const ics = wrap(`BEGIN:VEVENT
UID:c1
DTSTART:20261012T150000Z
DTEND:20261012T153000Z
SUMMARY:Intro call with Alex
DESCRIPTION:Event booked via https://calendly.com/events/xyz
END:VEVENT
`);
  const [e] = parseOccurrences(ics, win('2026-10-12T00:00:00Z', '2026-10-13T00:00:00Z'));
  assert.strictEqual(e.source, 'Calendly');
});

test('skips all-day, cancelled and out-of-window events', () => {
  const ics = wrap(`BEGIN:VEVENT
UID:d1
DTSTART;VALUE=DATE:20261012
SUMMARY:Holiday
END:VEVENT
BEGIN:VEVENT
UID:d2
DTSTART:20261012T100000Z
DTEND:20261012T110000Z
SUMMARY:Cancelled thing
STATUS:CANCELLED
END:VEVENT
BEGIN:VEVENT
UID:d3
DTSTART:20261020T100000Z
DTEND:20261020T110000Z
SUMMARY:Next week
END:VEVENT
`);
  assert.deepStrictEqual(parseOccurrences(ics, win('2026-10-12T00:00:00Z', '2026-10-13T00:00:00Z')), []);
});

const NY = `BEGIN:VTIMEZONE
TZID:America/New_York
BEGIN:DAYLIGHT
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
TZNAME:EDT
DTSTART:19700308T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
TZNAME:EST
DTSTART:19701101T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
END:STANDARD
END:VTIMEZONE
`;

test('weekly recurring event in a named timezone, with EXDATE and a moved occurrence', () => {
  const ics = wrap(`${NY}BEGIN:VEVENT
UID:w1
DTSTART;TZID=America/New_York:20261005T090000
DTEND;TZID=America/New_York:20261005T093000
RRULE:FREQ=WEEKLY;BYDAY=MO
EXDATE;TZID=America/New_York:20261019T090000
SUMMARY:Standup
END:VEVENT
BEGIN:VEVENT
UID:w1
RECURRENCE-ID;TZID=America/New_York:20261026T090000
DTSTART;TZID=America/New_York:20261026T110000
DTEND;TZID=America/New_York:20261026T113000
SUMMARY:Standup (moved)
END:VEVENT
`);
  const occ = parseOccurrences(ics, win('2026-10-05T00:00:00Z', '2026-11-03T00:00:00Z'));
  // Oct 5 09:00 EDT = 13:00Z; Oct 12 same; Oct 19 excluded; Oct 26 moved to 11:00 EDT = 15:00Z; Nov 2 09:00 EST = 14:00Z
  assert.deepStrictEqual(
    occ.map((o) => [new Date(o.start).toISOString(), o.title]),
    [
      ['2026-10-05T13:00:00.000Z', 'Standup'],
      ['2026-10-12T13:00:00.000Z', 'Standup'],
      ['2026-10-26T15:00:00.000Z', 'Standup (moved)'],
      ['2026-11-02T14:00:00.000Z', 'Standup'],
    ]
  );
});

test('infinite recurrence is bounded', () => {
  const ics = wrap(`BEGIN:VEVENT
UID:i1
DTSTART:20200101T100000Z
DTEND:20200101T101500Z
RRULE:FREQ=DAILY
SUMMARY:Daily
END:VEVENT
`);
  const occ = parseOccurrences(ics, win('2026-10-12T00:00:00Z', '2026-10-14T00:00:00Z'));
  assert.strictEqual(occ.length, 2);
});

test('normalizeCalendarUrl', () => {
  assert.strictEqual(normalizeCalendarUrl('webcal://x.com/a.ics'), 'https://x.com/a.ics');
  assert.throws(() => normalizeCalendarUrl('ftp://x.com/a.ics'), /https/);
  assert.throws(() => normalizeCalendarUrl('not a url'), /valid URL/);
});

test('helpers', () => {
  assert.strictEqual(findMeetingLink('', 'Room 4', 'see https://meet.google.com/abc-defg-hij.'), 'https://meet.google.com/abc-defg-hij');
  assert.strictEqual(findMeetingLink('nothing here'), '');
  assert.strictEqual(detectSource('Work', 'see CALENDLY.com/x'), 'Calendly');
  assert.strictEqual(detectSource('', ''), 'Calendar');
});
