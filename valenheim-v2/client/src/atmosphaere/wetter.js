// Wetter: klar, bewölkt, Regen, Nebel, Gewitter – für alle Spieler gleich (aus der Uhrzeit berechnet).
// Dazu Geräusche (Wind, Regen, Donner) über WebAudio – ohne Dateien, nur wenn Ton an ist.
import * as THREE from 'three';
import { TAG_SEKUNDEN } from './tageszeit.js';

const ARTEN = { klar: { regen: 0, nebel: 1, dunkel: 0 }, bewoelkt: { regen: 0, nebel: 1.4, dunkel: 0.15 }, regen: { regen: 1, nebel: 2.2, dunkel: 0.35 }, nebel: { regen: 0, nebel: 6, dunkel: 0.2 }, gewitter: { regen: 1, nebel: 2.6, dunkel: 0.5, blitz: true } };
export const WETTER_NAME = { klar: 'Klar', bewoelkt: 'Bewölkt', regen: 'Regen', nebel: 'Nebel', gewitter: 'Gewitter' };
// Wetter wechselt alle 10 Minuten nach einem festen Muster
export function wetterJetzt(now = Date.now()) {
  const abschnitt = Math.floor(now / 1000 / (TAG_SEKUNDEN / 4)); const x = Math.sin(abschnitt * 12.9898) * 43758.5453; const r = x - Math.floor(x);
  return r < 0.5 ? 'klar' : r < 0.68 ? 'bewoelkt' : r < 0.86 ? 'regen' : r < 0.95 ? 'nebel' : 'gewitter';
}

class Ton {
  constructor() { this.an = false; this.ctx = null; }
  aktiv(an) { this.an = an; if (!an && this.ctx) this.master.gain.value = 0; if (an && this.ctx) this.master.gain.value = 0.5; }
  start() {
    if (this.ctx || !this.an) return; try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    const c = this.ctx; this.master = c.createGain(); this.master.gain.value = 0.5; this.master.connect(c.destination);
    const noise = (len, fn) => { const b = c.createBuffer(1, c.sampleRate * len, c.sampleRate); const d = b.getChannelData(0); let s = 0; for (let i = 0; i < d.length; i++) d[i] = fn(Math.random() * 2 - 1, (v) => (s = v), s); return b; };
    const loop = (buf, type, f, g) => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; const gn = c.createGain(); gn.gain.value = g; s.connect(fl).connect(gn).connect(this.master); s.start(); return gn; };
    this.wind = loop(noise(3, (w, set, s) => set(0.985 * s + 0.015 * w) * 4), 'lowpass', 600, 0.12);
    this.regen = loop(noise(2, (w) => w), 'highpass', 1400, 0);
    this.donnerBuf = noise(3, (w, set, s) => set(0.995 * s + 0.005 * w) * 9);
  }
  update(regen, nacht) { if (!this.ctx) return; const t = this.ctx.currentTime; this.regen.gain.setTargetAtTime(regen * 0.22, t, 0.6); this.wind.gain.setTargetAtTime(0.08 + nacht * 0.04 + regen * 0.06, t, 1); }
  donner() { if (!this.ctx) return; const c = this.ctx; const s = c.createBufferSource(); s.buffer = this.donnerBuf; const g = c.createGain(); const t = c.currentTime + 0.6 + Math.random() * 1.5; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.9, t + 0.08); g.gain.exponentialRampToValueAtTime(0.001, t + 2.8); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300; s.connect(f).connect(g).connect(this.master); s.start(t); s.stop(t + 3); }
  resume() { this.start(); if (this.ctx?.state === 'suspended') this.ctx.resume(); }
  dispose() { try { this.ctx?.close(); } catch { /* egal */ } }
}

export class Wetter {
  constructor(scene, renderer, { ton = true } = {}) {
    this.scene = scene; this.r = renderer; this.art = wetterJetzt(); this.k = { regen: 0, nebel: 1, dunkel: 0 }; this.blitz = 0;
    const N = 2400; const pos = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) { const x = (Math.random() - 0.5) * 60, y = Math.random() * 30, z = (Math.random() - 0.5) * 60; pos.set([x, y, z, x + 0.04, y - 0.8, z], i * 6); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.regen = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xaab8c8, transparent: true, opacity: 0, depthWrite: false })); this.regen.frustumCulled = false; scene.add(this.regen);
    this.ton = new Ton(); this.ton.aktiv(ton);
  }
  update(dt, cam, basisNebel, nacht) {
    this.art = wetterJetzt(); const z = ARTEN[this.art]; const f = Math.min(1, dt * 0.25);
    for (const k of ['regen', 'nebel', 'dunkel']) this.k[k] += ((z[k] ?? 0) - this.k[k]) * f;
    if (this.scene.fog) this.scene.fog.density = basisNebel * this.k.nebel;
    this.r.toneMappingExposure *= 1 - this.k.dunkel * 0.45;
    // Blitze bei Gewitter
    if (z.blitz && Math.random() < dt * 0.12) { this.blitz = 1; this.ton.donner(); }
    if (this.blitz > 0) { this.r.toneMappingExposure *= 1 + this.blitz * 2.5; this.blitz = Math.max(0, this.blitz - dt * 5); }
    // Regen folgt der Kamera
    const sichtbar = this.k.regen > 0.03; this.regen.visible = sichtbar; this.regen.material.opacity = this.k.regen * 0.45;
    if (sichtbar) {
      this.regen.position.set(cam.x, cam.y - 15, cam.z); const a = this.regen.geometry.attributes.position; const arr = a.array; const fall = 24 * dt;
      for (let i = 0; i < arr.length; i += 6) { arr[i + 1] -= fall; arr[i + 4] -= fall; if (arr[i + 4] < 0) { arr[i + 1] += 30; arr[i + 4] += 30; } }
      a.needsUpdate = true;
    }
    this.ton.update(this.k.regen, nacht);
  }
  dispose() { this.ton.dispose(); }
}
