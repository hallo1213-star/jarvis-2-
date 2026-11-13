// 3D-Engine: Renderer, Himmel, Licht, Stadt, Spielfigur, Kamera, Spielschleife.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { buildCity, groundHeight, districtAt, DISTRICTS } from './city.js';
import { Character, nameTag } from './character.js';
import { Input } from './input.js';

export const QUALITY = {
  niedrig: { pr: 1, shadows: 0, aa: false, fog: 0.0042, far: 520 },
  mittel: { pr: 1.5, shadows: 1024, aa: false, fog: 0.0030, far: 800 },
  hoch: { pr: 2, shadows: 2048, aa: true, fog: 0.0022, far: 1100 },
};
export function defaultQuality() {
  try { const q = localStorage.getItem('vh_quality'); if (q && QUALITY[q]) return q; } catch { /* ignore */ }
  return matchMedia('(pointer: coarse)').matches ? 'mittel' : 'hoch';
}

const WALK = 4.2, RUN = 7.6, JUMP = 5.2, GRAV = 16, RADIUS = 0.38;

export class Engine {
  constructor(canvas, { mode = 'play', quality = defaultQuality(), player = null, onDistrict, onStats } = {}) {
    this.canvas = canvas; this.mode = mode; this.qualityName = quality; this.q = QUALITY[quality];
    this.onDistrict = onDistrict; this.onStats = onStats;
    const r = new THREE.WebGLRenderer({ canvas, antialias: this.q.aa, powerPreference: 'high-performance', stencil: false });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.q.pr));
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.72;
    r.shadowMap.enabled = this.q.shadows > 0; r.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = r;

    const scene = new THREE.Scene(); this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, this.q.far);

    // Himmel + Sonne
    const sky = new Sky(); sky.scale.setScalar(5000); scene.add(sky);
    const u = sky.material.uniforms; u.turbidity.value = 6; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82;
    this.sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(58), THREE.MathUtils.degToRad(215));
    u.sunPosition.value.copy(this.sunDir); this.skyUniforms = u;
    // Umgebungslicht aus dem Himmel (Reflexionen auf Glas/Autos)
    const pm = new THREE.PMREMGenerator(r); const envScene = new THREE.Scene(); const sky2 = new Sky(); sky2.scale.setScalar(1000);
    Object.assign(sky2.material.uniforms.turbidity, { value: 6 }); sky2.material.uniforms.sunPosition.value.copy(this.sunDir); envScene.add(sky2);
    scene.environment = pm.fromScene(envScene, 0, 0.1, 2000).texture; scene.environmentIntensity = 0.3; pm.dispose();

    scene.fog = new THREE.FogExp2(0xb9c6d2, this.q.fog);
    this.hemi = new THREE.HemisphereLight(0xbfd4f2, 0x4a4034, 0.42); scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xffeccc, 2.1); this.sun = sun;
    sun.castShadow = this.q.shadows > 0;
    if (sun.castShadow) {
      sun.shadow.mapSize.set(this.q.shadows, this.q.shadows); const S = 60;
      Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 400 });
      sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
    }
    scene.add(sun); scene.add(sun.target);

    this.city = buildCity(scene, quality);
    this.colliders = this.city.colliders;

    // Spieler
    this.input = mode === 'play' ? new Input(canvas) : null;
    this.pos = new THREE.Vector3(0, 0.15, 21); this.velY = 0; this.heading = Math.PI; this.grounded = true;
    this.yaw = 0; this.pitch = 0.32; this.dist = 6.5;
    if (player) {
      this.char = new Character(player.look); scene.add(this.char.root);
      this.tag = nameTag(player.name); this.char.root.add(this.tag);
    }
    this.district = null; this.clock = new THREE.Timer(); this.t = 0; this.running = true;
    this.frames = 0; this.fpsT = 0; this.updaters = [];

    window.VH = this; // für Tests/Fehlersuche
    this.resize = this.resize.bind(this); window.addEventListener('resize', this.resize); this.resize();
    this.loop = this.loop.bind(this); r.setAnimationLoop(this.loop);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.8 ? 70 : 60; this.camera.updateProjectionMatrix();
  }

  setQuality(name) {
    try { localStorage.setItem('vh_quality', name); } catch { /* ignore */ }
    this.qualityName = name; this.q = QUALITY[name];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.q.pr));
    this.scene.fog.density = this.q.fog; this.camera.far = this.q.far; this.camera.updateProjectionMatrix();
    const sh = this.q.shadows > 0; this.renderer.shadowMap.enabled = sh; this.sun.castShadow = sh;
    if (sh) { this.sun.shadow.mapSize.set(this.q.shadows, this.q.shadows); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }
    this.scene.traverse((o) => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => { m.needsUpdate = true; }); } });
    this.resize();
  }

  loop() {
    if (!this.running) return;
    this.clock.update(); const dt = Math.min(0.05, this.clock.getDelta()); this.t += dt;
    if (this.mode === 'play') this.updatePlayer(dt); else this.updateCinematic();
    this.city.update(this.t);
    for (const f of this.updaters) f(dt, this.t);
    // Schatten-Kamera folgt dem Blickpunkt
    const focus = this.mode === 'play' ? this.pos : this.camFocus || new THREE.Vector3();
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 150); this.sun.target.position.copy(focus); this.sun.target.updateMatrixWorld();
    this.renderer.render(this.scene, this.camera);
    this.frames++; this.fpsT += dt;
    if (this.fpsT > 0.5) { this.fps = Math.round(this.frames / this.fpsT); this.frames = 0; this.fpsT = 0; this.onStats?.({ fps: this.fps }); }
  }

  // Kameraflug für die Startseite
  updateCinematic() {
    const t = this.t * 0.035; const R = 150 + Math.sin(t * 0.7) * 30;
    const f = new THREE.Vector3(Math.sin(t * 0.5) * 30, 8, -10 + Math.cos(t * 0.4) * 20); this.camFocus = f;
    this.camera.position.set(Math.cos(t) * R, 55 + Math.sin(t * 1.3) * 15, Math.sin(t) * R);
    this.camera.lookAt(f);
  }

  updatePlayer(dt) {
    const inp = this.input; inp.update();
    const look = inp.consumeLook();
    this.yaw -= look.dx * 0.0032; this.pitch = THREE.MathUtils.clamp(this.pitch + look.dy * 0.0026, -0.25, 1.15);
    const z = inp.consume('zoom'); if (z) this.dist = THREE.MathUtils.clamp(this.dist + z * 0.7, 3, 11);

    // Bewegung relativ zur Kamera
    const mx = inp.move.x, my = inp.move.y; const moving = Math.hypot(mx, my) > 0.05;
    const speed = (inp.run && !this.noRun ? RUN : WALK) * Math.min(1, Math.hypot(mx, my));
    if (moving) {
      const fwdX = -Math.sin(this.yaw), fwdZ = -Math.cos(this.yaw); const rX = -fwdZ, rZ = fwdX;
      const dx = fwdX * my + rX * mx, dz = fwdZ * my + rZ * mx; const l = Math.hypot(dx, dz) || 1;
      this.pos.x += (dx / l) * speed * dt; this.pos.z += (dz / l) * speed * dt;
      const target = Math.atan2(dx, dz); let d = target - this.heading; d = Math.atan2(Math.sin(d), Math.cos(d)); this.heading += d * Math.min(1, dt * 12);
    }
    // Springen + Schwerkraft
    const gh = groundHeight(this.pos.x, this.pos.z);
    if (inp.consume('jump') && this.grounded) { this.velY = JUMP; this.grounded = false; }
    this.velY -= GRAV * dt; this.pos.y += this.velY * dt;
    if (this.pos.y <= gh) { this.pos.y = gh + (this.grounded ? 0 : 0); this.velY = 0; this.grounded = true; }
    else if (this.grounded && this.pos.y - gh < 0.3) { this.pos.y = gh; this.velY = 0; } // Bordsteinkante
    else this.grounded = false;
    this.colliders.resolve(this.pos, RADIUS, this.pos.y + 0.2);

    if (this.char) {
      this.char.root.position.copy(this.pos); this.char.root.rotation.y = this.heading;
      this.char.animate(dt, moving ? speed : 0, !this.grounded);
    }
    // Viertel-Wechsel melden
    const d = districtAt(this.pos.x, this.pos.z);
    if (d !== this.district) { this.district = d; this.onDistrict?.(d, DISTRICTS[d]); }

    // Kamera hinter dem Spieler, gegen Wände verkürzt
    const tgt = new THREE.Vector3(this.pos.x, this.pos.y + 1.55, this.pos.z);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    let dist = this.dist;
    for (let s = 0.5; s <= this.dist; s += 0.25) {
      const p = tgt.clone().addScaledVector(dir, s);
      if (this.colliders.blocked(p.x, p.y, p.z) || p.y < groundHeight(p.x, p.z) + 0.25) { dist = Math.max(0.6, s - 0.35); break; }
    }
    this.camDist = this.camDist === undefined ? dist : (dist < this.camDist ? dist : this.camDist + (dist - this.camDist) * Math.min(1, dt * 4));
    this.camera.position.copy(tgt).addScaledVector(dir, this.camDist);
    this.camera.lookAt(tgt);
    if (this.char) this.char.root.visible = this.camDist > 1.3; // Kamera direkt am Kopf: Figur ausblenden
  }

  addUpdater(f) { this.updaters.push(f); }

  minimapState() { return { x: this.pos.x, z: this.pos.z, heading: this.heading, yaw: this.yaw }; }

  dispose() {
    this.running = false; this.renderer.setAnimationLoop(null); window.removeEventListener('resize', this.resize);
    this.input?.dispose();
    this.scene.traverse((o) => { o.geometry?.dispose(); const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; ms.forEach((m) => { m.map?.dispose(); m.dispose(); }); });
    this.renderer.dispose();
  }
}
