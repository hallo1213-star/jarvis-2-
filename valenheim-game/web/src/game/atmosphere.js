// Atmosphäre: Tag/Nacht (für alle Spieler gleich, an die Uhrzeit gekoppelt), Wetter, Stromausfall, Sirenen, Geräusche.
import * as THREE from 'three';

export const DAY_SECONDS = 24 * 60; // ein Valenheim-Tag dauert 24 echte Minuten

// Uhrzeit in Valenheim (0–24) aus der echten Zeit
export function valenheimTime(now = Date.now()) { return ((now / 1000) % DAY_SECONDS) / DAY_SECONDS * 24; }

export class Atmosphere {
  constructor(engine) {
    this.e = engine; this.weather = null; this.weatherK = 0; this.power = 1; this.powerOffUntil = 0; this.sirenUntil = 0;
    this.fogBase = engine.scene.fog.density;
    // Regen: Linien rund um die Kamera
    const N = 2600; const pos = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) { const x = (Math.random() - 0.5) * 60, y = Math.random() * 30, z = (Math.random() - 0.5) * 60; pos.set([x, y, z, x + 0.05, y - 0.7, z], i * 6); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xaab8c8, transparent: true, opacity: 0.0, depthWrite: false }));
    this.rain.frustumCulled = false; engine.scene.add(this.rain);
    this.moon = new THREE.DirectionalLight(0x8fa8ff, 0); engine.scene.add(this.moon);
    this.audio = new Sound(); engine.atmo = this;
    engine.addUpdater((dt, t) => this.update(dt, t));
  }

  event(ev) {
    const until = Date.now() + (ev.rest ?? ev.dauer) * 1000;
    if (ev.typ === 'regen' || ev.typ === 'nebel') { this.weather = { typ: ev.typ, until }; }
    if (ev.typ === 'klar') this.weather = null;
    if (ev.typ === 'stromausfall') this.powerOffUntil = until;
    if (ev.typ === 'sirene') { this.sirenUntil = until; this.audio.siren(ev.dauer); }
    if (ev.typ === 'meldung') this.audio.gong();
    if (ev.typ === 'radio') this.audio.blip();
  }

  update(dt, t) {
    const e = this.e; const now = Date.now();
    // --- Tageszeit ---
    const h = valenheimTime(now); // 0..24
    const sunAngle = ((h - 6) / 12) * Math.PI; // 6 Uhr Aufgang, 18 Uhr Untergang
    const elev = Math.sin(sunAngle); // -1..1
    const day = THREE.MathUtils.smoothstep(elev, -0.12, 0.25);
    const az = THREE.MathUtils.degToRad(90 + (h / 24) * 360);
    e.sunDir.set(Math.cos(az) * Math.cos(Math.asin(Math.max(-1, elev * 0.85))), Math.max(-0.2, elev * 0.85), Math.sin(az) * Math.cos(Math.asin(Math.max(-1, elev * 0.85)))).normalize();
    e.skyUniforms.sunPosition.value.copy(e.sunDir);
    // --- Wetter ---
    if (this.weather && now > this.weather.until) this.weather = null;
    const wTarget = this.weather ? 1 : 0; this.weatherK += (wTarget - this.weatherK) * Math.min(1, dt * 0.6);
    const raining = this.weather?.typ === 'regen' || (!this.weather && this.lastWeather === 'regen');
    if (this.weather) this.lastWeather = this.weather.typ;
    const wk = this.weatherK; this.rainK = raining ? wk : 0; const rainK = raining ? wk : 0; const fogK = (this.weather?.typ === 'nebel' || (!this.weather && this.lastWeather === 'nebel')) ? wk : 0;
    // --- Strom ---
    const powerOff = now < this.powerOffUntil; const flicker = powerOff ? (Math.random() < 0.04 ? 1 : 0) : 1;
    this.power += ((powerOff ? 0 : 1) - this.power) * Math.min(1, dt * 3);

    const dim = 1 - rainK * 0.45 - fogK * 0.3;
    e.sun.intensity = 2.1 * day * dim; e.sun.color.setHSL(0.09, 0.6 * (1 - day) + 0.2, 0.75 + day * 0.15);
    e.hemi.intensity = (0.08 + 0.34 * day) * (1 - rainK * 0.25);
    this.moon.intensity = (1 - day) * 0.35; this.moon.position.copy(e.sun.target.position).add(new THREE.Vector3(-80, 120, 60)); this.moon.target = e.sun.target;
    e.scene.environmentIntensity = 0.05 + 0.25 * day;
    e.renderer.toneMappingExposure = 0.6 + (1 - day) * 0.32;
    if (e.bloom) { e.bloom.strength = 0.1 + (1 - day) * 0.5; e.bloom.threshold = 0.92 - (1 - day) * 0.25; }
    e.skyUniforms.rayleigh.value = 1.6 + rainK * 2; e.skyUniforms.turbidity.value = 6 + rainK * 12;
    const fogCol = new THREE.Color().setHSL(0.6, 0.18 - rainK * 0.1, 0.07 + day * 0.56 * dim);
    e.scene.fog.color.copy(fogCol); e.scene.fog.density = this.fogBase * (1 + rainK * 1.2 + fogK * 5.5);
    // Nachtbeleuchtung (Fenster, Laternen) – fällt bei Stromausfall aus
    const lights = (1 - day) * this.power * flicker;
    for (let i = 0; i < 7; i++) { const m = e.city.materials['fac' + i]; if (m) m.emissiveIntensity = lights * 0.9; }
    if (e.city.props.lampHeadMat) e.city.props.lampHeadMat.emissiveIntensity = lights * 3.2;
    if (e.city.props.poolMat) e.city.props.poolMat.opacity = lights * 0.55;
    e.nightLights = lights; e.dayLight = day;
    if (e.clouds) e.clouds.material.uniforms.uCover.value = 0.45 - rainK * 0.35 - fogK * 0.1;
    // Regen folgt der Kamera
    this.rain.visible = rainK > 0.02; this.rain.material.opacity = rainK * 0.5;
    if (this.rain.visible) {
      this.rain.position.set(e.camera.position.x, e.camera.position.y - 15, e.camera.position.z);
      const a = this.rain.geometry.attributes.position; const arr = a.array; const fall = 24 * dt;
      for (let i = 0; i < arr.length; i += 6) { arr[i + 1] -= fall; arr[i + 4] -= fall; if (arr[i + 4] < 0) { arr[i + 1] += 30; arr[i + 4] += 30; } }
      a.needsUpdate = true;
    }
    this.audio.update({ rain: rainK, siren: now < this.sirenUntil, day });
    this.state = { uhr: h, nacht: day < 0.5, regen: rainK > 0.5, nebel: fogK > 0.5, strom: !powerOff, sirene: now < this.sirenUntil };
  }

  dispose() { this.audio.dispose(); this.e.scene.remove(this.rain); }
}

// Geräusche komplett mit WebAudio erzeugt (keine Dateien): Wind/Stadt, Regen, Sirene, Gong
class Sound {
  constructor() { this.enabled = (() => { try { return localStorage.getItem('vh_ton') !== 'aus'; } catch { return true; } })(); this.ctx = null; }
  ensure() {
    if (this.ctx || !this.enabled) return !!this.ctx;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return false; }
    const c = this.ctx; this.master = c.createGain(); this.master.gain.value = 0.6; this.master.connect(c.destination);
    const noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); const d = noise.getChannelData(0); let b = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = 0.98 * b + 0.02 * w; d[i] = b * 3 + w * 0.02; }
    const src = (filterType, freq, gain) => { const s = c.createBufferSource(); s.buffer = noise; s.loop = true; const f = c.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; const g = c.createGain(); g.gain.value = gain; s.connect(f).connect(g).connect(this.master); s.start(); return g; };
    this.wind = src('lowpass', 500, 0.18);
    const rn = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); const r = rn.getChannelData(0); for (let i = 0; i < r.length; i++) r[i] = Math.random() * 2 - 1;
    const rs = c.createBufferSource(); rs.buffer = rn; rs.loop = true; const rf = c.createBiquadFilter(); rf.type = 'highpass'; rf.frequency.value = 1200; this.rainGain = c.createGain(); this.rainGain.gain.value = 0; rs.connect(rf).connect(this.rainGain).connect(this.master); rs.start();
    return true;
  }
  setEnabled(on) { this.enabled = on; try { localStorage.setItem('vh_ton', on ? 'an' : 'aus'); } catch { /* */ } if (this.ctx) this.master.gain.value = on ? 0.6 : 0; if (on) this.ensure(); }
  resume() { if (this.ensure() && this.ctx.state === 'suspended') this.ctx.resume(); }
  update({ rain, day }) { if (!this.ctx) return; const t = this.ctx.currentTime; this.rainGain.gain.setTargetAtTime(rain * 0.25, t, 0.5); this.wind.gain.setTargetAtTime(0.1 + (1 - day) * 0.05, t, 1); }
  siren(dauer) {
    if (!this.ensure()) return; const c = this.ctx; const t0 = c.currentTime; const len = Math.min(dauer, 40);
    const o = c.createOscillator(); o.type = 'sawtooth'; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400; const g = c.createGain(); g.gain.value = 0;
    o.connect(f).connect(g).connect(this.master);
    for (let s = 0; s < len; s += 8) { o.frequency.setValueAtTime(320, t0 + s); o.frequency.linearRampToValueAtTime(620, t0 + s + 4); o.frequency.linearRampToValueAtTime(320, t0 + s + 8); }
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.12, t0 + 1.5); g.gain.setValueAtTime(0.12, t0 + len - 2); g.gain.linearRampToValueAtTime(0, t0 + len);
    o.start(t0); o.stop(t0 + len + 0.1);
  }
  tone(freqs, dur = 1.6, vol = 0.18) {
    if (!this.ensure()) return; const c = this.ctx; const t0 = c.currentTime;
    freqs.forEach((fq, i) => { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = fq; const g = c.createGain(); const st = t0 + i * 0.45;
      g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(vol, st + 0.02); g.gain.exponentialRampToValueAtTime(0.001, st + dur); o.connect(g).connect(this.master); o.start(st); o.stop(st + dur); });
  }
  gong() { this.tone([523.25, 659.25, 783.99]); }
  blip() { this.tone([880, 1174.7], 0.5, 0.08); }
  success() { this.tone([659.25, 783.99, 1046.5], 0.9, 0.14); }
  dispose() { try { this.ctx?.close(); } catch { /* */ } }
}
