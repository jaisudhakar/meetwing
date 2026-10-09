'use strict';
/* global overlay */
// Animates one flight: the jet glides in, hovers so the card can be read, then leaves.

const $ = (id) => document.getElementById(id);

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t) => t * t * t;

function whoosh(ctx, when, duration) {
  const len = Math.floor(ctx.sampleRate * duration);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 0.8;
  filter.frequency.setValueAtTime(300, when);
  filter.frequency.exponentialRampToValueAtTime(1800, when + duration * 0.45);
  filter.frequency.exponentialRampToValueAtTime(350, when + duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(0.09, when + duration * 0.4);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(when);
}

function fly(p) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const plane = $('plane');
  const trail = $('trail');
  const card = $('card');
  const jet = $('jet');

  $('card-label').textContent = p.label;
  $('card-title').textContent = p.title;
  $('card-source').textContent = p.source;

  const planeW = Math.round(300 * p.size);
  const planeH = Math.round(planeW * (110 / 320));
  plane.style.width = `${planeW}px`;
  trail.style.width = `${Math.round(240 * p.size)}px`;
  const rtl = p.direction === 'rtl';
  jet.style.transform = rtl ? 'scaleX(-1)' : 'none';

  const baseY = (p.workTop || 0) + Math.max(70, H * 0.2);
  const x0 = rtl ? W + 40 : -planeW - 60; // start
  const x1 = rtl ? -planeW - 60 : W + 40; // end
  const xc = (W - planeW) / 2 + (rtl ? -1 : 1) * Math.min(80, W * 0.04); // cruise position
  const total = p.seconds * 1000;
  const tIn = 0.27;
  const tOut = 0.27;

  let audio = null;
  if (p.sound) {
    try {
      audio = new AudioContext();
      whoosh(audio, audio.currentTime + 0.05, 2.2);
      whoosh(audio, audio.currentTime + (total * (1 - tOut)) / 1000, 2.0);
    } catch {
      audio = null;
    }
  }

  const start = performance.now();
  function frame(now) {
    const t = (now - start) / total;
    if (t >= 1) {
      if (audio) audio.close().catch(() => {});
      overlay.done();
      return;
    }

    let x;
    let speed; // 0..1, drives the trail
    if (t < tIn) {
      const k = easeOutCubic(t / tIn);
      x = x0 + (xc - x0) * k;
      speed = 1 - k * 0.85;
    } else if (t > 1 - tOut) {
      const k = easeInCubic((t - (1 - tOut)) / tOut);
      x = xc + (x1 - xc) * k;
      speed = 0.15 + k * 0.85;
    } else {
      const k = (t - tIn) / (1 - tIn - tOut);
      x = xc + (rtl ? -1 : 1) * k * 36; // slow drift while hovering
      speed = 0.15;
    }

    const sec = (now - start) / 1000;
    const bob = Math.sin(sec * 2.1) * 6 * p.size;
    const pitch = Math.sin(sec * 1.4) * 0.8 + (t < tIn ? -2.2 * (1 - easeOutCubic(t / tIn)) : 0);
    const y = baseY + bob;

    plane.style.opacity = '1';
    plane.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${pitch * (rtl ? -1 : 1)}deg)`;

    // trail streams behind the tail
    const trailW = parseFloat(trail.style.width);
    const tailX = rtl ? x + planeW - 8 : x + 8;
    trail.style.opacity = String(0.15 + speed * 0.85);
    trail.style.transform = rtl
      ? `translate3d(${tailX}px, ${y + planeH * 0.42}px, 0) scaleX(-1)`
      : `translate3d(${tailX - trailW}px, ${y + planeH * 0.42}px, 0)`;

    // the card hangs under the fuselage and swings a little
    const cw = card.offsetWidth;
    const hangX = x + planeW * (rtl ? 0.55 : 0.45) - cw / 2;
    const swing = Math.sin(sec * 1.9) * 2.4 + (rtl ? 1 : -1) * speed * 6;
    const cardFade = Math.min(1, t / 0.08, (1 - t) / 0.08);
    card.style.opacity = String(Math.max(0, cardFade));
    card.style.transform = `translate3d(${hangX}px, ${y + planeH + 30 + bob * 0.4}px, 0) rotate(${swing}deg)`;

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

overlay.onFly(fly);
