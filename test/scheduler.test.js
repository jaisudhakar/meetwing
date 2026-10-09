const test = require('node:test');
const assert = require('node:assert');
const { Scheduler, reminderLabel, relativeTime } = require('../src/shared/scheduler');

const MIN = 60000;
const ev = (uid, startMin, lenMin = 30) => ({ uid, title: uid, start: startMin * MIN, end: (startMin + lenMin) * MIN });

test('labels', () => {
  assert.strictEqual(reminderLabel(10), 'Starting in 10 min');
  assert.strictEqual(reminderLabel(0), 'Starting now');
  assert.strictEqual(relativeTime(20 * 1000), 'now');
  assert.strictEqual(relativeTime(12 * MIN), 'in 12 min');
  assert.strictEqual(relativeTime(65 * MIN), 'in 1 h 5 min');
  assert.strictEqual(relativeTime(120 * MIN), 'in 2 h');
});

test('fires each lead once, in the grace window', () => {
  const s = new Scheduler({ leadMinutes: [10, 5], graceMs: 90000 });
  s.setEvents([ev('a', 100)]);
  assert.deepStrictEqual(s.due(88 * MIN), []); // too early
  const first = s.due(90 * MIN + 5000);
  assert.deepStrictEqual(first.map((d) => [d.minutes, d.label]), [[10, 'Starting in 10 min']]);
  assert.deepStrictEqual(s.due(90 * MIN + 20000), []); // not twice
  assert.deepStrictEqual(s.due(95 * MIN).map((d) => d.minutes), [5]);
});

test('late ticks outside the grace window do not replay stale reminders', () => {
  const s = new Scheduler({ leadMinutes: [10, 5], graceMs: 90000 });
  s.setEvents([ev('a', 100)]);
  assert.deepStrictEqual(s.due(97 * MIN), []); // laptop woke 3 min before: both leads are stale
});

test('lead 0 is "Starting now"; ended events never fire; leads are sanitised', () => {
  const s = new Scheduler({ leadMinutes: [0, 0, -3, 'x', 5.4] });
  assert.deepStrictEqual(s.leads, [5, 0]);
  s.setEvents([ev('a', 100, 10)]);
  assert.deepStrictEqual(s.due(100 * MIN + 1000).map((d) => d.label), ['Starting now']);
  s.reset();
  assert.deepStrictEqual(s.due(200 * MIN), []);
});

test('setEvents keeps fired state for live events and drops it for removed ones', () => {
  const s = new Scheduler({ leadMinutes: [5] });
  s.setEvents([ev('a', 100)]);
  s.due(95 * MIN);
  s.setEvents([ev('a', 100)]); // calendar refresh must not re-fire
  assert.deepStrictEqual(s.due(95 * MIN + 1000), []);
  s.setEvents([]);
  assert.strictEqual(s.fired.size, 0);
});

test('next() skips finished events', () => {
  const s = new Scheduler();
  s.setEvents([ev('past', 10, 10), ev('now', 50, 30), ev('later', 90)]);
  assert.strictEqual(s.next(60 * MIN).uid, 'now');
  assert.strictEqual(s.next(100 * MIN).uid, 'later');
});
