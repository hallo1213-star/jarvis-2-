// 3D-Engine: Renderer, Himmel, Licht, Stadt, Spielfigur, Kamera, Spielschleife.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { buildCity, groundHeight, districtAt, DISTRICTS } from './city.js';
import { Character, nameTag } from './character.js';
import { Input } from './input.js';
import { DrivableCar, Traffic, setCarNight } from './vehicles.js';
import { Crowd } from './crowd.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { FX } from './fx.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Farbkorrektur + Vignette (Kino-Look)
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.32 }, uSat: { value: 1.12 }, uCon: { value: 1.06 }, uWarm: { value: 0.02 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uVig, uSat, uCon, uWarm; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); vec3 col = c.rgb;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722)); col = mix(vec3(l), col, uSat);
      col = (col - 0.5) * uCon + 0.5; col.r += uWarm; col.b -= uWarm * 0.6;
      float d = distance(vUv, vec2(0.5)); col *= 1.0 - uVig * smoothstep(0.35, 0.85, d);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a); }`,
};

export const QUALITY = {
  niedrig: { pr: 1, shadows: 0, aa: false, fog: 0.0042, far: 520, traffic: 8, crowd: 14, post: false },
  mittel: { pr: 1.5, shadows: 1024, aa: false, fog: 0.0030, far: 800, traffic: 16, crowd: 28, post: false },
  hoch: { pr: 2, shadows: 2048, aa: true, fog: 0.0022, far: 1100, traffic: 26, crowd: 46, post: true },
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

    // Wolkenschicht (prozedural, zieht langsam)
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.BackSide, fog: false,
      uniforms: { uTime: { value: 0 }, uSun: { value: this.sunDir.clone() }, uDay: { value: 1 }, uCover: { value: 0.45 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); p.z = p.w * 0.9999; gl_Position = p; }',
      fragmentShader: `varying vec3 vDir; uniform float uTime, uDay, uCover; uniform vec3 uSun;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * n(p); p *= 2.03; a *= 0.5; } return v; }
        void main(){ if (vDir.y < 0.02) discard; vec2 uv = vDir.xz / (vDir.y + 0.12) * 1.3 + vec2(uTime * 0.006, uTime * 0.002);
          float c = smoothstep(uCover, uCover + 0.32, fbm(uv)); float edge = smoothstep(0.02, 0.25, vDir.y);
          float sun = pow(max(dot(normalize(vDir), normalize(uSun)), 0.0), 8.0);
          vec3 col = mix(vec3(0.07, 0.08, 0.11), vec3(0.96, 0.95, 0.93), uDay) * (0.75 + 0.25 * fbm(uv * 2.0 + 3.0)) + sun * vec3(0.5, 0.35, 0.2) * uDay;
          gl_FragColor = vec4(col, c * edge * 0.92); }`,
    }));
    this.clouds.renderOrder = -1; this.clouds.frustumCulled = false; scene.add(this.clouds);

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
    // Leben in der Stadt: Verkehr + Fußgänger, dazu Autos zum Einsteigen
    this.traffic = new Traffic(scene, this.q.traffic);
    this.crowd = new Crowd(scene, this.q.crowd);
    this.cars = [
      ['limousine', '#1b3a6b', -18, 28, Math.PI / 2], ['suv', '#202226', 18, 28, -Math.PI / 2], ['kompakt', '#9a1b1b', 9, 30.5, Math.PI / 2],
      ['rtw', '#ffffff', 212, -58, 0], ['kombi', '#c9b48a', -214, 24, Math.PI], ['limousine', '#7d7f82', 150, 236, Math.PI / 2], ['suv', '#2f4b33', -150, 150, 0],
    ].map(([t, c, x, z, h]) => new DrivableCar(scene, t, c, x, z, h));
    this.vehicle = null; this.carPrompt = null;
    if (this.q.post) this.setupPost();

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

    this.fx = new FX(this);
    window.VH = this; // für Tests/Fehlersuche
    this.resize = this.resize.bind(this); window.addEventListener('resize', this.resize); this.resize();
    this.loop = this.loop.bind(this); r.setAnimationLoop(this.loop);
  }

  setupPost() {
    const c = new EffectComposer(this.renderer); c.addPass(new RenderPass(this.scene, this.camera));
    try { const ao = new GTAOPass(this.scene, this.camera, 256, 256); ao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 12 }); ao.blendIntensity = 0.85; c.addPass(ao); this.ao = ao; } catch (e) { console.warn('AO nicht verfügbar', e); }
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.55, 0.88); c.addPass(this.bloom);
    c.addPass(new OutputPass()); this.grade = new ShaderPass(GradeShader); c.addPass(this.grade); this.composer = c;
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h;
    if (this.composer) { this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(w, h); }
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
    if (this.q.post && !this.composer) this.setupPost(); if (!this.q.post && this.composer) { this.composer.dispose(); this.composer = null; }
    this.resize();
  }

  loop() {
    if (!this.running) return;
    this.clock.update(); const dt = Math.min(0.05, this.clock.getDelta()); this.t += dt;
    if (this.mode === 'play') this.updatePlayer(dt); else this.updateCinematic();
    this.city.update(this.t);
    this.traffic.update(dt, this.mode === 'play' && !this.vehicle ? this.pos : null, this.vehicle);
    this.crowd.update(dt, this.mode === 'play' ? this.pos : null, this.camera.position);
    for (const f of this.updaters) f(dt, this.t);
    setCarNight(this.nightLights || 0);
    if (this.clouds) { this.clouds.position.copy(this.camera.position); this.clouds.material.uniforms.uTime.value = this.t; this.clouds.material.uniforms.uSun.value.copy(this.sunDir); this.clouds.material.uniforms.uDay.value = this.dayLight ?? 1; }
    // Schatten-Kamera folgt dem Blickpunkt
    const focus = this.mode === 'play' ? this.pos : this.camFocus || new THREE.Vector3();
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 150); this.sun.target.position.copy(focus); this.sun.target.updateMatrixWorld();
    if (this.composer) this.composer.render(dt); else this.renderer.render(this.scene, this.camera);
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

  // Aus- und Einsteigen (E / Taste im HUD)
  toggleVehicle() {
    if (this.vehicle) {
      const v = this.vehicle; if (Math.abs(v.speed) > 6) return;
      const side = new THREE.Vector3(Math.cos(v.heading), 0, -Math.sin(v.heading)).multiplyScalar(v.T.W / 2 + 0.8);
      this.pos.set(v.pos.x + side.x, groundHeight(v.pos.x + side.x, v.pos.z + side.z), v.pos.z + side.z);
      v.occupied = false; v.speed = 0; v.siren = false; this.vehicle = null; if (this.char) this.char.root.visible = true; this.dist = 6.5; this.pitch = 0.32;
      this.onVehicle?.(null); return;
    }
    const c = this.nearCar(); if (!c) return;
    this.vehicle = c; c.occupied = true; this.dist = c.type === 'rtw' ? 9.5 : 7.5; this.pitch = 0.2; this.yaw = c.heading + Math.PI;
    if (this.char) this.char.root.visible = false; this.onVehicle?.(c);
  }
  nearCar() { let best = null, bd = 4.2; for (const c of this.cars) { const d = Math.hypot(c.pos.x - this.pos.x, c.pos.z - this.pos.z) - c.T.L / 4; if (!c.occupied && d < bd) { bd = d; best = c; } } return best; }

  updateDriving(dt) {
    const inp = this.input; inp.update(); const v = this.vehicle;
    const look = inp.consumeLook(); if (look.dx || look.dy) this.lastLook = this.t;
    this.yaw -= look.dx * 0.0032; this.pitch = THREE.MathUtils.clamp(this.pitch + look.dy * 0.0026, -0.1, 0.9);
    if (inp.consume('interact')) { this.toggleVehicle(); if (!this.vehicle) return; }
    if (inp.consume('jump')) { /* Leertaste = Handbremse (gehalten) */ }
    v.drive(dt, { throttle: inp.move.y, steer: inp.move.x, handbrake: inp.hand }, this.colliders, this.traffic);
    this.pos.copy(v.pos); this.heading = v.heading;
    // Kamera folgt hinter dem Auto (nach kurzer Pause auch, wenn man sich umgesehen hat)
    if (!this.lastLook || this.t - this.lastLook > 1.2) { let d = (v.heading + Math.PI) - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yaw += d * Math.min(1, dt * (1.5 + Math.abs(v.speed) * 0.08)); }
    const sp = Math.abs(v.speed); const fov = (this.camera.aspect < 0.8 ? 70 : 60) + Math.min(14, sp * 0.4);
    this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 3); this.camera.updateProjectionMatrix();
    const tgt = new THREE.Vector3(v.pos.x, v.pos.y + (v.type === 'rtw' ? 2.4 : 1.5), v.pos.z);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    let dist = this.dist + Math.min(2, sp * 0.06);
    for (let s = 1; s <= dist; s += 0.35) { const p = tgt.clone().addScaledVector(dir, s); if (this.colliders.blocked(p.x, p.y, p.z)) { dist = Math.max(1.5, s - 0.4); break; } }
    this.camDist = this.camDist === undefined ? dist : (dist < this.camDist ? dist : this.camDist + (dist - this.camDist) * Math.min(1, dt * 3));
    this.camera.position.copy(tgt).addScaledVector(dir, this.camDist); this.camera.lookAt(tgt);
    if (v.lastHit > 8) { this.shake = Math.min(1, v.lastHit / 25); v.lastHit = 0; }
    if (this.shake > 0) { this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.4; this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.4; this.shake -= dt * 2.5; }
    const d = districtAt(this.pos.x, this.pos.z); if (d !== this.district) { this.district = d; this.onDistrict?.(d, DISTRICTS[d]); }
    this.speedKmh = Math.round(sp * 3.6);
  }

  updatePlayer(dt) {
    if (this.vehicle) return this.updateDriving(dt);
    this.speedKmh = 0;
    const inp = this.input; inp.update();
    const near = this.nearCar(); const prompt = near ? (near.type === 'rtw' ? 'Rettungswagen fahren' : 'Einsteigen') : null;
    if (prompt !== this.carPrompt) { this.carPrompt = prompt; this.onCarPrompt?.(prompt); }
    if (near && inp.interact) { inp.consume('interact'); this.toggleVehicle(); return; }
    const fovW = this.camera.aspect < 0.8 ? 70 : 60; if (Math.abs(this.camera.fov - fovW) > 0.1) { this.camera.fov += (fovW - this.camera.fov) * Math.min(1, dt * 3); this.camera.updateProjectionMatrix(); }
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
    for (const c of [...this.cars, ...this.traffic.cars]) { const dx = this.pos.x - c.pos.x, dz = this.pos.z - c.pos.z; const d = Math.hypot(dx, dz); const r = c.T.L * 0.42; if (d < r && d > 0.01) { this.pos.x += (dx / d) * (r - d) * 0.5; this.pos.z += (dz / d) * (r - d) * 0.5; } }

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
