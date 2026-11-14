// VALENHEIM 2.0 – Spielkern (Phase 1): Renderer, Licht, Rapier-Physik, Spielfigur, Kamera (Third/First Person), Speichern.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { PROFILE, STUFEN, autoStufe, geraet, zielFps, FpsWaechter } from './quality.js';
import { Input } from '../spieler/eingabe.js';
import { Character, nameTag } from '../spieler/figur.js';
import { baueTestgelaende } from '../welt/testgelaende.js';
import { getToken } from '../lib/api.js';

const GEHEN = 4.4, RENNEN = 7.4, SPRUNG = 5.6, SCHWERKRAFT = 18;
const KAPSEL = { halb: 0.55, r: 0.35 }; // Gesamthöhe 1,8 m
const AUGEN = 1.62;

export class Game {
  static async erstelle(canvas, opts) { await RAPIER.init(); return new Game(canvas, opts); }

  constructor(canvas, { konto, onStatus, onHinweis }) {
    this.canvas = canvas; this.onStatus = onStatus; this.onHinweis = onHinweis;
    const st = konto.spielstand; this.settings = { ...st.settings };
    this.geraet = geraet(); this.stufe = this.settings.grafik === 'auto' ? autoStufe(this.geraet) : this.settings.grafik;
    const P = PROFILE[this.stufe];

    // Renderer
    const r = new THREE.WebGLRenderer({ canvas, antialias: P.aa, powerPreference: 'high-performance', stencil: false });
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.5;
    r.shadowMap.type = THREE.PCFShadowMap; this.renderer = r;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.08, P.sicht);

    // Himmel + Licht
    const sky = new Sky(); sky.scale.setScalar(4000); this.scene.add(sky);
    const u = sky.material.uniforms; u.turbidity.value = 5; u.rayleigh.value = 1.5; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.8;
    this.sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(52), THREE.MathUtils.degToRad(210)); u.sunPosition.value.copy(this.sunDir);
    const pm = new THREE.PMREMGenerator(r); const env = new THREE.Scene(); const s2 = new Sky(); s2.scale.setScalar(1000); s2.material.uniforms.sunPosition.value.copy(this.sunDir); env.add(s2);
    this.scene.environment = pm.fromScene(env, 0, 0.1, 2000).texture; this.scene.environmentIntensity = 0.35; pm.dispose();
    this.scene.fog = new THREE.FogExp2('#9fb0c2', P.nebel);
    this.scene.add(new THREE.HemisphereLight('#c4d6f0', '#4a4034', 0.45));
    this.sun = new THREE.DirectionalLight('#ffecc8', 2.2); this.scene.add(this.sun, this.sun.target);

    // Physik + Welt
    this.world = new RAPIER.World({ x: 0, y: -SCHWERKRAFT, z: 0 });
    this.gelaende = baueTestgelaende(this.scene, RAPIER, this.world);

    // Spieler (kinematische Kapsel + Charakter-Controller)
    const p = st.pos; this.spawn = { x: 0, y: 1.2, z: 8 };
    this.body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x, Math.max(p.y, 1.2), p.z));
    this.collider = this.world.createCollider(RAPIER.ColliderDesc.capsule(KAPSEL.halb, KAPSEL.r), this.body);
    this.ctrl = this.world.createCharacterController(0.02);
    this.ctrl.enableAutostep(0.42, 0.25, true); this.ctrl.enableSnapToGround(0.45); this.ctrl.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(42));
    this.ctrl.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(48)); this.ctrl.setApplyImpulsesToDynamicBodies(true); this.ctrl.setCharacterMass(70);
    this.velY = 0; this.boden = false; this.heading = p.h ?? Math.PI;
    this.figur = new Character({ jacke: 0 }); this.figur.root.add(nameTag(konto.profil.name)); this.scene.add(this.figur.root);

    // Kamera
    this.modus = this.settings.kamera === 'ego' ? 'ego' : 'verfolger';
    this.yaw = this.heading + Math.PI; this.pitch = 0.28; this.abstand = 5.5; this.camAbstand = undefined;
    this.input = new Input(canvas);

    // Netz: Position an den Server (10×/s), Server prüft + speichert
    this.netz(); this.sendT = 0;

    // Qualität anwenden + Wächter
    this.setzeStufe(this.stufe, false);
    this.waechter = new FpsWaechter(zielFps(this.geraet), () => {
      if (this.settings.grafik !== 'auto') return; const i = STUFEN.indexOf(this.stufe); if (i > 0) { this.setzeStufe(STUFEN[i - 1]); this.onHinweis?.(`Grafik automatisch auf „${PROFILE[this.stufe].name}“ gesenkt, damit es flüssig bleibt.`); }
    });

    this.timer = new THREE.Timer(); this.t = 0; this.fps = 0; this.frames = 0; this.fpsT = 0;
    this.resize = this.resize.bind(this); addEventListener('resize', this.resize); this.resize();
    window.VH2 = this;
    this.loop = this.loop.bind(this); r.setAnimationLoop(this.loop);
  }

  setzeStufe(stufe, info = true) {
    this.stufe = stufe; const P = PROFILE[stufe]; const r = this.renderer;
    r.setPixelRatio(Math.min(this.geraet.dpr, P.pr)); this.scene.fog.density = P.nebel; this.camera.far = P.sicht; this.camera.updateProjectionMatrix();
    r.shadowMap.enabled = P.schatten > 0; this.sun.castShadow = P.schatten > 0;
    if (P.schatten) { this.sun.shadow.mapSize.set(P.schatten, P.schatten); const S = P.schattenWeite; Object.assign(this.sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 300 }); this.sun.shadow.camera.updateProjectionMatrix(); this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.03; this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }
    this.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
    this.resize(); if (info) this.onStatus?.({ stufe });
  }

  netz() {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    const ws = new WebSocket(url); this.ws = ws; this.onStatus?.({ netz: 'verbinde' });
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hallo', token: getToken() }));
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.t === 'willkommen') this.onStatus?.({ netz: 'online', online: m.online });
      if (m.t === 'korrektur') { this.body.setTranslation(m.pos, true); this.velY = 0; }
      if (m.t === 'doppelt') { this.ende = true; this.onHinweis?.('Du hast dich auf einem anderen Gerät angemeldet.'); }
    };
    ws.onclose = (e) => { if (this.beendet || this.ende || e.code === 4005) return; this.onStatus?.({ netz: 'getrennt' }); setTimeout(() => !this.beendet && this.netz(), 3000); };
  }

  resize() {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.fov = w / h < 0.8 ? 72 : 62; this.camera.updateProjectionMatrix();
  }

  wechsleKamera() {
    this.modus = this.modus === 'ego' ? 'verfolger' : 'ego'; this.settings.kamera = this.modus;
    this.onStatus?.({ kamera: this.modus }); return this.modus;
  }

  loop() {
    if (this.beendet) return;
    this.timer.update(); const dt = Math.min(0.05, this.timer.getDelta()); this.t += dt;
    this.spieler(dt);
    this.world.timestep = dt; this.world.step();
    this.gelaende.update(this.t);
    // Schatten folgen dem Spieler
    const pos = this.body.translation(); const f = new THREE.Vector3(pos.x, 0, pos.z);
    this.sun.position.copy(f).addScaledVector(this.sunDir, 120); this.sun.target.position.copy(f); this.sun.target.updateMatrixWorld();
    this.renderer.render(this.scene, this.camera);
    this.waechter.tick(dt); this.frames++; this.fpsT += dt; if (this.fpsT >= 0.5) { this.fps = Math.round(this.frames / this.fpsT); this.frames = 0; this.fpsT = 0; this.onStatus?.({ fps: this.fps }); }
    // Position senden
    this.sendT += dt; if (this.sendT > 0.1 && this.ws?.readyState === 1) { this.sendT = 0; this.ws.send(JSON.stringify({ t: 'pos', x: +pos.x.toFixed(2), y: +pos.y.toFixed(2), z: +pos.z.toFixed(2), h: +this.heading.toFixed(3) })); }
  }

  spieler(dt) {
    const inp = this.input; inp.update();
    if (inp.consume('kameraWechsel')) this.wechsleKamera();
    const look = inp.consumeLook(); const emp = 0.0032 * (this.settings.empfindlichkeit || 1);
    this.yaw -= look.dx * emp; this.pitch = THREE.MathUtils.clamp(this.pitch + look.dy * emp * 0.8 * (this.settings.yInvertiert ? -1 : 1), this.modus === 'ego' ? -1.35 : -0.35, this.modus === 'ego' ? 1.35 : 1.2);
    const z = inp.consume('zoom'); if (z) this.abstand = THREE.MathUtils.clamp(this.abstand + z * 0.6, 2.2, 10);

    // Wunschbewegung relativ zur Blickrichtung
    const mx = inp.move.x, my = inp.move.y; const stark = Math.min(1, Math.hypot(mx, my)); const v = (inp.run ? RENNEN : GEHEN) * stark;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw); let dx = (fx * my - fz * mx), dz = (fz * my + fx * mx); const l = Math.hypot(dx, dz);
    if (l > 0.01) { dx /= l; dz /= l; const ziel = Math.atan2(dx, dz); let d = ziel - this.heading; d = Math.atan2(Math.sin(d), Math.cos(d)); this.heading += d * Math.min(1, dt * 12); }
    if (this.modus === 'ego') this.heading = this.yaw + Math.PI;
    if (inp.consume('jump') && this.boden) { this.velY = SPRUNG; this.boden = false; }
    this.velY = this.boden && this.velY < 0 ? -1 : this.velY - SCHWERKRAFT * dt;
    const wunsch = { x: dx * v * dt, y: this.velY * dt, z: dz * v * dt };
    this.ctrl.computeColliderMovement(this.collider, wunsch);
    const mv = this.ctrl.computedMovement(); const t = this.body.translation();
    const neu = { x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z }; this.body.setNextKinematicTranslation(neu);
    this.boden = this.ctrl.computedGrounded(); if (this.boden && this.velY < 0) this.velY = 0;
    if (neu.y < -30) { this.body.setTranslation(this.spawn, true); this.velY = 0; this.onHinweis?.('Zurück zum Startpunkt.'); }

    // Figur
    const fuss = neu.y - KAPSEL.halb - KAPSEL.r; this.figur.root.position.set(neu.x, fuss, neu.z); this.figur.root.rotation.y = this.heading;
    this.figur.animate(dt, l > 0.01 ? v : 0, !this.boden);

    // Kamera
    const kopf = new THREE.Vector3(neu.x, fuss + AUGEN, neu.z);
    if (this.modus === 'ego') {
      this.figur.root.visible = false; this.camera.position.copy(kopf);
      const dir = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), -Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
      this.camera.lookAt(kopf.clone().add(dir));
    } else {
      const ziel = new THREE.Vector3(neu.x, fuss + 1.55, neu.z);
      const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
      let dist = this.abstand; const hit = this.world.castRay(new RAPIER.Ray(ziel, dir), this.abstand, true, undefined, undefined, this.collider);
      if (hit) dist = Math.max(0.6, hit.timeOfImpact - 0.25);
      this.camAbstand = this.camAbstand === undefined ? dist : (dist < this.camAbstand ? dist : this.camAbstand + (dist - this.camAbstand) * Math.min(1, dt * 4));
      this.camera.position.copy(ziel).addScaledVector(dir, this.camAbstand); this.camera.lookAt(ziel);
      this.figur.root.visible = this.camAbstand > 1.1;
    }
  }

  beenden() {
    this.beendet = true; this.renderer.setAnimationLoop(null); removeEventListener('resize', this.resize); this.input.dispose();
    try { this.ws?.close(); } catch { /* egal */ }
    this.scene.traverse((o) => { o.geometry?.dispose(); [].concat(o.material || []).forEach((m) => { m.map?.dispose(); m.dispose(); }); });
    this.renderer.dispose(); this.world.free();
  }
}
