const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SettingsStore } = require('../src/main/settings');

const rot = (s) => s.split('').reverse().join('');
const cipher = { available: () => true, encrypt: (s) => rot(Buffer.from(s).toString('base64')), decrypt: (s) => Buffer.from(rot(s), 'base64').toString() };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mw-set-'));

test('calendar URLs are encrypted on disk and only the host is exposed', () => {
  const dir = tmp();
  const s = new SettingsStore(dir, cipher);
  s.addCalendar({ name: 'Work', url: 'https://calendar.google.com/calendar/ical/me%40x.com/private-SECRET123/basic.ics' });
  const disk = fs.readFileSync(path.join(dir, 'settings.json'), 'utf8');
  assert.ok(!disk.includes('SECRET123'));
  const pub = s.getPublic();
  assert.deepStrictEqual(pub.calendars.map((c) => [c.name, c.host]), [['Work', 'calendar.google.com']]);
  assert.ok(!JSON.stringify(pub).includes('SECRET123'));
  assert.strictEqual(new SettingsStore(dir, cipher).calendars[0].url.includes('SECRET123'), true);
});

test('works without OS encryption', () => {
  const dir = tmp();
  const plain = { available: () => false, encrypt: (s) => s, decrypt: (s) => s };
  new SettingsStore(dir, plain).addCalendar({ name: 'A', url: 'https://x.test/a.ics' });
  assert.strictEqual(new SettingsStore(dir, plain).calendars.length, 1);
});

test('remove calendar', () => {
  const s = new SettingsStore(tmp(), cipher);
  const c = s.addCalendar({ name: '', url: 'https://x.test/a.ics' });
  assert.strictEqual(c.name, 'Calendar');
  assert.strictEqual(s.removeCalendar(c.id), true);
  assert.strictEqual(s.removeCalendar(c.id), false);
});

test('lead times and flight values are sanitised; unknown keys ignored', () => {
  const s = new SettingsStore(tmp(), cipher);
  const pub = s.update({
    reminders: { leadMinutes: ['15', 5, 5, -1, 'x', 99999], atStart: true },
    flight: { seconds: 1, size: 9, direction: 'up' },
    bogus: 1,
  });
  assert.deepStrictEqual(pub.reminders.leadMinutes, [15, 5]);
  assert.deepStrictEqual(s.leads(), [15, 5, 0]);
  assert.strictEqual(pub.flight.seconds, 5);
  assert.strictEqual(pub.flight.size, 1.6);
  assert.strictEqual(pub.flight.direction, 'ltr');
  assert.strictEqual(pub.bogus, undefined);
});

test('rest mode', () => {
  const s = new SettingsStore(tmp(), cipher);
  assert.strictEqual(s.isResting(1000), false);
  s.setRestUntil(5000);
  assert.strictEqual(s.isResting(1000), true);
  assert.strictEqual(s.isResting(6000), false);
  s.setRestUntil(-1);
  assert.strictEqual(s.isResting(1e15), true);
});
