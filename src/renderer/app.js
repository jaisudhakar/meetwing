'use strict';
/* global MWMarkdown, MWPrompts, MWTranscript, MWAudio, meetwing */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
  settings: null,
  info: null,
  transcript: new MWTranscript.Transcript(),
  session: null,
  listening: false,
  recorders: [],
  pendingStt: 0,
  requestId: null,
  answerText: '',
  saveTimer: null,
};

// ---------------------------------------------------------------- helpers

function toast(msg, isError = false, ms = 3500) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('error', isError);
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), ms);
}

function setStatus(label, kind = 'idle') {
  const el = $('#status');
  el.textContent = label;
  el.dataset.state = kind;
}

function refreshStatus() {
  if (state.requestId) setStatus('Thinking…', 'busy');
  else if (state.listening) setStatus(state.pendingStt > 0 ? 'Transcribing…' : 'Listening', 'live');
  else setStatus('Idle', 'idle');
}

function fmtDate(ts) {
  return new Date(ts).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

// ---------------------------------------------------------------- tabs

function showTab(name) {
  $$('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $$('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${name}`));
  if (name === 'sessions') renderSessions();
  if (name === 'settings') populateSettings();
}
$$('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

// ---------------------------------------------------------------- session + transcript

function ensureSession() {
  if (!state.session) {
    state.session = { id: `s${Date.now()}`, title: '', startedAt: Date.now(), endedAt: 0, entries: [], answers: [], summary: '' };
  }
  return state.session;
}

function scheduleSave() {
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(saveSession, 2500);
}

async function saveSession() {
  const s = state.session;
  if (!s || (!state.transcript.entries.length && !s.answers.length)) return;
  s.entries = state.transcript.entries.map((e) => ({ ...e }));
  s.endedAt = Date.now();
  if (!s.title && s.entries.length) {
    const first = s.entries[0].text;
    s.title = first.length > 48 ? first.slice(0, 48).trim() + '…' : first;
  }
  await meetwing.sessions.save(s);
}

function renderTranscript() {
  const box = $('#transcript');
  const stick = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  box.textContent = '';
  if (!state.transcript.entries.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = state.listening
      ? 'Listening… transcript will appear here.'
      : 'Press Listen to start transcribing the meeting audio and your microphone.';
    box.appendChild(p);
    return;
  }
  for (const e of state.transcript.entries) {
    const p = document.createElement('p');
    p.className = `line ${e.speaker}`;
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = e.speaker === 'me' ? 'You' : 'Them';
    p.append(who, document.createTextNode(e.text));
    box.appendChild(p);
  }
  if (stick) box.scrollTop = box.scrollHeight;
}

function newSession() {
  if (state.requestId) meetwing.cancel(state.requestId);
  saveSession();
  state.session = null;
  state.transcript.clear();
  renderTranscript();
  renderAnswer('', true);
  toast('Started a new session');
}

// ---------------------------------------------------------------- listening

async function startListening() {
  if (state.listening) return;
  const { audio } = state.settings;
  if (!audio.captureMic && !audio.captureSystem) {
    toast('Enable microphone or meeting audio in Settings first.', true);
    return;
  }
  const chunkMs = audio.chunkSeconds * 1000;
  const recorders = [];

  try {
    if (audio.captureMic) {
      if (!(await meetwing.askMic())) throw new Error('Microphone permission was denied.');
      try {
        const stream = await MWAudio.openMic(audio.micDeviceId);
        recorders.push(makeRecorder(stream, 'me', chunkMs, '#meter-me'));
      } catch (err) {
        toast(`Microphone unavailable: ${err.message}`, true);
      }
    }
    if (audio.captureSystem) {
      try {
        const stream = await MWAudio.openSystemAudio();
        recorders.push(makeRecorder(stream, 'them', chunkMs, '#meter-them'));
      } catch (err) {
        const hint =
          state.info && state.info.platform === 'darwin'
            ? ' On macOS use a virtual device such as BlackHole as the microphone to capture call audio.'
            : state.info && state.info.platform === 'linux'
              ? ' On Linux, select a "Monitor of …" input as the microphone to capture call audio.'
              : '';
        toast(`Meeting audio capture unavailable (${err.message}).${hint}`, true, 8000);
      }
    }
  } catch (err) {
    toast(err.message, true);
  }

  if (!recorders.length) {
    refreshStatus();
    return;
  }
  ensureSession();
  state.recorders = recorders;
  recorders.forEach((r) => r.start());
  state.listening = true;
  $('#btn-listen').textContent = 'Stop';
  $('#btn-listen').classList.add('live');
  renderTranscript();
  refreshStatus();
}

function makeRecorder(stream, speaker, chunkMs, meterSel) {
  const meter = $(meterSel);
  return new MWAudio.ChunkRecorder(stream, {
    chunkMs,
    onLevel: (lvl) => meter.style.setProperty('--lvl', `${Math.round(lvl * 100)}%`),
    onChunk: async (blob) => {
      state.pendingStt++;
      refreshStatus();
      try {
        const audio = await blob.arrayBuffer();
        const res = await meetwing.transcribe({ audio, mime: blob.type });
        if (!res.ok) {
          toast(res.error, true, 6000);
          return;
        }
        const entry = state.transcript.add(speaker, res.text);
        if (entry) {
          renderTranscript();
          scheduleSave();
        }
      } finally {
        state.pendingStt--;
        refreshStatus();
      }
    },
  });
}

function stopListening() {
  state.recorders.forEach((r) => r.stop());
  state.recorders = [];
  state.listening = false;
  $('#btn-listen').textContent = 'Listen';
  $('#btn-listen').classList.remove('live');
  $$('.meter i').forEach((i) => i.style.setProperty('--lvl', '0%'));
  renderTranscript();
  refreshStatus();
  saveSession();
}

$('#btn-listen').addEventListener('click', () => (state.listening ? stopListening() : startListening()));

// ---------------------------------------------------------------- AI

function renderAnswer(text, empty = false) {
  const el = $('#answer');
  if (empty || !text) {
    el.innerHTML = '<p class="empty">Ask anything, or use a quick action below.</p>';
    return;
  }
  el.innerHTML = MWMarkdown.render(text);
}

let renderQueued = false;
function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderAnswer(state.answerText);
    const el = $('#answer');
    el.scrollTop = el.scrollHeight;
  });
}

function setBusy(busy) {
  $('#btn-stop').classList.toggle('hidden', !busy);
  refreshStatus();
}

async function runAsk({ question = '', kind = 'ask', withScreen = false, transcript } = {}) {
  if (state.requestId) await meetwing.cancel(state.requestId);
  const requestId = `r${Date.now()}`;
  let image = null;

  if (withScreen) {
    setStatus('Capturing…', 'busy');
    const cap = await meetwing.captureScreen();
    if (!cap.ok) {
      toast(cap.error, true, 6000);
      refreshStatus();
      return;
    }
    image = cap.image;
  }

  state.requestId = requestId;
  state.answerText = '';
  state.currentQuestion = question || (kind === 'summary' ? 'Meeting notes' : 'Answer');
  state.currentKind = kind;
  renderAnswer('');
  $('#answer').innerHTML = '<p class="empty">Thinking…</p>';
  setBusy(true);

  await meetwing.ask({
    requestId,
    kind,
    question,
    image,
    transcript: transcript !== undefined ? transcript : state.transcript.recent(8000),
  });
}

meetwing.onChunk(({ requestId, token }) => {
  if (requestId !== state.requestId) return;
  state.answerText += token;
  queueRender();
});

meetwing.onDone(({ requestId, text, cancelled }) => {
  if (requestId !== state.requestId) return;
  state.requestId = null;
  setBusy(false);
  if (cancelled) return;
  state.answerText = text || state.answerText;
  renderAnswer(state.answerText);
  const s = ensureSession();
  if (state.currentKind === 'summary') s.summary = state.answerText;
  else s.answers.push({ question: state.currentQuestion, answer: state.answerText, ts: Date.now() });
  scheduleSave();
});

meetwing.onError(({ requestId, error }) => {
  if (requestId !== state.requestId) return;
  state.requestId = null;
  setBusy(false);
  setStatus('Error', 'error');
  $('#answer').innerHTML = '<p class="empty">Something went wrong.</p>';
  toast(error, true, 8000);
  setTimeout(refreshStatus, 4000);
});

$('#btn-stop').addEventListener('click', () => state.requestId && meetwing.cancel(state.requestId));

$('#btn-copy').addEventListener('click', async () => {
  if (!state.answerText) return;
  try {
    await navigator.clipboard.writeText(state.answerText);
    toast('Copied');
  } catch {
    toast('Could not access the clipboard', true);
  }
});

$$('.chip[data-action]').forEach((chip) =>
  chip.addEventListener('click', () => {
    const action = chip.dataset.action;
    if (action === 'summary') runAsk({ kind: 'summary', question: 'Meeting notes' });
    else runAsk({ question: MWPrompts.QUICK_ACTIONS[action] });
  })
);
$('#btn-new').addEventListener('click', newSession);

$('#ask-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#ask-input');
  runAsk({ question: input.value.trim() });
  input.value = '';
});

$('#btn-screen').addEventListener('click', () => askAboutScreen());
function askAboutScreen() {
  const input = $('#ask-input');
  const q = input.value.trim() || 'Look at my screen and help me with what is on it.';
  input.value = '';
  runAsk({ question: q, withScreen: true });
}

// ---------------------------------------------------------------- sessions tab

async function renderSessions() {
  $('#session-detail').classList.add('hidden');
  const list = $('#sessions-list');
  list.classList.remove('hidden');
  const items = await meetwing.sessions.list();
  list.textContent = '';
  if (!items.length) {
    list.innerHTML = '<p class="empty">No saved sessions yet. Sessions are saved automatically while you listen.</p>';
    return;
  }
  for (const s of items) {
    const row = document.createElement('div');
    row.className = 'session-item';
    row.innerHTML = '<div><div class="t"></div><div class="meta"></div></div>';
    row.querySelector('.t').textContent = s.title;
    row.querySelector('.meta').textContent = `${fmtDate(s.startedAt)} · ${s.entryCount} lines${s.hasSummary ? ' · notes' : ''}`;
    row.addEventListener('click', () => openSession(s.id));
    list.appendChild(row);
  }
}

async function openSession(id) {
  const s = await meetwing.sessions.read(id);
  if (!s) return renderSessions();
  $('#sessions-list').classList.add('hidden');
  const box = $('#session-detail');
  box.classList.remove('hidden');
  box.textContent = '';

  const bar = document.createElement('div');
  bar.className = 'toolbar';
  const mk = (label, fn) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', fn);
    bar.appendChild(b);
    return b;
  };
  mk('← Back', renderSessions);
  mk('Export .md', async () => {
    const r = await meetwing.sessions.exportMd(id);
    if (r.ok) toast(`Saved to ${r.path}`);
    else if (!r.cancelled) toast(r.error, true);
  });
  mk('Load into Live', () => {
    state.session = s;
    state.transcript.clear();
    s.entries.forEach((e) => state.transcript.add(e.speaker, e.text, e.ts));
    renderTranscript();
    renderAnswer(s.summary || '', !s.summary);
    state.answerText = s.summary || '';
    showTab('live');
  });
  mk('Delete', async () => {
    await meetwing.sessions.remove(id);
    renderSessions();
  });
  box.appendChild(bar);

  const h = document.createElement('h3');
  h.textContent = s.title || 'Meeting';
  box.appendChild(h);
  if (s.summary) {
    const div = document.createElement('div');
    div.className = 'md';
    div.innerHTML = MWMarkdown.render(s.summary);
    box.appendChild(div);
  }
  const tr = document.createElement('div');
  for (const e of s.entries || []) {
    const p = document.createElement('p');
    p.className = `line ${e.speaker}`;
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = e.speaker === 'me' ? 'You' : 'Them';
    p.append(who, document.createTextNode(e.text));
    tr.appendChild(p);
  }
  box.appendChild(tr);
}

// ---------------------------------------------------------------- settings tab

const form = $('#settings-form');
const f = (name) => form.elements[name];

async function populateSettings() {
  const s = (state.settings = await meetwing.getSettings());
  const preset = s.presets[s.ai.provider] || {};
  f('provider').value = s.ai.provider;
  f('model').value = s.ai.model;
  f('model').placeholder = preset.model || '';
  f('baseUrl').value = s.ai.baseUrl;
  f('baseUrl').placeholder = preset.baseUrl || '';
  f('aiApiKey').value = '';
  $('#ai-key-state').textContent = s.hasAiKey ? '(saved)' : '(not set)';
  f('sttBaseUrl').value = s.stt.baseUrl;
  f('sttModel').value = s.stt.model;
  f('sttLanguage').value = s.stt.language;
  f('sttApiKey').value = '';
  $('#stt-key-state').textContent = s.hasSttKey ? '(saved)' : '(not set)';
  f('captureSystem').checked = s.audio.captureSystem;
  f('captureMic').checked = s.audio.captureMic;
  f('chunkSeconds').value = s.audio.chunkSeconds;
  f('mode').innerHTML = '';
  for (const [key, m] of Object.entries(MWPrompts.MODES)) f('mode').add(new Option(m.label, key));
  f('mode').value = s.mode;
  f('customInstructions').value = s.customInstructions;
  f('opacity').value = s.ui.opacity;
  f('stealth').checked = s.ui.stealth;
  f('alwaysOnTop').checked = s.ui.alwaysOnTop;

  const mic = f('micDeviceId');
  mic.innerHTML = '';
  mic.add(new Option('System default', 'default'));
  try {
    for (const d of await MWAudio.listMics()) {
      if (d.deviceId && d.deviceId !== 'default') mic.add(new Option(d.label || `Microphone ${mic.length}`, d.deviceId));
    }
  } catch {
    /* labels need permission; the default entry is enough */
  }
  mic.value = [...mic.options].some((o) => o.value === s.audio.micDeviceId) ? s.audio.micDeviceId : 'default';

  $('#stealth-note').textContent = state.info && !state.info.protection ? '(not supported on Linux)' : '';
  $('#app-version').textContent = state.info ? `Meetwing v${state.info.version} · ${state.info.platform}` : '';
}

f('provider').addEventListener('change', () => {
  const preset = state.settings.presets[f('provider').value] || {};
  f('model').value = '';
  f('model').placeholder = preset.model || '';
  f('baseUrl').value = '';
  f('baseUrl').placeholder = preset.baseUrl || '';
});

f('opacity').addEventListener('input', () => meetwing.setSettings({ ui: { opacity: Number(f('opacity').value) } }));

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const patch = {
    mode: f('mode').value,
    customInstructions: f('customInstructions').value,
    ai: { provider: f('provider').value, model: f('model').value.trim(), baseUrl: f('baseUrl').value.trim() },
    stt: { baseUrl: f('sttBaseUrl').value.trim(), model: f('sttModel').value.trim(), language: f('sttLanguage').value.trim() },
    audio: {
      micDeviceId: f('micDeviceId').value,
      captureMic: f('captureMic').checked,
      captureSystem: f('captureSystem').checked,
      chunkSeconds: Number(f('chunkSeconds').value),
    },
    ui: { opacity: Number(f('opacity').value), stealth: f('stealth').checked, alwaysOnTop: f('alwaysOnTop').checked },
    aiApiKey: f('aiApiKey').value,
    sttApiKey: f('sttApiKey').value,
  };
  state.settings = await meetwing.setSettings(patch);
  $('#settings-msg').textContent = 'Saved';
  setTimeout(() => ($('#settings-msg').textContent = ''), 2000);
  populateSettings();
});

// ---------------------------------------------------------------- window + shortcuts

$('#btn-hide').addEventListener('click', () => meetwing.hide());
$('#btn-quit').addEventListener('click', () => meetwing.quit());

meetwing.onShortcut((name) => {
  if (name === 'ask') {
    const input = $('#ask-input');
    runAsk({ question: input.value.trim() });
    input.value = '';
  } else if (name === 'screenshot') askAboutScreen();
  else if (name === 'listen') $('#btn-listen').click();
  else if (name === 'settings') showTab('settings');
});

meetwing.onClickThrough((on) => $('#clickthrough-badge').classList.toggle('hidden', !on));

window.addEventListener('beforeunload', () => {
  state.recorders.forEach((r) => r.stop());
});

// ---------------------------------------------------------------- boot

(async function init() {
  [state.settings, state.info] = await Promise.all([meetwing.getSettings(), meetwing.appInfo()]);
  document.title = `Meetwing ${state.info.version}`;
  if (!state.settings.hasAiKey && state.settings.ai.provider !== 'ollama') {
    toast('Welcome! Add an API key in Settings to get started.', false, 6000);
  }
})();
