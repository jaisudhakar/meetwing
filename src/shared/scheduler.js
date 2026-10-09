'use strict';
// Decides which reminders are due. Pure logic: callers pass the current time.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MWScheduler = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const MIN = 60 * 1000;

  function reminderLabel(minutes) {
    if (minutes <= 0) return 'Starting now';
    return `Starting in ${minutes} min`;
  }

  /** "in 12 min", "now", "in 1 h 5 min" - for menus. */
  function relativeTime(deltaMs) {
    const mins = Math.round(deltaMs / MIN);
    if (mins <= 0) return 'now';
    if (mins < 60) return `in ${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `in ${h} h ${m} min` : `in ${h} h`;
  }

  class Scheduler {
    /**
     * leadMinutes: minutes before the start to remind at (0 = at start). graceMs: how late a
     * reminder may still fire, so a slow tick or short sleep does not swallow it, while a long
     * sleep does not replay stale ones.
     */
    constructor({ leadMinutes = [10, 5], graceMs = 90 * 1000 } = {}) {
      this.setLeads(leadMinutes);
      this.graceMs = graceMs;
      this.events = [];
      this.fired = new Set();
    }

    setLeads(list) {
      const clean = [...new Set((list || []).map((n) => Math.round(Number(n))).filter((n) => n >= 0 && n <= 24 * 60))];
      this.leads = clean.sort((a, b) => b - a);
    }

    setEvents(events) {
      this.events = events.slice().sort((a, b) => a.start - b.start);
      // forget keys of events that are gone so the set cannot grow forever
      const live = new Set(this.events.map((e) => e.uid));
      for (const key of this.fired) if (!live.has(key.split('#')[0])) this.fired.delete(key);
    }

    /** Reminders that should fly now. Each is returned at most once. */
    due(now) {
      const out = [];
      for (const ev of this.events) {
        for (const lead of this.leads) {
          const at = ev.start - lead * MIN;
          if (now < at || now >= at + this.graceMs || now > ev.end) continue;
          const key = `${ev.uid}#${lead}`;
          if (this.fired.has(key)) continue;
          this.fired.add(key);
          out.push({ event: ev, minutes: lead, label: reminderLabel(lead) });
        }
      }
      return out;
    }

    /** Next event that has not ended yet. */
    next(now) {
      return this.events.find((e) => e.end > now && e.start + 15 * MIN > now) || null;
    }

    reset() {
      this.fired.clear();
    }
  }

  return { Scheduler, reminderLabel, relativeTime };
});
