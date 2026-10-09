'use strict';
const path = require('path');
const fs = require('fs');
const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  ipcMain,
  screen,
  safeStorage,
  shell,
  nativeImage,
  powerMonitor,
} = require('electron');

const { SettingsStore } = require('./settings');
const { loadEvents, checkCalendar } = require('./calendar');
const { Scheduler, reminderLabel, relativeTime } = require('../shared/scheduler');

const ROOT = path.join(__dirname, '..', '..');
const ICON_PATH = path.join(ROOT, 'build', 'icon.png');
const IS_MAC = process.platform === 'darwin';
const IS_LINUX = process.platform === 'linux';
const IS_WIN = process.platform === 'win32';
const MIN = 60 * 1000;
const HORIZON_MS = 24 * 60 * MIN;
const TICK_MS = 15 * 1000;
const REFRESH_MS = 5 * MIN;

let settings;
let scheduler;
let tray = null;
let settingsWin = null;
let overlayWin = null;
let overlayTimer = null;
let flightQueue = [];
let flying = false;
let flightCount = 0;
let calendarErrors = [];
let lastTraySignature = '';

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
app.on('second-instance', () => openSettings());

// Click-through transparent windows need a compositing visual on some Linux setups.
if (IS_LINUX) app.commandLine.appendSwitch('enable-transparent-visuals');

// ------------------------------------------------------------------ flights

function pickDisplay() {
  if (settings.data.flight.display === 'primary') return screen.getPrimaryDisplay();
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

function enqueueFlight(payload) {
  flightQueue.push(payload);
  if (!flying) nextFlight();
}

function nextFlight() {
  const payload = flightQueue.shift();
  if (!payload) {
    flying = false;
    return;
  }
  flying = true;
  const f = settings.data.flight;
  const dir = f.direction === 'alternate' ? (flightCount++ % 2 ? 'rtl' : 'ltr') : f.direction;
  const display = pickDisplay();
  const b = display.bounds;

  const win = new BrowserWindow({
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    fullscreenable: false,
    show: false,
    alwaysOnTop: true,
    type: IS_MAC ? 'panel' : undefined,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(ROOT, 'src', 'preload', 'overlay-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  overlayWin = win;
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true); // the jet never steals clicks
  if (IS_MAC) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  const seconds = f.seconds;
  win.webContents.once('did-finish-load', () => {
    if (win.isDestroyed()) return;
    win.showInactive();
    win.webContents.send('fly', {
      label: payload.label,
      title: payload.title,
      source: payload.source,
      seconds,
      size: f.size,
      direction: dir,
      sound: f.sound,
      workTop: display.workArea.y - b.y,
    });
  });
  win.loadFile(path.join(ROOT, 'src', 'renderer', 'overlay.html'));

  // Safety net in case the renderer never reports back.
  clearTimeout(overlayTimer);
  overlayTimer = setTimeout(() => endFlight(win), (seconds + 6) * 1000);
}

function endFlight(win) {
  clearTimeout(overlayTimer);
  if (win && !win.isDestroyed()) win.destroy();
  if (overlayWin === win) overlayWin = null;
  setTimeout(nextFlight, 700);
}

ipcMain.on('overlay:done', (e) => {
  if (overlayWin && e.sender === overlayWin.webContents) endFlight(overlayWin);
});

function flightFor(ev, minutes) {
  return { label: reminderLabel(minutes), title: ev.title, source: ev.source, link: ev.link };
}

/** "Nudge": fly the next meeting's reminder right now. */
function nudge() {
  const now = Date.now();
  const ev = scheduler.next(now);
  if (!ev) {
    enqueueFlight({ label: 'All clear', title: 'Nothing coming up', source: 'Rest easy' });
    return;
  }
  const minutes = Math.max(0, Math.round((ev.start - now) / MIN));
  enqueueFlight(flightFor(ev, minutes));
}

function joinNext() {
  const ev = scheduler.next(Date.now());
  if (ev && ev.link) openLink(ev.link);
}

function openLink(url) {
  if (/^https?:\/\//i.test(String(url))) shell.openExternal(String(url));
}

// ------------------------------------------------------------------ calendars + ticking

async function refreshCalendars() {
  const now = Date.now();
  const { events, errors } = await loadEvents(settings.calendars, { fromMs: now - 60 * MIN, toMs: now + HORIZON_MS });
  calendarErrors = errors;
  scheduler.setEvents(events);
  updateTray();
  return { events, errors };
}

function tick() {
  const now = Date.now();
  const due = scheduler.due(now); // always consume, so reminders from a rest period do not replay
  if (!settings.isResting(now)) for (const d of due) enqueueFlight(flightFor(d.event, d.minutes));
  if (settings.data.restUntil > 0 && settings.data.restUntil <= now) {
    settings.setRestUntil(0);
    sendToSettings('settings:changed');
  }
  updateTray();
}

// ------------------------------------------------------------------ tray

function trayIcon() {
  let img = nativeImage.createFromPath(ICON_PATH);
  if (!img.isEmpty()) img = img.resize({ width: IS_MAC ? 18 : 22, height: IS_MAC ? 18 : 22 });
  return img;
}

function updateTray() {
  if (!tray) return;
  const now = Date.now();
  const next = scheduler.next(now);
  const resting = settings.isResting(now);
  const sig = JSON.stringify([next && next.uid, next && Math.round((next.start - now) / MIN), resting, calendarErrors.length, settings.calendars.length]);
  if (sig === lastTraySignature) return;
  lastTraySignature = sig;

  let header = 'No upcoming meetings';
  if (!settings.calendars.length) header = 'Add a calendar to get started';
  else if (next) header = `${next.title} - ${next.start <= now ? 'now' : relativeTime(next.start - now)}`;

  const rest = settings.data.restUntil;
  const menu = Menu.buildFromTemplate([
    { label: header, enabled: false },
    ...(calendarErrors.length ? [{ label: `Calendar problem: ${calendarErrors[0].name}`, enabled: false }] : []),
    ...(next && next.link ? [{ label: 'Join meeting', accelerator: 'CommandOrControl+Shift+J', click: joinNext }] : []),
    { type: 'separator' },
    { label: 'Nudge now', accelerator: 'CommandOrControl+Shift+N', click: nudge },
    resting
      ? { label: 'Resume reminders', click: () => setRest('off') }
      : {
          label: 'Rest',
          submenu: [
            { label: 'For 1 hour', click: () => setRest('1h') },
            { label: 'Until tomorrow', click: () => setRest('tomorrow') },
            { label: 'Until I turn it back on', click: () => setRest('forever') },
          ],
        },
    { type: 'separator' },
    { label: 'Settings…', click: openSettings },
    { label: 'Quit Meetwing', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(resting ? 'Meetwing - resting' : `Meetwing - ${header}`);
  if (IS_MAC) tray.setTitle(resting ? 'Zzz' : next && next.start > now && next.start - now < 60 * MIN ? relativeTime(next.start - now).replace('in ', '') : '');
}

function createTray() {
  try {
    tray = new Tray(trayIcon());
  } catch (err) {
    console.warn('Tray unavailable:', err.message);
    return;
  }
  tray.on('click', () => !IS_MAC && openSettings());
  updateTray();
}

function setRest(mode) {
  const now = new Date();
  let until = 0;
  if (mode === '1h') until = Date.now() + 60 * MIN;
  else if (mode === 'tomorrow') until = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 8, 0, 0).getTime();
  else if (mode === 'forever') until = -1;
  settings.setRestUntil(until);
  lastTraySignature = '';
  updateTray();
  sendToSettings('settings:changed');
}

// ------------------------------------------------------------------ settings window

function sendToSettings(channel) {
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send(channel);
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    if (settingsWin.isMinimized()) settingsWin.restore();
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 640,
    height: 760,
    minWidth: 520,
    minHeight: 520,
    title: 'Meetwing',
    icon: ICON_PATH,
    backgroundColor: '#0c1220',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(ROOT, 'src', 'preload', 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  settingsWin.once('ready-to-show', () => settingsWin.show());
  settingsWin.webContents.setWindowOpenHandler(({ url }) => {
    openLink(url);
    return { action: 'deny' };
  });
  settingsWin.webContents.on('will-navigate', (e) => e.preventDefault());
  settingsWin.on('closed', () => {
    settingsWin = null;
  });
  settingsWin.loadFile(path.join(ROOT, 'src', 'renderer', 'settings.html'));
}

function publicSettings() {
  return {
    ...settings.getPublic(),
    resting: settings.isResting(),
    version: app.getVersion(),
    platform: process.platform,
    calendarErrors,
  };
}

function applyLoginItem() {
  const enabled = !!settings.data.general.launchAtLogin;
  if (IS_MAC || IS_WIN) {
    app.setLoginItemSettings({ openAtLogin: enabled });
    return;
  }
  // Linux: XDG autostart entry
  const dir = path.join(app.getPath('home'), '.config', 'autostart');
  const file = path.join(dir, 'meetwing.desktop');
  try {
    if (!enabled) return void fs.rmSync(file, { force: true });
    const exec = process.env.APPIMAGE || process.execPath;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, `[Desktop Entry]\nType=Application\nName=Meetwing\nExec="${exec}"\nX-GNOME-Autostart-enabled=true\n`);
  } catch (err) {
    console.warn('Could not update autostart:', err.message);
  }
}

function applySettings() {
  scheduler.setLeads(settings.leads());
  applyLoginItem();
}

function setupIpc() {
  ipcMain.handle('settings:get', () => publicSettings());
  ipcMain.handle('settings:set', (_e, patch) => {
    settings.update(patch);
    applySettings();
    return publicSettings();
  });

  ipcMain.handle('calendar:add', async (_e, { name, url }) => {
    const now = Date.now();
    try {
      const res = await checkCalendar(url, name, { fromMs: now - 60 * MIN, toMs: now + 7 * 24 * 60 * MIN });
      settings.addCalendar({ name, url: res.url });
      await refreshCalendars();
      return { ok: true, found: res.events.length, settings: publicSettings() };
    } catch (err) {
      return { ok: false, error: err.name === 'TimeoutError' ? 'The calendar server took too long to answer.' : err.message };
    }
  });
  ipcMain.handle('calendar:remove', async (_e, id) => {
    settings.removeCalendar(id);
    await refreshCalendars();
    return publicSettings();
  });
  ipcMain.handle('calendar:refresh', async () => {
    await refreshCalendars();
    return publicSettings();
  });

  ipcMain.handle('events:upcoming', () => {
    const now = Date.now();
    return scheduler.events
      .filter((e) => e.end > now)
      .slice(0, 8)
      .map((e) => ({ uid: e.uid, title: e.title, start: e.start, source: e.source, link: e.link }));
  });

  ipcMain.handle('flight:test', () => {
    enqueueFlight({ label: 'Starting in 10 min', title: 'Product sync with the team', source: 'Google Calendar' });
    return true;
  });
  ipcMain.handle('nudge', () => nudge());
  ipcMain.handle('rest:set', (_e, mode) => {
    setRest(mode);
    return publicSettings();
  });
  ipcMain.handle('link:open', (_e, url) => openLink(url));
}

// ------------------------------------------------------------------ lifecycle

app.whenReady().then(async () => {
  const userData = app.getPath('userData');
  settings = new SettingsStore(userData, {
    available: () => safeStorage.isEncryptionAvailable(),
    encrypt: (s) => safeStorage.encryptString(s).toString('base64'),
    decrypt: (s) => safeStorage.decryptString(Buffer.from(s, 'base64')),
  });
  scheduler = new Scheduler({ leadMinutes: settings.leads() });

  if (IS_MAC && app.dock) app.dock.hide(); // menu-bar app
  if (!IS_MAC) Menu.setApplicationMenu(null);

  setupIpc();
  createTray();

  const reg = (accel, fn) => {
    try {
      if (!globalShortcut.register(accel, fn)) console.warn(`Shortcut unavailable: ${accel}`);
    } catch (err) {
      console.warn(`Shortcut failed: ${accel}`, err.message);
    }
  };
  reg('CommandOrControl+Shift+N', nudge);
  reg('CommandOrControl+Shift+J', joinNext);

  await refreshCalendars().catch((err) => console.warn('Calendar refresh failed:', err.message));
  setInterval(tick, TICK_MS);
  setInterval(() => refreshCalendars().catch(() => {}), REFRESH_MS);
  powerMonitor.on('resume', () => setTimeout(() => refreshCalendars().catch(() => {}), 3000));

  // First run (or no tray to click): show the settings window so people can add a calendar.
  if (!settings.calendars.length || !tray || process.argv.includes('--settings')) openSettings();

  app.on('activate', openSettings);
});

app.on('will-quit', () => globalShortcut.unregisterAll());
// Stay alive in the tray when every window is closed.
app.on('window-all-closed', () => {});
