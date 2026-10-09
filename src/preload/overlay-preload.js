'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlay', {
  onFly: (cb) => ipcRenderer.once('fly', (_e, payload) => cb(payload)),
  done: () => ipcRenderer.send('overlay:done'),
});
