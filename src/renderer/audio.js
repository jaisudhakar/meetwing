'use strict';
// Audio capture: turns a MediaStream into self-contained audio chunks.
// Each chunk is a complete file (the recorder is restarted per chunk) so it can be
// sent to a speech-to-text API on its own. Near-silent chunks are dropped.

(function (root) {
  const SILENCE_RMS = 0.008; // ~ -42 dBFS

  function pickMime() {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    return candidates.find((m) => root.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
  }

  class ChunkRecorder {
    constructor(stream, { chunkMs, onChunk, onLevel }) {
      this.stream = stream;
      this.chunkMs = chunkMs;
      this.onChunk = onChunk;
      this.onLevel = onLevel || (() => {});
      this.mime = pickMime();
      this.running = false;
      this._peak = 0;
    }

    start() {
      this.running = true;
      this._startMeter();
      this._cycle();
    }

    stop() {
      this.running = false;
      clearTimeout(this._timer);
      clearInterval(this._meterTimer);
      if (this._rec && this._rec.state !== 'inactive') this._rec.stop();
      if (this._ctx) this._ctx.close().catch(() => {});
      this.stream.getTracks().forEach((t) => t.stop());
      this.onLevel(0);
    }

    _startMeter() {
      const ctx = new AudioContext();
      this._ctx = ctx;
      const src = ctx.createMediaStreamSource(this.stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      this._meterTimer = setInterval(() => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        this._peak = Math.max(this._peak, rms);
        this.onLevel(Math.min(1, rms * 6));
      }, 100);
    }

    _cycle() {
      if (!this.running) return;
      const parts = [];
      this._peak = 0;
      const rec = new MediaRecorder(this.stream, this.mime ? { mimeType: this.mime } : undefined);
      this._rec = rec;
      rec.ondataavailable = (e) => e.data && e.data.size && parts.push(e.data);
      rec.onstop = async () => {
        const loud = this._peak >= SILENCE_RMS;
        if (loud && parts.length) {
          const blob = new Blob(parts, { type: rec.mimeType || this.mime || 'audio/webm' });
          try {
            await this.onChunk(blob);
          } catch (err) {
            console.error('chunk handler failed', err);
          }
        }
        this._cycle();
      };
      rec.start();
      this._timer = setTimeout(() => rec.state !== 'inactive' && rec.stop(), this.chunkMs);
    }
  }

  async function openMic(deviceId) {
    const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    if (deviceId && deviceId !== 'default') audio.deviceId = { exact: deviceId };
    return navigator.mediaDevices.getUserMedia({ audio });
  }

  /** System / meeting audio via loopback. Throws if the platform gives no audio track. */
  async function openSystemAudio() {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    stream.getVideoTracks().forEach((t) => {
      t.stop();
      stream.removeTrack(t);
    });
    if (!stream.getAudioTracks().length) {
      throw new Error('This system did not provide an audio loopback track.');
    }
    return stream;
  }

  async function listMics() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'audioinput');
  }

  root.MWAudio = { ChunkRecorder, openMic, openSystemAudio, listMics };
})(typeof self !== 'undefined' ? self : this);
