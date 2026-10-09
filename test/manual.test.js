const test = require('node:test');
const assert = require('node:assert');
const { makeItem, expandManual } = require('../src/main/manual');
const { Scheduler } = require('../src/shared/scheduler');

const local = (y, m, d, h = 9, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const item = (over) => ({ id: 'r1', title: 'Take a break', start: local(2026, 10, 12, 15, 0), repeat: 'none', mode: 'attime', note: '', ...over });
const win = (a, b) => ({ fromMs: a, toMs: b });

test('makeItem validates', () => {
  const now = local(2026, 10, 12, 10, 0);
  assert.throws(() => makeItem({ title: '  ', whenMs: now + 1e6 }, now), /title/);
  assert.throws(() => makeItem({ title: 'x', whenMs: NaN }, now), /date and time/);
  assert.throws(() => makeItem({ title: 'x', whenMs: now - 3600e3 }, now), /passed/);
  assert.throws(() => makeItem({ title: 'x', whenMs: now + 1e6, repeat: 'hourly' }, now), /repeat/);
  // a repeating reminder may start in the past (e.g. "every day at 9")
  assert.strictEqual(makeItem({ title: ' x ', whenMs: now - 3600e3, repeat: 'daily' }, now).title, 'x');
  assert.strictEqual(makeItem({ title: 'x', whenMs: now + 1e6, mode: 'weird' }, now).mode, 'attime');
});

test('one-off reminder appears once, inside the window only', () => {
  const [e] = expandManual([item()], win(local(2026, 10, 12, 0), local(2026, 10, 13, 0)));
  assert.strictEqual(e.title, 'Take a break');
  assert.strictEqual(e.source, 'Reminder');
  assert.deepStrictEqual(e.leads, [0]);
  assert.deepStrictEqual(expandManual([item()], win(local(2026, 10, 13, 0), local(2026, 10, 14, 0))), []);
});

test('daily, weekdays and weekly repeat at the same local time', () => {
  const from = local(2026, 10, 9, 0); // Fri
  const to = local(2026, 10, 16, 0); // next Fri (exclusive)
  const days = (repeat) => expandManual([item({ repeat, start: local(2026, 10, 5, 8, 30) })], win(from, to)).map((e) => new Date(e.start).getDay());
  assert.deepStrictEqual(days('daily'), [5, 6, 0, 1, 2, 3, 4]);
  assert.deepStrictEqual(days('weekdays'), [5, 1, 2, 3, 4]);
  assert.deepStrictEqual(days('weekly'), [1]); // base date Oct 5 is a Monday
  const e = expandManual([item({ repeat: 'daily', start: local(2026, 10, 5, 8, 30) })], win(from, to))[0];
  assert.strictEqual(new Date(e.start).getHours(), 8);
  assert.strictEqual(new Date(e.start).getMinutes(), 30);
});

test('repeats never fire before their first date', () => {
  const evs = expandManual([item({ repeat: 'daily', start: local(2026, 10, 14, 9) })], win(local(2026, 10, 12, 0), local(2026, 10, 16, 0)));
  assert.deepStrictEqual(evs.map((e) => new Date(e.start).getDate()), [14, 15]);
});

test('"lead" reminders use the global lead times; "attime" fires once with a Reminder label', () => {
  const s = new Scheduler({ leadMinutes: [10, 5] });
  const t = local(2026, 10, 12, 15, 0);
  s.setEvents(expandManual([item({ id: 'a' }), item({ id: 'b', title: 'Ahead', mode: 'lead' })], win(t - 3600e3, t + 3600e3)));
  const at = s.due(t - 10 * 60000 + 1000);
  assert.deepStrictEqual(at.map((d) => [d.event.title, d.label]), [['Ahead', 'In 10 min']]);
  const now = s.due(t + 1000);
  assert.deepStrictEqual(now.map((d) => [d.event.title, d.label]), [['Take a break', 'Reminder']]);
});
