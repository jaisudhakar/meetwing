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
  session,
  desktopCapturer,
  safeStorage,
  systemPreferences,
  dialog,
  nativeImage,
  shell,
} = require('electron');

const { SettingsStore } = require('./settings');
const { SessionStore, toMarkdown } = require('./sessions');
const { streamChat } = require('./ai');
const { transcribe } = require('./transcribe');
const { captureScreen } = require('./screen');
const prompts = require('../shared/prompts');

const ICON_PATH = path.join(__dirname, '..', '..', 'build', 'icon.png');
const IS_MAC = process.platform === 'darwin';
const IS_LINUX = process.platform === 'linux';

let win = null;
let tray = null;
let settings = null;
let sessions = null;
let clickThrough = false;
const inflight = new Map(); // requestId -> AbortController

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
app.on('second-instance', () => showWindow());

// Transparent windows need a compositing visual on some Linux setups.
if (IS_LINUX) app.commandLine.appendSwitch('enable-transparent-visuals');

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function createWindow() {
  win = new BrowserWindow({
    width: 560,
    height: 720,
    minWidth: 380,
    minHeight: 320,
    frame: false,
    transparent: true,
    hasShadow: false,
    show: false,
    title: 'Meetwing',
    icon: ICON_PATH,
    backgroundColor: '#00000000',
    alwaysOnTop: settings.data.ui.alwaysOnTop,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  applyWindowSettings();
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());

  // The renderer is a local page; never let it navigate or open new windows.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.on('closed', () => {
    win = null;
  });
}

function applyWindowSettings() {
  if (!win) return;
  const { stealth, alwaysOnTop, opacity } = settings.data.ui;
  // Hides the window from screen sharing / recording on macOS and Windows.
  win.setContentProtection(!!stealth);
  win.setAlwaysOnTop(!!alwaysOnTop, 'screen-saver');
  win.setOpacity(opacity);
  if (IS_MAC) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
}

function showWindow() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function toggleWindow() {
  if (!win) return createWindow();
  if (win.isVisible()) win.hide();
  else win.showInactive();
}

function setClickThrough(on) {
  clickThrough = on;
  if (win) win.setIgnoreMouseEvents(on, { forward: true });
  send('window:clickthrough', on);
}

function nudge(dx, dy) {
  if (!win) return;
  const b = win.getBounds();
  win.setBounds({ ...b, x: b.x + dx, y: b.y + dy });
}

function registerShortcuts() {
  const reg = (accel, fn) => {
    try {
      if (!globalShortcut.register(accel, fn)) console.warn(`Shortcut unavailable: ${accel}`);
    } catch (err) {
      console.warn(`Shortcut failed: ${accel}`, err.message);
    }
  };
  reg('CommandOrControl+Shift+Space', toggleWindow);
  reg('CommandOrControl+Enter', () => send('shortcut', 'ask'));
  reg('CommandOrControl+Shift+S', () => send('shortcut', 'screenshot'));
  reg('CommandOrControl+Shift+L', () => send('shortcut', 'listen'));
  reg('CommandOrControl+Shift+M', () => setClickThrough(!clickThrough));
  reg('CommandOrControl+Alt+Up', () => nudge(0, -40));
  reg('CommandOrControl+Alt+Down', () => nudge(0, 40));
  reg('CommandOrControl+Alt+Left', () => nudge(-40, 0));
  reg('CommandOrControl+Alt+Right', () => nudge(40, 0));
}

function createTray() {
  let img = nativeImage.createFromPath(ICON_PATH);
  if (!img.isEmpty()) img = img.resize({ width: 18, height: 18 });
  tray = new Tray(img);
  tray.setToolTip('Meetwing');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show / Hide', click: toggleWindow },
      { label: 'Settings', click: () => { showWindow(); send('shortcut', 'settings'); } },
      { type: 'separator' },
      { label: 'Quit Meetwing', click: () => app.quit() },
    ])
  );
  tray.on('click', toggleWindow);
}

function setupMediaHandlers() {
  const ses = session.defaultSession;
  const isOurs = (wc) => !!win && wc === win.webContents;

  ses.setPermissionRequestHandler((wc, permission, cb) => {
    cb(isOurs(wc) && ['media', 'display-capture'].includes(permission));
  });
  ses.setPermissionCheckHandler((wc, permission) => isOurs(wc) && ['media', 'display-capture'].includes(permission));

  // getDisplayMedia() in the renderer is how we capture the other side of the call
  // (system audio loopback). The video track is discarded by the renderer.
  ses.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } });
        if (!sources.length) return callback({});
        try {
          callback({ video: sources[0], audio: 'loopback' });
        } catch {
          callback({ video: sources[0] });
        }
      } catch {
        callback({});
      }
    },
    { useSystemPicker: false }
  );
}

function setupIpc() {
  ipcMain.handle('settings:get', () => settings.getPublic());
  ipcMain.handle('settings:set', (_e, patch) => {
    const pub = settings.update(patch);
    applyWindowSettings();
    return pub;
  });

  ipcMain.handle('perm:mic', async () => {
    if (IS_MAC) return systemPreferences.askForMediaAccess('microphone');
    return true;
  });
  ipcMain.handle('perm:screen', () => {
    if (IS_MAC) return systemPreferences.getMediaAccessStatus('screen') === 'granted';
    return true;
  });

  ipcMain.handle('stt:transcribe', async (_e, { audio, mime }) => {
    try {
      const text = await transcribe(settings.getStt(), Buffer.from(audio), mime);
      return { ok: true, text };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('screen:capture', async () => {
    // On Linux the compositor cannot exclude us from captures, so step aside.
    const hide = IS_LINUX && win && win.isVisible();
    try {
      if (hide) {
        win.hide();
        await new Promise((r) => setTimeout(r, 200));
      }
      return { ok: true, image: await captureScreen() };
    } catch (err) {
      return { ok: false, error: err.message };
    } finally {
      if (hide && win) win.showInactive();
    }
  });

  ipcMain.handle('ai:ask', (e, req) => {
    const { requestId, transcript, question, image, kind } = req;
    const cfg = settings.getAi();
    const ctrl = new AbortController();
    inflight.set(requestId, ctrl);

    const system =
      kind === 'summary'
        ? 'You are a precise meeting note taker. Output Markdown only.'
        : prompts.buildSystemPrompt(settings.data.mode, settings.data.customInstructions);
    const content =
      kind === 'summary'
        ? prompts.buildSummaryPrompt(transcript || '')
        : prompts.buildUserMessage({ transcript, question, hasScreenshot: !!image });

    streamChat(
      cfg,
      {
        system,
        messages: [{ role: 'user', content }],
        images: image ? [image] : [],
        maxTokens: kind === 'summary' ? 2048 : 1024,
      },
      (token) => e.sender.send('ai:chunk', { requestId, token }),
      ctrl.signal
    )
      .then((text) => e.sender.send('ai:done', { requestId, text }))
      .catch((err) => {
        if (ctrl.signal.aborted) e.sender.send('ai:done', { requestId, text: '', cancelled: true });
        else e.sender.send('ai:error', { requestId, error: err.message });
      })
      .finally(() => inflight.delete(requestId));
    return true;
  });

  ipcMain.handle('ai:cancel', (_e, requestId) => {
    const ctrl = inflight.get(requestId);
    if (ctrl) ctrl.abort();
    return !!ctrl;
  });

  ipcMain.handle('sessions:save', (_e, s) => sessions.save(s));
  ipcMain.handle('sessions:list', () => sessions.list());
  ipcMain.handle('sessions:read', (_e, id) => sessions.read(id));
  ipcMain.handle('sessions:delete', (_e, id) => sessions.delete(id));
  ipcMain.handle('sessions:export', async (_e, id) => {
    const s = sessions.read(id);
    if (!s) return { ok: false, error: 'Session not found.' };
    const safe = (s.title || 'meeting').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'meeting';
    const res = await dialog.showSaveDialog(win, {
      defaultPath: `${safe}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (res.canceled || !res.filePath) return { ok: false, cancelled: true };
    fs.writeFileSync(res.filePath, toMarkdown(s), 'utf8');
    return { ok: true, path: res.filePath };
  });

  ipcMain.handle('window:hide', () => win && win.hide());
  ipcMain.handle('window:quit', () => app.quit());
  ipcMain.handle('window:clickthrough', (_e, on) => setClickThrough(!!on));
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    protection: !IS_LINUX,
  }));
}

app.whenReady().then(() => {
  const userData = app.getPath('userData');
  settings = new SettingsStore(userData, {
    available: () => safeStorage.isEncryptionAvailable(),
    encrypt: (s) => safeStorage.encryptString(s).toString('base64'),
    decrypt: (s) => safeStorage.decryptString(Buffer.from(s, 'base64')),
  });
  sessions = new SessionStore(path.join(userData, 'sessions'));

  setupMediaHandlers();
  setupIpc();
  createWindow();
  createTray();
  registerShortcuts();

  app.on('activate', () => showWindow());
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => {
  if (!IS_MAC) app.quit();
});
