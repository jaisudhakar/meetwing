'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('meetwing', {
  getSettings: invoke('settings:get'),
  setSettings: invoke('settings:set'),
  addCalendar: invoke('calendar:add'),
  removeCalendar: invoke('calendar:remove'),
  refreshCalendars: invoke('calendar:refresh'),
  addReminder: invoke('reminder:add'),
  removeReminder: invoke('reminder:remove'),
  upcoming: invoke('events:upcoming'),
  testFlight: invoke('flight:test'),
  nudge: invoke('nudge'),
  setRest: invoke('rest:set'),
  openLink: invoke('link:open'),
  onChanged: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('settings:changed', listener);
    return () => ipcRenderer.removeListener('settings:changed', listener);
  },
});
