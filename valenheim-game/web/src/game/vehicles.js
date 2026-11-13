// Fahrzeuge: Modelle, Einsteigen/Fahren (Spieler) und Straßenverkehr (KI auf dem Straßenraster).
import * as THREE from 'three';
import { ROADS, groundHeight } from './city.js';

// ---------- Modelle ----------
const TYPES = {
  limousine: { L: 4.6, W: 1.82, wheels: [0.9, 3.65], r: 0.34, body: [[0, 0.32], [0, 0.95], [0.85, 1.02], [4.0, 0.95], [4.55, 0.82], [4.62, 0.5], [4.55, 0.3]], cabin: [[1.05, 0.98], [1.45, 1.4], [3.0, 1.43], [3.62, 0.98]] },
  kombi: { L: 4.7, W: 1.84, wheels: [0.95, 3.7], r: 0.34, body: [[0, 0.32], [0, 1.0], [4.1, 0.97], [4.62, 0.84], [4.7, 0.5], [4.62, 0.3]], cabin: [[0.12, 1.0], [0.25, 1.46], [3.05, 1.47], [3.7, 1.0]] },
  kompakt: { L: 3.9, W: 1.76, wheels: [0.75, 3.15], r: 0.32, body: [[0, 0.32], [0, 1.0], [3.45, 0.95], [3.88, 0.8], [3.92, 0.48], [3.85, 0.3]], cabin: [[0.1, 1.0], [0.3, 1.5], [2.45, 1.5], [3.1, 0.98]] },
  suv: { L: 4.75, W: 1.95, wheels: [0.95, 3.75], r: 0.42, body: [[0, 0.42], [0, 1.15], [4.15, 1.12], [4.7, 1.0], [4.76, 0.6], [4.68, 0.4]], cabin: [[0.12, 1.15], [0.3, 1.78], [3.2, 1.78], [3.85, 1.14]] },
  rtw: { L: 6.2, W: 2.2, wheels: [1.2, 4.9], r: 0.4, body: [[0, 0.45], [0, 2.75], [4.6, 2.75], [4.7, 1.9], [5.45, 1.75], [6.2, 1.15], [6.22, 0.55], [6.1, 0.42]], cabin: [[4.72, 1.85], [5.0, 2.55], [5.45, 2.6], [6.05, 1.25]] },
};
const geoCache = new Map();
function extrude(points, depth, bevel = 0.05) {
  const s = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 4 });
  return g;
}
function typeGeos(type) {
  if (geoCache.has(type)) return geoCache.get(type);
  const T = TYPES[type]; const L = T.L, W = T.W;
  const place = (g, w) => { g.translate(-L / 2, 0, -w / 2); g.rotateY(-Math.PI / 2); return g; };
  const body = place(extrude(T.body, W - 0.1), W - 0.1);
  const cabin = place(extrude(T.cabin, W - 0.22, 0.04), W - 0.22);
  // Dach nach oben schmaler (wie echte Autos)
  const belt = Math.min(...T.cabin.map((p) => p[1])); const top0 = Math.max(...T.cabin.map((p) => p[1]));
  const cp = cabin.attributes.position; for (let i = 0; i < cp.count; i++) { const k = (cp.getY(i) - belt) / Math.max(0.01, top0 - belt); cp.setX(i, cp.getX(i) * (1 - 0.14 * Math.max(0, k))); }
  cabin.computeVertexNormals();
  const cabinTop = Math.max(...T.cabin.map((p) => p[1]));
  const cxs = T.cabin.map((p) => p[0]); const roofLen = (Math.max(...cxs) - Math.min(...cxs)) * 0.62;
  const roof = new THREE.BoxGeometry((W - 0.22) * 0.86, 0.07, roofLen); roof.translate(0, cabinTop + 0.03, -(((Math.min(...cxs) + Math.max(...cxs)) / 2) - L / 2));
  const tire = new THREE.CylinderGeometry(T.r, T.r, 0.26, 18).rotateZ(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(T.r * 0.62, T.r * 0.62, 0.28, 12).rotateZ(Math.PI / 2);
  const headL = new THREE.BoxGeometry(0.42, 0.14, 0.06); const tail = new THREE.BoxGeometry(0.38, 0.14, 0.06);
  const bumper = new THREE.BoxGeometry(W - 0.02, 0.2, 0.22); const plate = new THREE.BoxGeometry(0.52, 0.12, 0.02);
  const mirror = new THREE.BoxGeometry(0.2, 0.12, 0.1); const arch = new THREE.CylinderGeometry(T.r + 0.08, T.r + 0.08, W - 0.06, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2);
  const g = { body, cabin, roof, tire, rim, headL, tail, bumper, plate, mirror, arch, T }; geoCache.set(type, g); return g;
}
const mats = {
  glass: new THREE.MeshStandardMaterial({ color: '#0e161f', roughness: 0.05, metalness: 0.9, envMapIntensity: 1.6 }),
  tire: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.85 }),
  rim: new THREE.MeshStandardMaterial({ color: '#b9bec4', roughness: 0.25, metalness: 0.9 }),
  head: new THREE.MeshStandardMaterial({ color: '#fff7e0', emissive: '#fff2c8', emissiveIntensity: 0.6 }),
  tail: new THREE.MeshStandardMaterial({ color: '#7a0a0a', emissive: '#ff1a1a', emissiveIntensity: 0.4 }),
  stripe: new THREE.MeshStandardMaterial({ color: '#d42a2a', emissive: '#300000' }),
  blue: new THREE.MeshStandardMaterial({ color: '#1e5bff', emissive: '#2a6bff', emissiveIntensity: 0 }),
  plastic: new THREE.MeshStandardMaterial({ color: '#1d1f22', roughness: 0.7 }),
  beam: (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 128, 4, 32, 90, 90); gr.addColorStop(0, 'rgba(255,245,215,0.95)'); gr.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }); })(),
  plate: new THREE.MeshStandardMaterial({ color: '#f2f2ee', roughness: 0.5 }),
};
const paint = new Map();
function paintMat(color) {
  if (!paint.has(color)) paint.set(color, new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: 0.55, clearcoat: 0.8, clearcoatRoughness: 0.15 }));
  return paint.get(color);
}
const BEAM_GEO = new THREE.PlaneGeometry(4.2, 11).rotateX(-Math.PI / 2);
// Nachtbeleuchtung aller Autos (0 = Tag, 1 = Nacht)
export function setCarNight(n) { mats.beam.opacity = n * 0.5; mats.head.emissiveIntensity = 0.6 + n * 3; mats.tail.emissiveIntensity = 0.4 + n * 1.6; }
export const CAR_COLORS = ['#9a1b1b', '#1b3a6b', '#e8e8e8', '#202226', '#7d7f82', '#2f4b33', '#c9b48a', '#b56a1d', '#5d2a6e', '#1d6f7a'];

export function makeCar(type = 'limousine', color = '#9a1b1b') {
  const G = typeGeos(type); const T = G.T; const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const add = (geo, m, parent = body) => { const x = new THREE.Mesh(geo, m); x.castShadow = true; x.receiveShadow = true; parent.add(x); return x; };
  const bm = type === 'rtw' ? paintMat('#f2f2ee') : paintMat(color);
  add(G.body, bm); add(G.cabin, mats.glass); add(G.roof, bm);
  const wheels = [];
  for (const u of T.wheels) for (const s of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(s * (T.W / 2 - 0.16), T.r, u - T.L / 2); body.add(w);
    const spin = new THREE.Group(); w.add(spin); add(G.tire, mats.tire, spin); add(G.rim, mats.rim, spin);
    wheels.push({ g: w, spin, front: u > T.L / 2 });
  }
  const yL = type === 'rtw' ? 1.0 : 0.72;
  for (const s of [-1, 1]) {
    const h = add(G.headL, mats.head); h.position.set(s * (T.W / 2 - 0.32), yL, T.L / 2 + 0.02);
    const t = add(G.tail, mats.tail); t.position.set(s * (T.W / 2 - 0.3), yL + 0.1, -T.L / 2 - 0.02);
  }
  // Scheinwerferkegel auf der Straße (nachts)
  const beam = new THREE.Mesh(BEAM_GEO, mats.beam); beam.position.set(0, 0.04 - 0, T.L / 2 + 5.5); root.add(beam);
  // Stoßstangen, Kennzeichen, Spiegel, Radkästen
  const yb = T.r * 0.8;
  for (const s of [1, -1]) { const b = add(G.bumper, mats.plastic); b.position.set(0, yb, s * (T.L / 2 - 0.05)); const pl = add(G.plate, mats.plate); pl.position.set(0, yb + 0.02, s * (T.L / 2 + 0.07)); }
  const cabFront = Math.max(...T.cabin.map((p) => p[0])) - T.L / 2; const belt = Math.min(...T.cabin.map((p) => p[1]));
  for (const s of [-1, 1]) { const m = add(G.mirror, bm); m.position.set(s * (T.W / 2 + 0.02), belt + 0.08, cabFront - 0.15); }
  for (const u of T.wheels) { const a = add(G.arch, mats.plastic); a.position.set(0, T.r, u - T.L / 2); a.scale.set(1, 1, 1); }
  if (type === 'rtw') {
    const st = add(new THREE.BoxGeometry(T.W + 0.02, 0.3, 4.4), mats.stripe); st.position.set(0, 1.35, -T.L / 2 + 2.3);
    const bar = add(new THREE.BoxGeometry(1.2, 0.16, 0.3), mats.blue); bar.position.set(0, 2.62, T.L / 2 - 1.3);
  }
  root.userData = { type, T, wheels, body };
  return root;
}

// ---------- Fahrphysik (Arcade, gut steuerbar auch per Touch) ----------
export class DrivableCar {
  constructor(scene, type, color, x, z, heading) {
    this.type = type; this.color = color; this.mesh = makeCar(type, color); scene.add(this.mesh);
    this.pos = new THREE.Vector3(x, 0, z); this.heading = heading; this.speed = 0; this.steer = 0; this.wheelRot = 0; this.occupied = false; this.siren = false;
    this.T = TYPES[type]; this.sync();
  }
  // input: throttle -1..1, steer -1..1, handbrake bool
  drive(dt, { throttle, steer, handbrake }, colliders, traffic) {
    const maxF = this.type === 'rtw' ? 30 : this.type === 'kompakt' ? 33 : 38; const maxR = -9;
    if (throttle > 0) this.speed += (this.speed < 0 ? 22 : 10 * (1 - Math.max(0, this.speed) / maxF)) * throttle * dt;
    else if (throttle < 0) this.speed += (this.speed > 0.5 ? -24 : -7) * -throttle * dt;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), (2.2 + Math.abs(this.speed) * 0.08) * dt);
    if (handbrake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 16 * dt);
    this.speed = THREE.MathUtils.clamp(this.speed, maxR, maxF);
    const sMax = THREE.MathUtils.lerp(0.62, 0.16, Math.min(1, Math.abs(this.speed) / maxF));
    this.steer += (steer * sMax - this.steer) * Math.min(1, dt * 6);
    const wb = this.T.wheels[1] - this.T.wheels[0];
    const yawRate = (this.speed / wb) * Math.tan(this.steer) * (handbrake ? 1.5 : 1);
    this.heading -= yawRate * dt;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += fx * this.speed * dt; this.pos.z += fz * this.speed * dt;
    // Kollision: zwei Kreise (vorne/hinten) gegen Gebäude/Hindernisse
    let hit = 0; const half = this.T.L / 2 - this.T.W / 2;
    for (const k of [half, -half]) {
      const p = { x: this.pos.x + fx * k, z: this.pos.z + fz * k }; const b = { ...p };
      colliders.resolve(p, this.T.W / 2 + 0.05, 0.6);
      const dx = p.x - b.x, dz = p.z - b.z; if (dx || dz) { this.pos.x += dx; this.pos.z += dz; hit = Math.max(hit, Math.hypot(dx, dz)); }
    }
    // gegen Verkehr
    if (traffic) for (const o of traffic.cars) {
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z; const d = Math.hypot(dx, dz); const min = (this.T.L + o.T.L) / 2 * 0.55;
      if (d < min && d > 0.01) { this.pos.x += (dx / d) * (min - d); this.pos.z += (dz / d) * (min - d); hit = Math.max(hit, 0.3); o.bump = 1.2; }
    }
    if (hit > 0.02) { this.lastHit = Math.abs(this.speed); this.speed *= -0.25; }
    this.pos.y += (groundHeight(this.pos.x, this.pos.z) - this.pos.y) * Math.min(1, dt * 10);
    this.realSpeed = Math.hypot(this.pos.x - ox, this.pos.z - oz) / Math.max(dt, 1e-4);
    this.wheelRot += (this.speed / this.T.r) * dt; this.sync(dt);
  }
  sync(dt = 0) {
    const m = this.mesh; m.position.copy(this.pos); m.rotation.y = this.heading;
    for (const w of m.userData.wheels) { w.spin.rotation.x = this.wheelRot; if (w.front) w.g.rotation.y = -this.steer; }
    // leichte Neigung beim Bremsen/Kurven
    const b = m.userData.body; b.rotation.z += ((this.steer * Math.min(1, Math.abs(this.speed) / 20)) * 0.06 - b.rotation.z) * Math.min(1, dt * 5);
    if (this.type === 'rtw') mats.blue.emissiveIntensity = this.siren ? (Math.sin(performance.now() / 70) > 0 ? 3 : 0) : 0;
  }
  collider() { return { x: this.pos.x, z: this.pos.z }; }
}

// ---------- Verkehr ----------
// Autos fahren auf dem Straßenraster (Rechtsverkehr, Spur 2,4 m rechts der Mittellinie), biegen an Kreuzungen zufällig ab.
const LANE = 2.4;
export class Traffic {
  constructor(scene, n, rand = Math.random) {
    this.cars = []; this.scene = scene;
    const types = ['limousine', 'kombi', 'kompakt', 'suv', 'kompakt', 'limousine'];
    for (let i = 0; i < n; i++) {
      const axisX = rand() < 0.5; const road = ROADS[1 + Math.floor(rand() * (ROADS.length - 2))];
      const dir = rand() < 0.5 ? 1 : -1; const along = -200 + Math.floor(rand() * 5) * 80 + 15 + rand() * 50;
      const type = types[i % types.length]; const color = CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)];
      const mesh = makeCar(type, color); scene.add(mesh);
      const c = { mesh, T: TYPES[type], axisX, road, dir, along, speed: 0, target: 9 + rand() * 4, pos: new THREE.Vector3(), heading: 0, wheelRot: 0, bump: 0, turnCooldown: 0 };
      this.place(c); this.cars.push(c);
    }
  }
  place(c) {
    // axisX: fährt entlang x (Straße mit festem z = road); dir: +1/-1
    if (c.axisX) { c.pos.set(c.along, 0, c.road + LANE * c.dir); c.heading = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
    else { c.pos.set(c.road - LANE * c.dir, 0, c.along); c.heading = c.dir > 0 ? 0 : Math.PI; }
  }
  // An der Kreuzung (Straße c.road × cross) neue Richtung wählen: geradeaus, links, rechts – nur innerhalb ±200 m und nie ins Militärgelände
  choose(c, cross) {
    const ok = (axisX, road, dir, pos) => {
      if (Math.abs(road) > 200) return false; const next = pos + dir * 80; if (Math.abs(next) > 200) return false;
      if (!axisX && Math.abs(road) <= 120 && dir < 0 && pos <= -200) return false; // nach Norden ins Sperrgebiet
      if (axisX && road <= -200 && Math.abs(next) <= 120) return false;
      return true;
    };
    const opts = [];
    if (ok(c.axisX, c.road, c.dir, cross)) opts.push({ axisX: c.axisX, road: c.road, dir: c.dir, along: c.along, w: 3 });
    for (const nd of [1, -1]) if (ok(!c.axisX, cross, nd, c.road)) opts.push({ axisX: !c.axisX, road: cross, dir: nd, along: c.road + nd * 3, w: 1 });
    if (!opts.length) { c.dir = -c.dir; c.speed = 0; return; }
    let r = Math.random() * opts.reduce((a, o) => a + o.w, 0); let pick = opts[0];
    for (const o of opts) { r -= o.w; if (r <= 0) { pick = o; break; } }
    if (pick.axisX !== c.axisX) c.speed *= 0.55;
    Object.assign(c, { axisX: pick.axisX, road: pick.road, dir: pick.dir, along: pick.along });
  }

  update(dt, player, playerCar) {
    for (const c of this.cars) {
      // Abstand halten: Auto/Spieler voraus?
      const fx = Math.sin(c.heading), fz = Math.cos(c.heading); let block = 99;
      const check = (x, z, r) => { const dx = x - c.pos.x, dz = z - c.pos.z; const ahead = dx * fx + dz * fz; const side = Math.abs(dx * fz - dz * fx); if (ahead > 0 && side < r) block = Math.min(block, ahead); };
      for (const o of this.cars) if (o !== c) check(o.pos.x, o.pos.z, 1.6);
      if (player) check(player.x, player.z, 2.2);
      if (playerCar) check(playerCar.pos.x, playerCar.pos.z, 2.4);
      const want = c.bump > 0 ? 0 : block < 7 ? 0 : block < 16 ? c.target * (block - 7) / 9 : c.target;
      c.bump = Math.max(0, c.bump - dt);
      c.speed += THREE.MathUtils.clamp(want - c.speed, -14 * dt, 5 * dt);
      c.along += c.speed * c.dir * dt;
      // Kreuzung erreicht? (Straßen schneiden sich an ROADS)
      c.turnCooldown -= dt;
      for (const cross of ROADS) {
        const d = (cross - c.along) * c.dir;
        if (d < 0 && d > -1.5 && c.turnCooldown <= 0) { c.turnCooldown = 2; this.choose(c, cross); break; }
      }
      this.place(c);
      // weich drehen statt springen
      const m = c.mesh; let dh = c.heading - m.rotation.y; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      m.rotation.y += dh * Math.min(1, dt * 5); m.position.lerp(c.pos, Math.min(1, dt * 8));
      c.wheelRot += (c.speed / c.T.r) * dt; for (const w of m.userData.wheels) w.spin.rotation.x = c.wheelRot;
      c.pos.copy(m.position);
    }
  }
}
