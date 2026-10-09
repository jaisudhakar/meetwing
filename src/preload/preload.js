'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

function subscribe(channel, cb) {
  const listener = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('meetwing', {
  getSettings: invoke('settings:get'),
  setSettings: invoke('settings:set'),
  appInfo: invoke('app:info'),
  askMic: invoke('perm:mic'),
  hasScreenPermission: invoke('perm:screen'),
  transcribe: invoke('stt:transcribe'),
  captureScreen: invoke('screen:capture'),
  ask: invoke('ai:ask'),
  cancel: invoke('ai:cancel'),
  sessions: {
    save: invoke('sessions:save'),
    list: invoke('sessions:list'),
    read: invoke('sessions:read'),
    remove: invoke('sessions:delete'),
    exportMd: invoke('sessions:export'),
  },
  hide: invoke('window:hide'),
  quit: invoke('window:quit'),
  setClickThrough: invoke('window:clickthrough'),
  onChunk: (cb) => subscribe('ai:chunk', cb),
  onDone: (cb) => subscribe('ai:done', cb),
  onError: (cb) => subscribe('ai:error', cb),
  onShortcut: (cb) => subscribe('shortcut', cb),
  onClickThrough: (cb) => subscribe('window:clickthrough', cb),
});
