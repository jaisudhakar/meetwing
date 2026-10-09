'use strict';
/* global meetwing, MWScheduler */

const $ = (id) => document.getElementById(id);
let current = null;

function toast(msg, ms = 2500) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), ms);
}

function fmtTime(ms) {
  const d = new Date(ms);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return sameDay ? time : `${d.toLocaleDateString([], { weekday: 'short' })} ${time}`;
}

// ------------------------------------------------------------ render

async function renderUpcoming() {
  const list = $('upcoming');
  const events = await meetwing.upcoming();
  list.textContent = '';
  if (!current.calendars.length) {
    list.innerHTML = '<li class="empty">Add a calendar below and your next meetings will show up here.</li>';
    return;
  }
  if (!events.length) {
    list.innerHTML = '<li class="empty">No meetings in the next 24 hours. Enjoy the quiet.</li>';
    return;
  }
  const now = Date.now();
  for (const e of events) {
    const li = document.createElement('li');
    const when = document.createElement('div');
    when.className = 'when';
    when.textContent = e.start <= now ? 'Now' : MWScheduler.relativeTime(e.start - now).replace(/^in /, '');
    const what = document.createElement('div');
    what.className = 'what';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = e.title;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${fmtTime(e.start)} · ${e.source}`;
    what.append(title, meta);
    li.append(when, what);
    if (e.link) {
      const join = document.createElement('button');
      join.className = 'mini';
      join.textContent = 'Join';
      join.addEventListener('click', () => meetwing.openLink(e.link));
      li.append(join);
    }
    list.append(li);
  }
}

function renderCalendars() {
  const list = $('calendars');
  list.textContent = '';
  if (!current.calendars.length) {
    list.innerHTML = '<li class="empty">No calendars yet.</li>';
  }
  for (const c of current.calendars) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = c.name;
    const host = document.createElement('span');
    host.className = 'host';
    const err = current.calendarErrors.find((e) => e.id === c.id);
    host.textContent = err ? `Problem: ${err.error}` : c.host;
    if (err) host.style.color = 'var(--bad)';
    const rm = document.createElement('button');
    rm.className = 'mini';
    rm.textContent = 'Remove';
    rm.addEventListener('click', async () => {
      current = await meetwing.removeCalendar(c.id);
      render();
    });
    li.append(name, host, rm);
    list.append(li);
  }
}

function render() {
  $('state').textContent = current.resting ? 'Resting' : 'Active';
  $('state').classList.toggle('rest', current.resting);
  $('leads').value = current.reminders.leadMinutes.join(', ');
  $('atStart').checked = current.reminders.atStart;
  $('seconds').value = current.flight.seconds;
  $('secondsVal').textContent = `${current.flight.seconds} s`;
  $('size').value = current.flight.size;
  $('sizeVal').textContent = `${Math.round(current.flight.size * 100)}%`;
  $('direction').value = current.flight.direction;
  $('display').value = current.flight.display;
  $('sound').checked = current.flight.sound;
  $('launchAtLogin').checked = current.general.launchAtLogin;
  $('ver').textContent = `v${current.version}`;
  renderCalendars();
  renderUpcoming();
}

async function reload() {
  current = await meetwing.getSettings();
  render();
}

// ------------------------------------------------------------ actions

let saveTimer;
function save(patch) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    current = await meetwing.setSettings(patch());
    render();
  }, 250);
}

$('leads').addEventListener('change', () =>
  save(() => ({
    reminders: {
      leadMinutes: $('leads').value.split(/[,\s]+/).filter(Boolean).map(Number).filter((n) => Number.isFinite(n)),
    },
  }))
);
$('atStart').addEventListener('change', () => save(() => ({ reminders: { atStart: $('atStart').checked } })));
$('seconds').addEventListener('input', () => ($('secondsVal').textContent = `${$('seconds').value} s`));
$('seconds').addEventListener('change', () => save(() => ({ flight: { seconds: Number($('seconds').value) } })));
$('size').addEventListener('input', () => ($('sizeVal').textContent = `${Math.round($('size').value * 100)}%`));
$('size').addEventListener('change', () => save(() => ({ flight: { size: Number($('size').value) } })));
$('direction').addEventListener('change', () => save(() => ({ flight: { direction: $('direction').value } })));
$('display').addEventListener('change', () => save(() => ({ flight: { display: $('display').value } })));
$('sound').addEventListener('change', () => save(() => ({ flight: { sound: $('sound').checked } })));
$('launchAtLogin').addEventListener('change', () => save(() => ({ general: { launchAtLogin: $('launchAtLogin').checked } })));

$('btn-test').addEventListener('click', () => meetwing.testFlight());
$('btn-nudge').addEventListener('click', () => meetwing.nudge());
$('btn-refresh').addEventListener('click', async () => {
  current = await meetwing.refreshCalendars();
  render();
  toast('Calendars refreshed');
});
$('rest').addEventListener('change', async () => {
  const mode = $('rest').value;
  $('rest').value = '';
  if (!mode) return;
  current = await meetwing.setRest(mode);
  render();
  toast(mode === 'off' ? 'Reminders resumed' : 'Resting. No flights until then.');
});

$('add-cal').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const msg = $('add-msg');
  const btn = form.querySelector('button');
  btn.disabled = true;
  btn.textContent = 'Checking…';
  msg.className = 'msg';
  msg.textContent = '';
  const res = await meetwing.addCalendar({ name: form.name.value, url: form.url.value });
  btn.disabled = false;
  btn.textContent = 'Add';
  if (!res.ok) {
    msg.className = 'msg err';
    msg.textContent = res.error;
    return;
  }
  current = res.settings;
  form.reset();
  msg.className = 'msg ok';
  msg.textContent = `Added. Found ${res.found} meeting${res.found === 1 ? '' : 's'} in the next 7 days.`;
  render();
});

meetwing.onChanged(reload);
setInterval(() => current && renderUpcoming(), 30000);
reload();
