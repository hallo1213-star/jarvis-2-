// VALENHEIM 2.0 – Automodelle (aus v1 weiterentwickelt): 6 Modelle, Tuning sichtbar, echtes Kennzeichen
import * as THREE from 'three';
import { verschmelze } from '../core/verschmelzen.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ---- Echtes Sportwagen-Modell (Khronos „Car Concept“, CC BY 4.0, optimiert) für Viper GT + Phantom R
let sportVorlage = null, verkehrVorlage = null, parkVorlage = null, sportLaden = null;
export function ladeAutos() {
  if (sportLaden) return sportLaden;
  const L = new GLTFLoader(); const ld = (f, setze) => new Promise((ok) => L.load(f, (g) => { setze(g.scene); ok(); }, undefined, () => ok()));
  sportLaden = Promise.all([ld('/modelle/sportwagen.glb', (x) => { sportVorlage = x; }), ld('/modelle/verkehr.glb', (x) => { verkehrVorlage = x; }), ld('/modelle/parken.glb', (x) => { parkVorlage = x; })]);
  return sportLaden;
}
export const verkehrsModell = () => verkehrVorlage;
export const parkModell = () => parkVorlage;
export const SPORT_MASSE = { L: 4.36, W: 2.0, r: 0.31, wheels: [0.87, 3.67], body: [[0, 0.3], [0, 0.95]], cabin: [[1.2, 0.9], [1.8, 1.14], [2.8, 1.14], [3.4, 0.9]] };
const SPORT_T = SPORT_MASSE;
function baueSportwagen(look, M) {
  const tu = look.tuning || {}; const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const car = sportVorlage.clone(true); car.position.z = -0.24; body.add(car);
  const lack = KATALOG.farben[look.farbe] || KATALOG.farben[0]; const fm = mats.felgen[tu.felgen || 0];
  const wheels = []; const raeder = new Map();
  car.traverse((o) => {
    if (!o.isMesh) return; o.castShadow = true; o.receiveShadow = true;
    const n = o.material.name || '';
    if (/^Paint/.test(n)) { o.material = o.material.clone(); o.material.color.set(lack); if (o.material.clearcoat !== undefined) o.material.clearcoat = 1; }
    else if (/^Rim/.test(n) && tu.felgen) o.material = fm;
    else if (/Glass/.test(n)) { o.material = mats.glass[tu.toenung || 0]; }
    else if (/License/.test(n)) o.material = kennzeichenMat(look.kennzeichen || 'VH-VA 100');
    else if (/Headlight/.test(n)) o.material = mats.head; else if (/Brakelight/.test(n)) o.material = mats.tail;
  });
  // Räder: Felge + Reifen + Bremsscheibe um die Radmitte drehen
  car.updateMatrixWorld(true);
  const lst = []; car.traverse((o) => { if (o.isMesh && /^Wheel(Front|Rear)(L|R)(Rim|Tire|BrakeDisc)/.test(o.name)) lst.push(o); });
  for (const o of lst) {
    const key = o.name.match(/^Wheel(Front|Rear)(L|R)/)[0];
    if (!raeder.has(key)) {
      const front = /Front/.test(key), links = /L$/.test(key); const z = (front ? 1.49 : -1.31) - 0.24 + 0.24;
      const g = new THREE.Group(); g.position.set(links ? 0.98 : -0.98, 0.385, z - 0.24); body.add(g); const spin = new THREE.Group(); g.add(spin);
      raeder.set(key, { g, spin, front }); wheels.push(raeder.get(key));
    }
    const R = raeder.get(key); const w = new THREE.Vector3(); o.getWorldPosition(w);
    // Mesh in den Dreh-Knoten umhängen, Weltlage beibehalten
    R.spin.attach(o);
  }
  const tief = (tu.tiefer || 0) * 0.03; car.position.y = -tief;
  const T = SPORT_T; const heckY = 0.95;
  if (tu.spoiler === 1) { const sp = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 0.2), mats.carbon); sp.position.set(0, heckY + 0.02, -T.L / 2 + 0.15); body.add(sp); }
  if (tu.spoiler === 2) { const sp = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.05, 0.34), mats.carbon); sp.position.set(0, heckY + 0.3, -T.L / 2 + 0.25); body.add(sp); for (const s of [-1, 1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.12), mats.carbon); st.position.set(s * 0.5, heckY + 0.15, -T.L / 2 + 0.28); body.add(st); } }
  if (tu.neon) { const nm = new THREE.MeshBasicMaterial({ color: NEON[tu.neon], map: neonTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 }); const n = new THREE.Mesh(new THREE.PlaneGeometry(T.W + 1.4, T.L + 1.2).rotateX(-Math.PI / 2), nm); n.position.y = 0.03; root.add(n); }
  const beam = new THREE.Mesh(BEAM_GEO, mats.beam); beam.position.set(0, 0.04, T.L / 2 + 5.5); root.add(beam);
  root.userData = { type: M.typ, T, wheels, body, M }; return root;
}
import KATALOG from '../../../shared/katalog.json';

export { KATALOG };
const TYPES = {
  kompakt: { L: 3.9, W: 1.76, wheels: [0.75, 3.15], r: 0.32, body: [[0, 0.32], [0, 1.0], [3.45, 0.95], [3.88, 0.8], [3.92, 0.48], [3.85, 0.3]], cabin: [[0.1, 1.0], [0.3, 1.5], [2.45, 1.5], [3.1, 0.98]] },
  kombi: { L: 4.7, W: 1.84, wheels: [0.95, 3.7], r: 0.34, body: [[0, 0.32], [0, 1.0], [4.1, 0.97], [4.62, 0.84], [4.7, 0.5], [4.62, 0.3]], cabin: [[0.12, 1.0], [0.25, 1.46], [3.05, 1.47], [3.7, 1.0]] },
  limousine: { L: 4.8, W: 1.86, wheels: [0.95, 3.8], r: 0.35, body: [[0, 0.32], [0, 0.95], [0.85, 1.02], [4.2, 0.95], [4.75, 0.82], [4.82, 0.5], [4.75, 0.3]], cabin: [[1.05, 0.98], [1.5, 1.42], [3.1, 1.45], [3.75, 0.98]] },
  suv: { L: 4.85, W: 1.98, wheels: [0.95, 3.85], r: 0.43, body: [[0, 0.44], [0, 1.18], [4.25, 1.14], [4.8, 1.02], [4.86, 0.62], [4.78, 0.42]], cabin: [[0.12, 1.18], [0.3, 1.82], [3.25, 1.82], [3.9, 1.16]] },
  sport: { L: 4.5, W: 1.95, wheels: [0.85, 3.55], r: 0.35, body: [[0, 0.3], [0, 0.8], [0.6, 0.86], [3.9, 0.78], [4.42, 0.62], [4.5, 0.42], [4.44, 0.28]], cabin: [[0.85, 0.84], [1.55, 1.2], [2.6, 1.22], [3.3, 0.82]] },
  super: { L: 4.6, W: 2.02, wheels: [0.9, 3.6], r: 0.36, body: [[0, 0.3], [0, 0.84], [0.5, 0.9], [3.7, 0.74], [4.5, 0.5], [4.6, 0.36], [4.5, 0.26]], cabin: [[1.05, 0.88], [1.85, 1.13], [2.65, 1.13], [3.55, 0.76]] },
};
export const MASSE = TYPES;
const geoCache = new Map();
function extrude(points, depth, bevel = 0.05) {
  const s = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 4 });
}
function typeGeos(type) {
  if (geoCache.has(type)) return geoCache.get(type);
  const T = TYPES[type]; const L = T.L, W = T.W;
  const place = (g, w) => { g.translate(-L / 2, 0, -w / 2); g.rotateY(-Math.PI / 2); return g; };
  const body = place(extrude(T.body, W - 0.1), W - 0.1);
  const cabin = place(extrude(T.cabin, W - 0.22, 0.04), W - 0.22);
  const belt = Math.min(...T.cabin.map((p) => p[1])); const top0 = Math.max(...T.cabin.map((p) => p[1]));
  const cp = cabin.attributes.position; for (let i = 0; i < cp.count; i++) { const k = (cp.getY(i) - belt) / Math.max(0.01, top0 - belt); cp.setX(i, cp.getX(i) * (1 - 0.14 * Math.max(0, k))); }
  cabin.computeVertexNormals();
  const cxs = T.cabin.map((p) => p[0]); const roofLen = (Math.max(...cxs) - Math.min(...cxs)) * 0.62;
  const roof = new THREE.BoxGeometry((W - 0.22) * 0.86, 0.07, roofLen); roof.translate(0, top0 + 0.03, -(((Math.min(...cxs) + Math.max(...cxs)) / 2) - L / 2));
  const tire = new THREE.CylinderGeometry(T.r, T.r, 0.27, 20).rotateZ(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(T.r * 0.64, T.r * 0.64, 0.29, 14).rotateZ(Math.PI / 2);
  const speiche = new THREE.BoxGeometry(0.3, T.r * 1.18, 0.06).rotateZ(Math.PI / 2).rotateY(Math.PI / 2);
  const g = { body, cabin, roof, tire, rim, speiche, T,
    headL: new THREE.BoxGeometry(0.42, 0.13, 0.06), tail: new THREE.BoxGeometry(0.4, 0.13, 0.06),
    bumper: new THREE.BoxGeometry(W - 0.02, 0.2, 0.22), plate: new THREE.PlaneGeometry(0.52, 0.12),
    mirror: new THREE.BoxGeometry(0.2, 0.12, 0.1), arch: new THREE.CylinderGeometry(T.r + 0.08, T.r + 0.08, W - 0.06, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2) };
  geoCache.set(type, g); return g;
}
const mats = {
  glass: [new THREE.MeshStandardMaterial({ color: '#1a2633', roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.88 }),
    new THREE.MeshStandardMaterial({ color: '#0c1219', roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.94 }),
    new THREE.MeshStandardMaterial({ color: '#030405', roughness: 0.05, metalness: 0.95 })],
  tire: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.85 }),
  felgen: [new THREE.MeshStandardMaterial({ color: '#b9bec4', roughness: 0.3, metalness: 0.85 }), new THREE.MeshStandardMaterial({ color: '#dfe3e8', roughness: 0.2, metalness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.03, metalness: 1 }), new THREE.MeshStandardMaterial({ color: '#16171a', roughness: 0.65, metalness: 0.4 }), new THREE.MeshStandardMaterial({ color: '#d4af37', roughness: 0.18, metalness: 1 })],
  head: new THREE.MeshStandardMaterial({ color: '#fff7e0', emissive: '#fff2c8', emissiveIntensity: 0.6 }),
  tail: new THREE.MeshStandardMaterial({ color: '#7a0a0a', emissive: '#ff1a1a', emissiveIntensity: 0.4 }),
  plastic: new THREE.MeshStandardMaterial({ color: '#1d1f22', roughness: 0.7 }),
  carbon: new THREE.MeshStandardMaterial({ color: '#111214', roughness: 0.35, metalness: 0.5 }),
  beam: (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 128, 4, 32, 90, 90); gr.addColorStop(0, 'rgba(255,245,215,0.95)'); gr.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }); })(),
};
const NEON = [null, '#2a7bff', '#ff2030', '#20ff70', '#b030ff', '#ffffff'];
const neonTex = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const paint = new Map();
function paintMat(color) {
  if (!paint.has(color)) paint.set(color, new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, metalness: 0.55, clearcoat: 0.9, clearcoatRoughness: 0.12 }));
  return paint.get(color);
}
const BEAM_GEO = new THREE.PlaneGeometry(4.2, 11).rotateX(-Math.PI / 2);
export function setAutoNacht(n) { mats.beam.opacity = n * 0.5; mats.head.emissiveIntensity = 0.6 + n * 3; mats.tail.emissiveIntensity = 0.4 + n * 1.6; }

// Deutsches Kennzeichen-Design: blauer Streifen mit "VH", schwarze Schrift
const schildCache = new Map();
export function kennzeichenMat(text) {
  if (schildCache.has(text)) return schildCache.get(text);
  const c = document.createElement('canvas'); c.width = 520; c.height = 120; const g = c.getContext('2d');
  g.fillStyle = '#f4f4ef'; g.fillRect(0, 0, 520, 120); g.strokeStyle = '#111'; g.lineWidth = 6; g.strokeRect(3, 3, 514, 114);
  g.fillStyle = '#0a3a9e'; g.fillRect(6, 6, 56, 108); g.fillStyle = '#ffd400';
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.arc(34 + Math.cos(a) * 15, 40 + Math.sin(a) * 15, 2.6, 0, 7); g.fill(); }
  g.fillStyle = '#fff'; g.font = '700 30px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('VH', 34, 100);
  g.fillStyle = '#111'; g.font = '700 78px "DIN Alternate", "Oxanium", Inter, sans-serif'; g.textBaseline = 'middle'; g.fillText(text.replace(/^VH-/, 'VH '), 292, 64, 430);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.4 }); schildCache.set(text, m); return m;
}

// look: { modell, farbe (Index), kennzeichen, tuning: { felgen, tiefer, spoiler, neon, toenung } }
export function baueAuto(look) {
  const M = KATALOG.modelle[look.modell] || KATALOG.modelle.kompakt; const type = M.typ;
  if ((type === 'sport' || type === 'super') && sportVorlage) return baueSportwagen(look, M);
  const G = typeGeos(type); const T = G.T; const tu = look.tuning || {};
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const add = (geo, m, parent = body) => { const x = new THREE.Mesh(geo, m); x.castShadow = true; x.receiveShadow = true; parent.add(x); return x; };
  const bm = paintMat(KATALOG.farben[look.farbe] || KATALOG.farben[0]);
  add(G.body, bm); add(G.cabin, mats.glass[tu.toenung || 0]); add(G.roof, bm);
  const tief = (tu.tiefer || 0) * 0.03; body.position.y = -tief;
  const wheels = []; const fm = mats.felgen[tu.felgen || 0];
  for (const u of T.wheels) for (const s of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(s * (T.W / 2 - 0.16), T.r, u - T.L / 2); root.add(w);
    const spin = new THREE.Group(); w.add(spin); add(G.tire, mats.tire, spin); add(G.rim, fm, spin);
    if (tu.felgen) for (let k = 0; k < 5; k++) { const sp = add(G.speiche, fm, spin); sp.rotation.x = (k / 5) * Math.PI; sp.position.x = s * 0.02; }
    wheels.push({ g: w, spin, front: u > T.L / 2 });
  }
  const yL = T.body[1][1] - 0.25;
  for (const s of [-1, 1]) {
    add(G.headL, mats.head).position.set(s * (T.W / 2 - 0.32), yL, T.L / 2 + 0.02);
    add(G.tail, mats.tail).position.set(s * (T.W / 2 - 0.3), yL + 0.08, -T.L / 2 - 0.02);
  }
  const beam = new THREE.Mesh(BEAM_GEO, mats.beam); beam.position.set(0, 0.04, T.L / 2 + 5.5); root.add(beam);
  const yb = T.r * 0.8; const schild = kennzeichenMat(look.kennzeichen || 'VH-VA 100');
  for (const s of [1, -1]) {
    add(G.bumper, mats.plastic).position.set(0, yb, s * (T.L / 2 - 0.05));
    const pl = new THREE.Mesh(G.plate, schild); pl.position.set(0, yb + 0.02, s * (T.L / 2 + 0.065)); if (s < 0) pl.rotation.y = Math.PI; body.add(pl);
  }
  const cabFront = Math.max(...T.cabin.map((p) => p[0])) - T.L / 2; const belt = Math.min(...T.cabin.map((p) => p[1]));
  for (const s of [-1, 1]) add(G.mirror, bm).position.set(s * (T.W / 2 + 0.02), belt + 0.08, cabFront - 0.15);
  for (const u of T.wheels) add(G.arch, mats.plastic).position.set(0, T.r, u - T.L / 2);
  // Spoiler
  const heckY = T.body[1][1];
  if (tu.spoiler === 1) add(new THREE.BoxGeometry(T.W - 0.3, 0.05, 0.22), mats.carbon).position.set(0, heckY + 0.03, -T.L / 2 + 0.15);
  if (tu.spoiler === 2) {
    add(new THREE.BoxGeometry(T.W - 0.1, 0.05, 0.36), mats.carbon).position.set(0, heckY + 0.38, -T.L / 2 + 0.2);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.05, 0.36, 0.14), mats.carbon).position.set(s * (T.W / 2 - 0.4), heckY + 0.18, -T.L / 2 + 0.25);
  }
  // Unterbodenbeleuchtung
  if (tu.neon) {
    const nm = new THREE.MeshBasicMaterial({ color: NEON[tu.neon], map: neonTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 });
    const n = new THREE.Mesh(new THREE.PlaneGeometry(T.W + 1.4, T.L + 1.2).rotateX(-Math.PI / 2), nm); n.position.y = 0.03; root.add(n);
    const leiste = new THREE.Mesh(new THREE.BoxGeometry(T.W - 0.3, 0.03, T.L - 0.8), new THREE.MeshBasicMaterial({ color: NEON[tu.neon] })); leiste.position.y = T.r * 0.55 - tief; root.add(leiste);
  }
  root.userData = { type, T, wheels, body, M };
  verschmelze(root);
  return root;
}
export function entsorge(root) { root.traverse((o) => { if (o.isMesh && o.material?.blending === THREE.AdditiveBlending && o.material !== mats.beam) { o.material.dispose(); o.geometry.dispose(); } }); }
