// Die Stadt Valenheim (Version 1): 7×7 Blöcke à 80 m, sechs Viertel, begehbar, mit Kollision.
import * as THREE from 'three';
import { Builder } from './geo.js';
import * as TX from './textures.js';
import { rng } from './textures.js';

export const BLOCK = 80, HALF = 34, BUILD = 31, ROAD_HALF = 6, SLAB = 0.15;
export const CENTERS = [-240, -160, -80, 0, 80, 160, 240];
export const ROADS = [-280, -200, -120, -40, 40, 120, 200, 280];
export const BOUNDS = 326;

// ---------- Viertel ----------
export const DISTRICTS = {
  zentrum: { name: 'Stadtzentrum', farbe: '#d4af37' },
  wohnen: { name: 'Wohnviertel', farbe: '#7fb069' },
  krankenhaus: { name: 'Krankenhausviertel', farbe: '#e05a5a' },
  bahnhof: { name: 'Bahnhof', farbe: '#5fa8d3' },
  militaer: { name: 'Militärgelände', farbe: '#8a8f6a' },
  industrie: { name: 'Industriegebiet', farbe: '#c08a4a' },
};
export function districtOfBlock(i, j) {
  if (j === -3 && Math.abs(i) <= 1) return 'militaer';
  if (i === -3 && Math.abs(j) <= 1) return 'bahnhof';
  if (i >= 2 && (j === -1 || j === 0)) return 'krankenhaus';
  if (i <= -2 && j >= 2) return 'industrie';
  if (j >= 2 || (j === 1 && i >= 2) || (Math.abs(i) >= 2 && j <= -2)) return 'wohnen';
  return 'zentrum';
}
const idx = (v) => Math.round(v / BLOCK);
export function districtAt(x, z) {
  if (x < -284) return 'bahnhof';
  const i = Math.max(-3, Math.min(3, idx(x))), j = Math.max(-3, Math.min(3, idx(z)));
  return districtOfBlock(i, j);
}

// ---------- Kollision (achsenparallele Boxen, Raster für schnelle Suche) ----------
export class Colliders {
  constructor() { this.list = []; this.grid = new Map(); this.cell = 20; }
  add(x0, z0, x1, z1, h = 30, tag = '') {
    const b = { x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), h, tag };
    this.list.push(b);
    const c = this.cell;
    for (let gx = Math.floor(b.x0 / c); gx <= Math.floor(b.x1 / c); gx++)
      for (let gz = Math.floor(b.z0 / c); gz <= Math.floor(b.z1 / c); gz++) {
        const k = gx + ',' + gz; if (!this.grid.has(k)) this.grid.set(k, []); this.grid.get(k).push(b);
      }
    return b;
  }
  near(x, z, r = 1) {
    const c = this.cell, out = new Set();
    for (let gx = Math.floor((x - r) / c); gx <= Math.floor((x + r) / c); gx++)
      for (let gz = Math.floor((z - r) / c); gz <= Math.floor((z + r) / c); gz++) for (const b of this.grid.get(gx + ',' + gz) || []) out.add(b);
    return out;
  }
  // Kreis (Spieler) aus Boxen herausschieben
  resolve(p, r, y = 0) {
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const b of this.near(p.x, p.z, r + 1)) {
        if (y > b.h) continue;
        const cx = Math.max(b.x0, Math.min(p.x, b.x1)), cz = Math.max(b.z0, Math.min(p.z, b.z1));
        let dx = p.x - cx, dz = p.z - cz; const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 < 1e-8) { // Mittelpunkt in der Box: zur nächsten Kante schieben
          const opts = [[p.x - b.x0, -1, 0], [b.x1 - p.x, 1, 0], [p.z - b.z0, 0, -1], [b.z1 - p.z, 0, 1]].sort((a, c) => a[0] - c[0]);
          const [dist, sx, sz] = opts[0]; p.x += sx * (dist + r); p.z += sz * (dist + r);
        } else { const d = Math.sqrt(d2); p.x += (dx / d) * (r - d); p.z += (dz / d) * (r - d); }
        moved = true;
      }
      if (!moved) break;
    }
    p.x = Math.max(-BOUNDS, Math.min(BOUNDS, p.x)); p.z = Math.max(-BOUNDS, Math.min(BOUNDS, p.z));
  }
  // Ist ein Punkt in einem Hindernis? (für Kamera)
  blocked(x, y, z) {
    for (const b of this.near(x, z, 0.5)) if (y < b.h && x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return true;
    return false;
  }
}

export function groundHeight(x, z) {
  if (x < -284) return Math.abs(x + 307) < 14 && Math.abs(z) < 118 ? 0.9 : 0; // Bahnsteig
  const i = idx(x), j = idx(z);
  if (Math.abs(i) > 3 || Math.abs(j) > 3) return 0;
  return Math.abs(x - i * BLOCK) <= HALF && Math.abs(z - j * BLOCK) <= HALF ? SLAB : 0;
}

// ---------- Materialien ----------
function makeMaterials() {
  const M = {};
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...o });
  TX.FACADE_STYLES.forEach((s, i) => {
    M['fac' + i] = std({ map: TX.facadeTexture(i), roughness: 0.82, emissive: '#ffffff', emissiveMap: TX.facadeNightTexture(i), emissiveIntensity: 0 });
    M['fac' + i + ':giebel'] = std({ color: s.wall, roughness: 0.9 });
  });
  for (let i = 0; i < 6; i++) M['shop' + i] = std({ map: TX.shopTexture(i), roughness: 0.6 });
  M.roof = std({ map: TX.roofTexture(), roughness: 0.75 });
  M['roof:giebel'] = std({ color: '#cbbfa8' });
  M.flatroof = std({ map: TX.flatRoofTexture(), roughness: 0.95 });
  M.asphalt = std({ map: TX.asphaltTexture(), roughness: 0.92 });
  M.sidewalk = std({ map: TX.pavingTexture(), roughness: 0.9 });
  M.plaza = std({ map: TX.plazaTexture(), roughness: 0.88 });
  M.grass = std({ map: TX.grassTexture(), roughness: 1 });
  M.gravel = std({ map: TX.gravelTexture(), roughness: 1 });
  M.concrete = std({ map: TX.concreteTexture(), roughness: 0.9 });
  M.curb = std({ color: '#b3aea4', roughness: 0.85 });
  M.white = std({ color: '#e8e6df', roughness: 0.7 });
  M.paint = std({ color: '#ffffff', roughness: 0.55, vertexColors: true });
  M.metal = std({ color: '#3b4046', roughness: 0.45, metalness: 0.7 });
  M.steel = std({ color: '#a7adb3', roughness: 0.35, metalness: 0.8 });
  M.glass = std({ color: '#8fb0c8', roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.55, envMapIntensity: 1.5 });
  M.glass.userData.noShadow = true;
  M.corr = std({ map: TX.corrugatedTexture('#8d969c'), roughness: 0.55, metalness: 0.45 });
  M.corrBlue = std({ map: TX.corrugatedTexture('#3d5f82'), roughness: 0.55, metalness: 0.4 });
  M.corrGreen = std({ map: TX.corrugatedTexture('#5d6b45'), roughness: 0.7, metalness: 0.3 });
  M.stone = std({ color: '#d8d0bf', roughness: 0.75 });
  M.stoneDark = std({ color: '#a59c88', roughness: 0.8 });
  M.water = std({ color: '#3d6a7d', roughness: 0.05, metalness: 0.3 });
  M.rail = std({ color: '#6b6560', roughness: 0.4, metalness: 0.8 });
  M.sleeper = std({ color: '#4a3b2e', roughness: 0.95 });
  M.camo = std({ color: '#55603f', roughness: 0.85 });
  M.redcross = std({ color: '#d42a2a', roughness: 0.5, emissive: '#ff2020', emissiveIntensity: 0.15 });
  M.gold = std({ color: '#d4af37', roughness: 0.3, metalness: 0.9 });
  return M;
}

// ---------- Stadt bauen ----------
export function buildCity(scene, quality = 'mittel') {
  const M = makeMaterials();
  const B = new Builder();
  const col = new Colliders();
  const pois = [];
  const r = rng(7071);
  const trees = [], lamps = [], cars = [], benches = [], bins = [];
  const signs = [];
  const flagpoles = [], ambulances = [], trains = [], trucks = [], milTrucks = [], fenceSegs = [], forest = [];

  // ---- Boden: Asphalt, Gehwege (Blockplatten), Bordsteine ----
  B.plane('asphalt', -330, -330, -284, 330, 0, 10); // wird unten teils mit Kies überdeckt
  B.plane('asphalt', -284, -330, 330, 330, 0, 10);
  for (const ci of CENTERS) for (const cj of CENTERS) {
    const i = idx(ci), j = idx(cj); const d = districtOfBlock(i, j);
    const top = (i === 0 && j === 0) ? 'plaza' : 'sidewalk';
    B.box('curb', ci - HALF, 0, cj - HALF, ci + HALF, SLAB, cj + HALF, { top, topTile: top === 'plaza' ? 12 : 4 });
    if (d === 'industrie') B.plane('concrete', ci - BUILD, cj - BUILD, ci + BUILD, cj + BUILD, SLAB + 0.01, 8);
  }
  // Straßenmarkierungen: Mittelstreifen (gestrichelt) + Zebrastreifen im Zentrum
  for (const rx of ROADS) for (let s = -326; s < 326; s += 6) {
    const onCross = ROADS.some((rz) => Math.abs(s + 1.5 - rz) < 8);
    if (onCross) continue;
    B.plane('white', rx - 0.08, s, rx + 0.08, s + 3, 0.012, 1);
    B.plane('white', s, rx - 0.08, s + 3, rx + 0.08, 0.012, 1);
  }
  for (const rx of [-120, -40, 40, 120]) for (const rz of [-120, -40, 40, 120]) {
    for (let k = -5; k <= 5; k += 1.2) {
      B.plane('white', rx + k - 0.3, rz - 10.5, rx + k + 0.3, rz - 7.5, 0.013, 1);
      B.plane('white', rx + k - 0.3, rz + 7.5, rx + k + 0.3, rz + 10.5, 0.013, 1);
      B.plane('white', rx - 10.5, rz + k - 0.3, rx - 7.5, rz + k + 0.3, 0.013, 1);
      B.plane('white', rx + 7.5, rz + k - 0.3, rx + 10.5, rz + k + 0.3, 0.013, 1);
    }
  }
  // Grünstreifen am Stadtrand
  B.plane('grass', -330, -330, 330, -284, 0.01, 8);
  B.plane('grass', -284, 284, 330, 330, 0.01, 8);
  B.plane('grass', 284, -284, 330, 284, 0.01, 8);

  // ---- Gebäude-Helfer ----
  const FLOOR = 3.2;
  function building(x0, z0, x1, z1, floors, o = {}) {
    const style = o.style ?? Math.floor(r() * TX.FACADE_STYLES.length);
    const fac = 'fac' + style; const y0 = SLAB;
    const shopH = o.shop ? 4.4 : 0;
    if (o.shop) B.box('shop' + (o.shopStyle ?? Math.floor(r() * 6)), x0, y0, z0, x1, y0 + shopH, z1, { tileW: 12, tileH: 4.4, top: null, uOffset: r() });
    const h = shopH + floors * FLOOR;
    B.box(fac, x0, y0 + shopH, z0, x1, y0 + h, z1, { tileW: 12, tileH: 12.8, top: o.pitched ? null : 'flatroof', topTile: 6, uOffset: Math.floor(r() * 4) * 3 / 12 });
    // Traufgesims
    B.box('fac' + style + ':giebel', x0 - 0.25, y0 + h - 0.35, z0 - 0.25, x1 + 0.25, y0 + h, z1 + 0.25, { top: o.pitched ? null : 'flatroof' });
    if (o.pitched) B.gable('roof', x0 - 0.3, z0 - 0.3, x1 + 0.3, z1 + 0.3, y0 + h, Math.min(5, Math.min(x1 - x0, z1 - z0) * 0.32), o.alongX, 4);
    else { // Dachaufbauten
      if (x1 - x0 > 8 && z1 - z0 > 8 && r() < 0.6) B.box('concrete', (x0 + x1) / 2 - 1.5, y0 + h, (z0 + z1) / 2 - 1.2, (x0 + x1) / 2 + 1.5, y0 + h + 2.2, (z0 + z1) / 2 + 1.2, { topTile: 4 });
      B.box('fac' + style + ':giebel', x0, y0 + h, z0, x1, y0 + h + 0.7, z0 + 0.3, { top: null }); B.box('fac' + style + ':giebel', x0, y0 + h, z1 - 0.3, x1, y0 + h + 0.7, z1, { top: null });
    }
    col.add(x0, z0, x1, z1, y0 + h + (o.pitched ? 5 : 1));
    return y0 + h;
  }

  // Blockrandbebauung (europäischer Stil): Gebäude entlang der vier Seiten, Innenhof frei
  function perimeterBlock(cx, cz, o = {}) {
    const depth = o.depth || 12; const minF = o.minF || 4, maxF = o.maxF || 6;
    const x0 = cx - BUILD, x1 = cx + BUILD, z0 = cz - BUILD, z1 = cz + BUILD;
    const side = (a0, a1, fn) => { let a = a0; while (a < a1 - 0.1) { let w = 10 + Math.floor(r() * 3) * 3; if (a1 - a - w < 9) w = a1 - a; fn(a, a + w); a += w; } };
    const opts = () => ({ shop: o.shops && r() < 0.85, pitched: o.pitched ?? r() < 0.5, style: o.styles ? o.styles[Math.floor(r() * o.styles.length)] : undefined });
    side(x0, x1, (a, b) => building(a, z1 - depth, b, z1, minF + Math.floor(r() * (maxF - minF + 1)), { ...opts(), alongX: true }));
    side(x0, x1, (a, b) => building(a, z0, b, z0 + depth, minF + Math.floor(r() * (maxF - minF + 1)), { ...opts(), alongX: true }));
    side(z0 + depth, z1 - depth, (a, b) => building(x0, a, x0 + depth, b, minF + Math.floor(r() * (maxF - minF + 1)), { ...opts(), alongX: false }));
    side(z0 + depth, z1 - depth, (a, b) => building(x1 - depth, a, x1, b, minF + Math.floor(r() * (maxF - minF + 1)), { ...opts(), alongX: false }));
    // Innenhof: Rasen + Bäume
    B.plane('grass', x0 + depth, z0 + depth, x1 - depth, z1 - depth, SLAB + 0.01, 6);
    for (let k = 0; k < 3; k++) trees.push([cx + (r() - 0.5) * 24, cz + (r() - 0.5) * 24, 0.8 + r() * 0.5]);
  }

  // Straßenbäume, Laternen, Autos entlang eines Blocks
  function streetDressing(cx, cz, { treesOn = false, carsOn = true } = {}) {
    const e = HALF - 1.4; // Abstand Gehwegkante
    for (const [dx, dz, rot] of [[0, 1, 0], [0, -1, Math.PI], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2]]) {
      for (let s = -24; s <= 24; s += 24) {
        const x = cx + (dx ? dx * e : s), z = cz + (dz ? dz * e : s);
        lamps.push([x, z, rot]); col.add(x - 0.15, z - 0.15, x + 0.15, z + 0.15, 6, 'laterne');
      }
      if (treesOn) for (let s = -18; s <= 18; s += 12) trees.push([cx + (dx ? dx * (e - 0.6) : s + 6), cz + (dz ? dz * (e - 0.6) : s + 6), 0.9 + r() * 0.3]);
      if (carsOn) for (let s = -20; s <= 20; s += 7) if (r() < 0.45) {
        const off = HALF + 1.4; // Parkstreifen auf der Fahrbahn
        cars.push([cx + (dx ? dx * off : s), cz + (dz ? dz * off : s), (dx ? 0 : Math.PI / 2) + (r() < 0.5 ? Math.PI : 0), Math.floor(r() * 8)]);
      }
    }
  }

  // ---- Blöcke nach Viertel ----
  for (const cx of CENTERS) for (const cz of CENTERS) {
    const i = idx(cx), j = idx(cz); const d = districtOfBlock(i, j);
    if (i === 0 && j === 0) { rathausplatz(); continue; }
    if (d === 'militaer') continue; // wird gesamt gebaut
    if (d === 'bahnhof' && j === 0) { bahnhof(cx, cz); continue; }
    if (i === 2 && j === -1) { krankenhaus(cx, cz); continue; }
    if (i === 3 && j === -1) { rettungsstation(cx, cz); continue; }
    if (i === 1 && j === 2) { park(cx, cz); continue; }
    if (d === 'industrie') { industrie(cx, cz, i, j); continue; }
    if (d === 'wohnen') {
      if (j === 3 && i >= 1) { reihenhaeuser(cx, cz); streetDressing(cx, cz, { treesOn: true }); continue; }
      perimeterBlock(cx, cz, { minF: 3, maxF: 5, pitched: true, shops: j === 2 && r() < 0.3, styles: [0, 1, 3, 4, 5] });
      streetDressing(cx, cz, { treesOn: true }); continue;
    }
    // Zentrum / Krankenhausviertel / Bahnhof-Rand: höhere Blockrandbebauung mit Läden
    perimeterBlock(cx, cz, { minF: 4, maxF: Math.abs(i) + Math.abs(j) <= 1 ? 7 : 6, shops: true, pitched: false, styles: d === 'krankenhaus' ? [2, 6, 0] : [0, 1, 2, 3, 4, 6] });
    streetDressing(cx, cz, { treesOn: Math.abs(i) <= 1 });
  }
  militaer();
  bahngleise();
  stadtrand();

  // ================== Sonderorte ==================
  function rathausplatz() {
    pois.push({ id: 'rathaus', name: 'Rathaus', x: 0, z: -22, district: 'zentrum' });
    // Rathaus: neoklassisch mit Uhrturm, Säulen und Freitreppe
    const y0 = SLAB, x0 = -22, x1 = 22, z0 = -33, z1 = -14;
    B.box('stone', x0, y0, z0, x1, y0 + 1.2, z1, { topTile: 4 });                       // Sockel
    B.box('fac0', x0 + 0.5, y0 + 1.2, z0 + 0.5, x1 - 0.5, y0 + 15, z1 - 0.5, { tileW: 12, tileH: 12.8, top: 'flatroof', topTile: 6 });
    B.box('stone', x0, y0 + 15, z0, x1, y0 + 16.2, z1, { topTile: 4 });                  // Gesims
    B.box('roof', x0 + 1, y0 + 16.2, z0 + 1, x1 - 1, y0 + 17, z1 - 1, { tileW: 4, tileH: 4, topTile: 4 });
    // Portikus mit 6 Säulen
    const pz = z1 + 4.5;
    B.box('stone', -11, y0, z1 - 0.5, 11, y0 + 1.2, pz, { topTile: 4 });
    for (let k = 0; k < 4; k++) B.box('stone', -11 - k * 0.0, y0 - 0.0, pz + k * 0.7, 11, y0 + 1.2 - (k + 1) * 0.3, pz + (k + 1) * 0.7, { topTile: 4 }); // Treppe
    const colGeo = new THREE.CylinderGeometry(0.55, 0.62, 10.6, 14);
    for (let k = 0; k < 6; k++) { const m = new THREE.Matrix4().makeTranslation(-9 + k * 3.6, y0 + 1.2 + 5.3, pz - 1); B.geometry('stone', colGeo, m); col.add(-9 + k * 3.6 - 0.6, pz - 1.6, -9 + k * 3.6 + 0.6, pz - 0.4, 12); }
    B.box('stone', -11, y0 + 11.8, z1 - 0.5, 11, y0 + 13.2, pz, { topTile: 4 });
    B.gable('stone', -11, z1 - 0.5, 11, pz, y0 + 13.2, 3.4, true, 4);
    // Uhrturm
    B.box('stone', -4, y0 + 17, z0 + 6, 4, y0 + 30, z0 + 14, { topTile: 4 });
    B.box('fac0:giebel', -4.3, y0 + 30, z0 + 5.7, 4.3, y0 + 31, z0 + 14.3);
    B.geometry('roof', new THREE.ConeGeometry(5.6, 8, 4, 1).rotateY(Math.PI / 4), new THREE.Matrix4().makeTranslation(0, y0 + 35, z0 + 10));
    signs.push({ tex: TX.signTexture('RATHAUS VALENHEIM', { bg: '#efe6d2', fg: '#1a2a44', accent: '#d4af37' }), x: 0, y: y0 + 12.5, z: pz + 0.05, w: 12, h: 1.4, ry: 0 });
    // Uhr
    const clock = TX.signTexture('XII', { bg: '#f5f2e8', fg: '#222', accent: '#d4af37', w: 256, h: 256 });
    signs.push({ tex: clock, x: 0, y: y0 + 27, z: z0 + 14.06, w: 3.2, h: 3.2, ry: 0, round: true });
    col.add(x0, z0, x1, z1, 40, 'rathaus');
    // Platz: Brunnen, Fahnenmast, Bäume, Bänke
    const fy = SLAB;
    B.geometry('stone', new THREE.CylinderGeometry(6, 6.3, 0.8, 40), new THREE.Matrix4().makeTranslation(0, fy + 0.4, 8));
    B.geometry('water', new THREE.CylinderGeometry(5.5, 5.5, 0.1, 40), new THREE.Matrix4().makeTranslation(0, fy + 0.72, 8));
    B.geometry('stone', new THREE.CylinderGeometry(0.8, 1.1, 2.8, 16), new THREE.Matrix4().makeTranslation(0, fy + 1.6, 8));
    B.geometry('stone', new THREE.CylinderGeometry(2.2, 1.2, 0.5, 24), new THREE.Matrix4().makeTranslation(0, fy + 3.1, 8));
    col.add(-6, 2, 6, 14, 1, 'brunnen');
    pois.push({ id: 'brunnen', name: 'Brunnen am Rathausplatz', x: 0, z: 8, district: 'zentrum' });
    flagpoles.push([-14, -6], [14, -6]);
    for (const [x, z] of [[-26, 0], [-26, 14], [-26, 26], [26, 0], [26, 14], [26, 26], [-14, 28], [14, 28]]) trees.push([x, z, 1.1]);
    for (const [x, z, ry] of [[-10, 18, 0], [10, 18, 0], [-18, 8, Math.PI / 2], [18, 8, -Math.PI / 2]]) benches.push([x, z, ry]);
    streetDressing(0, 0, { carsOn: false });
  }

  function krankenhaus(cx, cz) {
    pois.push({ id: 'krankenhaus', name: 'Krankenhaus Valenheim', x: cx - 4, z: cz + 18, district: 'krankenhaus' });
    const y0 = SLAB;
    // Hauptgebäude (modern, weiß) + Flügel
    B.box('fac6', cx - 28, y0, cz - 22, cx + 20, y0 + 22, cz + 10, { tileW: 12, tileH: 12.8, top: 'flatroof', topTile: 6 });
    col.add(cx - 28, cz - 22, cx + 20, cz + 10, 23);
    B.box('fac6', cx - 28, y0, cz + 10, cx - 12, y0 + 12, cz + 28, { tileW: 12, tileH: 12.8, top: 'flatroof', topTile: 6 });
    col.add(cx - 28, cz + 10, cx - 12, cz + 28, 13);
    // Eingangsvordach
    B.box('white', cx - 10, y0 + 4, cz + 10, cx + 6, y0 + 4.5, cz + 17);
    for (const x of [cx - 9.5, cx + 5.5]) { B.box('steel', x - 0.2, y0, cz + 16.3, x + 0.2, y0 + 4, cz + 16.7); col.add(x - 0.3, cz + 16.2, x + 0.3, cz + 16.8, 4); }
    B.box('glass', cx - 8, y0, cz + 9.6, cx + 4, y0 + 3.8, cz + 10.2);
    // Rotes Kreuz an der Fassade
    B.box('redcross', cx - 1.2 - 4, y0 + 13, cz + 10.05, cx + 1.2 - 4, y0 + 19, cz + 10.3);
    B.box('redcross', cx - 3 - 4, y0 + 14.8, cz + 10.05, cx + 3 - 4, y0 + 17.2, cz + 10.3);
    signs.push({ tex: TX.signTexture('KRANKENHAUS VALENHEIM', { bg: '#ffffff', fg: '#c41f1f', accent: '#c41f1f' }), x: cx - 2, y: y0 + 5.4, z: cz + 17.1, w: 13, h: 1.3, ry: 0 });
    signs.push({ tex: TX.signTexture('NOTAUFNAHME', { bg: '#c41f1f', fg: '#ffffff', accent: '#ffffff' }), x: cx - 20, y: y0 + 9, z: cz + 28.1, w: 7, h: 1.1, ry: 0 });
    // Hubschrauberlandeplatz auf dem Dach
    B.geometry('concrete', new THREE.CylinderGeometry(7, 7, 0.3, 32), new THREE.Matrix4().makeTranslation(cx + 6, y0 + 22.2, cz - 6));
    signs.push({ tex: TX.signTexture('H', { bg: '#3a3d40', fg: '#ffffff', accent: '#3a3d40', w: 256, h: 256 }), x: cx + 6, y: y0 + 22.4, z: cz - 6, w: 6, h: 6, rx: -Math.PI / 2 });
    // Parkplatz
    for (let k = 0; k < 6; k++) cars.push([cx + 10 + (k % 3) * 6, cz + 22 + Math.floor(k / 3) * 6, 0, k]);
    streetDressing(cx, cz, { treesOn: true, carsOn: false });
  }

  function rettungsstation(cx, cz) {
    pois.push({ id: 'rettung', name: 'Rettungsstation', x: cx, z: cz + 14, district: 'krankenhaus' });
    const y0 = SLAB;
    B.box('fac2', cx - 24, y0, cz - 6, cx + 24, y0 + 8, cz + 8, { tileW: 12, tileH: 12.8, top: 'flatroof', topTile: 6 });
    col.add(cx - 24, cz - 6, cx + 24, cz + 8, 9);
    for (let k = 0; k < 4; k++) { const x = cx - 18 + k * 12; B.box('redcross', x - 4, y0, cz + 8, x + 4, y0 + 5, cz + 8.15, { top: null });
      B.box('white', x - 4, y0 + 4.6, cz + 8.1, x + 4, y0 + 5, cz + 8.3); }
    signs.push({ tex: TX.signTexture('RETTUNGSSTATION', { bg: '#ffffff', fg: '#c41f1f', accent: '#f2a900' }), x: cx, y: y0 + 6.6, z: cz + 8.2, w: 16, h: 1.4, ry: 0 });
    B.box('fac2', cx + 16, y0, cz - 20, cx + 24, y0 + 16, cz - 12, { tileW: 12, tileH: 12.8 }); col.add(cx + 16, cz - 20, cx + 24, cz - 12, 17);
    ambulances.push([cx - 18, cz + 14, 0], [cx - 6, cz + 14, 0], [cx + 6, cz + 20, Math.PI / 2]);
    perimeterLite(cx, cz - 22);
    streetDressing(cx, cz, { carsOn: false });
  }
  function perimeterLite(cx, cz) { building(cx - 28, cz - 9, cx + 8, cz, 4, { style: 6 }); }

  function bahnhof(cx, cz) {
    pois.push({ id: 'bahnhof', name: 'Hauptbahnhof', x: cx + 12, z: cz, district: 'bahnhof' });
    const y0 = SLAB;
    // Empfangsgebäude (Backstein/Stein), Vorplatz nach Osten
    B.box('fac3', cx - 30, y0, cz - 26, cx, y0 + 16, cz + 26, { tileW: 12, tileH: 12.8, top: 'flatroof', topTile: 6 });
    B.box('stone', cx - 0.4, y0, cz - 8, cx + 0.6, y0 + 20, cz + 8);
    B.gable('roof', cx - 30, cz - 26, cx, cz + 26, y0 + 16, 5, false, 4);
    // Mittelhalle mit großem Bogenfenster (Glas)
    B.box('glass', cx + 0.6, y0 + 3, cz - 6, cx + 0.8, y0 + 16, cz + 6);
    B.box('stone', cx + 0.6, y0, cz - 8, cx + 2.5, y0 + 3.6, cz + 8, { topTile: 4 });
    col.add(cx - 30, cz - 26, cx + 1, cz + 26, 22, 'bahnhof');
    signs.push({ tex: TX.signTexture('HAUPTBAHNHOF', { bg: '#0b1a33', fg: '#ffffff', accent: '#d4af37' }), x: cx + 0.9, y: y0 + 17.8, z: cz, w: 14, h: 2, ry: Math.PI / 2 });
    // Bahnhofsuhr-Turm
    B.box('fac3', cx - 6, y0, cz + 26, cx + 2, y0 + 30, cz + 32, { tileW: 12, tileH: 12.8 }); col.add(cx - 6, cz + 26, cx + 2, cz + 32, 31);
    B.geometry('roof', new THREE.ConeGeometry(5.2, 6, 4, 1).rotateY(Math.PI / 4), new THREE.Matrix4().makeTranslation(cx - 2, y0 + 33, cz + 29));
    // Vorplatz
    B.plane('plaza', cx + 2.5, cz - 31, cx + 31, cz + 31, SLAB + 0.01, 12);
    for (const [x, z] of [[cx + 26, cz - 20], [cx + 26, cz - 6], [cx + 26, cz + 8], [cx + 26, cz + 22]]) trees.push([x, z, 1]);
    for (let k = 0; k < 4; k++) cars.push([cx + 14, cz - 24 + k * 6, Math.PI / 2, 7]); // Taxis
    benches.push([cx + 18, cz + 14, Math.PI], [cx + 18, cz - 14, Math.PI]);
    streetDressing(cx, cz, { carsOn: false });
  }

  function bahngleise() {
    // Bahnsteig, Gleise (4), Bahnsteigdach – westlich der Ringstraße
    const y = 0.9;
    B.box('curb', -321, 0, -118, -293, y, 118, { top: 'sidewalk', topTile: 4 });
    for (const x of [-321.2, -293]) B.box('white', x - 0.01 + (x < -300 ? 0 : -0.4), y, -118, x + 0.4, y + 0.02, 118, { top: 'white' });
    for (const gx of [-326, -288]) {
      for (const dx of [-0.75, 0.75]) B.box('rail', gx + dx - 0.05, 0, -330, gx + dx + 0.05, 0.25, 330, { top: 'rail' });
      for (let z = -330; z < 330; z += 1) B.box('sleeper', gx - 1.3, 0, z, gx + 1.3, 0.12, z + 0.3, { top: 'sleeper' });
      B.plane('gravel', gx - 2.2, -330, gx + 2.2, 330, 0.02, 4);
    }
    // Dach
    B.box('metal', -318, y + 4.6, -100, -296, y + 5.0, 100, { top: 'corr', topTile: 4 });
    for (let z = -96; z <= 96; z += 16) { B.box('metal', -307.3, y, z - 0.25, -306.7, y + 4.6, z + 0.25); col.add(-307.5, z - 0.4, -306.5, z + 0.4, 6); }
    signs.push({ tex: TX.signTexture('GLEIS 1 · 2', { bg: '#1b3f73', fg: '#ffffff', accent: '#ffffff' }), x: -307, y: y + 3.6, z: -40, w: 4, h: 0.7, ry: Math.PI / 2 });
    signs.push({ tex: TX.signTexture('GLEIS 1 · 2', { bg: '#1b3f73', fg: '#ffffff', accent: '#ffffff' }), x: -307, y: y + 3.6, z: 40, w: 4, h: 0.7, ry: Math.PI / 2 });
    for (let z = -88; z <= 88; z += 22) benches.push([-302, z, Math.PI / 2, y]);
    // Kanten der Bahnsteige (nicht ins Gleis fallen)
    col.add(-330, -330, -321.2, 330, 3, 'gleis'); col.add(-292.8, -330, -284.5, -118, 3, 'gleis'); col.add(-292.8, 118, -284.5, 330, 3, 'gleis');
    col.add(-292.8, -118, -292.3, 118, 0.5, 'kante');
    // Abgestellter Zug am Gleis 1
    trains.push([-326, -60, 120]);
    pois.push({ id: 'bahnsteig', name: 'Bahnsteig Gleis 1/2', x: -307, z: 0, district: 'bahnhof' });
  }

  function park(cx, cz) {
    pois.push({ id: 'park', name: 'Stadtpark', x: cx, z: cz, district: 'wohnen' });
    B.plane('grass', cx - HALF, cz - HALF, cx + HALF, cz + HALF, SLAB + 0.01, 6);
    // Wege (Kreuz + Ring)
    B.plane('gravel', cx - 2, cz - HALF, cx + 2, cz + HALF, SLAB + 0.02, 4);
    B.plane('gravel', cx - HALF, cz - 2, cx + HALF, cz + 2, SLAB + 0.02, 4);
    // Teich
    B.geometry('water', new THREE.CylinderGeometry(8, 8, 0.1, 40), new THREE.Matrix4().makeTranslation(cx + 16, SLAB + 0.03, cz - 16));
    B.geometry('stoneDark', new THREE.TorusGeometry(8.2, 0.35, 6, 40).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(cx + 16, SLAB + 0.1, cz - 16));
    col.add(cx + 8.5, cz - 23.5, cx + 23.5, cz - 8.5, 0.6, 'teich');
    for (let k = 0; k < 26; k++) { const x = cx + (r() - 0.5) * 62, z = cz + (r() - 0.5) * 62; if (Math.abs(x - cx) < 4 || Math.abs(z - cz) < 4 || Math.hypot(x - cx - 16, z - cz + 16) < 10) continue; trees.push([x, z, 0.9 + r() * 0.7]); }
    for (const [x, z, ry] of [[cx - 4, cz + 10, Math.PI / 2], [cx + 4, cz - 10, -Math.PI / 2], [cx + 10, cz + 4, 0], [cx - 10, cz - 4, Math.PI]]) benches.push([x, z, ry]);
    // Spielplatz-Gerüst
    B.box('paint', cx - 22, SLAB, cz + 16, cx - 21.8, SLAB + 2.6, cz + 16.2, { color: [0.85, 0.3, 0.2] });
    B.box('paint', cx - 16, SLAB, cz + 16, cx - 15.8, SLAB + 2.6, cz + 16.2, { color: [0.85, 0.3, 0.2] });
    B.box('paint', cx - 22, SLAB + 2.5, cz + 16, cx - 15.8, SLAB + 2.7, cz + 16.2, { color: [0.85, 0.3, 0.2] });
    B.plane('gravel', cx - 25, cz + 12, cx - 13, cz + 22, SLAB + 0.02, 3);
    streetDressing(cx, cz, { treesOn: false });
  }

  function reihenhaeuser(cx, cz) {
    // Zwei Zeilen Reihenhäuser mit Satteldach und Vorgärten
    for (const zz of [cz - 20, cz + 12]) {
      for (let x = cx - BUILD; x < cx + BUILD - 6; x += 8) {
        const st = [0, 1, 4, 5, 3][Math.floor(r() * 5)];
        building(x, zz, x + 8, zz + 9, 2, { style: st, pitched: true, alongX: true });
      }
      B.plane('grass', cx - BUILD, zz + 9, cx + BUILD, zz + 13, SLAB + 0.01, 6);
    }
  }

  function industrie(cx, cz, i, j) {
    const y0 = SLAB + 0.01;
    const isLager = i === -2 && j === 2;
    // Zwei große Hallen
    for (const [x0, z0, x1, z1, m] of [[cx - 30, cz - 30, cx + 2, cz - 4, isLager ? 'corrBlue' : 'corr'], [cx + 6, cz - 30, cx + 30, cz + 10, 'corr']]) {
      B.box(m, x0, y0, z0, x1, y0 + 11, z1, { tileW: 4, tileH: 4, top: 'flatroof', topTile: 6 });
      B.gable(m, x0, z0, x1, z1, y0 + 11, 2, true, 4);
      col.add(x0, z0, x1, z1, 14);
      // Rolltore
      for (let x = x0 + 4; x < x1 - 4; x += 8) B.box('concrete', x, y0, z1, x + 5, y0 + 5, z1 + 0.15, { top: null });
    }
    if (isLager) {
      pois.push({ id: 'lager', name: 'Versorgungslager', x: cx - 14, z: cz + 2, district: 'industrie' });
      signs.push({ tex: TX.signTexture('VERSORGUNGSLAGER', { bg: '#0b1a33', fg: '#ffffff', accent: '#d4af37' }), x: cx - 14, y: y0 + 9, z: cz - 3.85, w: 16, h: 1.8, ry: 0 });
    }
    // Container-Stapel
    const cc = [[0.65, 0.2, 0.15], [0.15, 0.35, 0.6], [0.2, 0.5, 0.3], [0.8, 0.55, 0.1], [0.5, 0.5, 0.5]];
    for (let k = 0; k < 6; k++) {
      const x = cx - 28 + k * 4.2, z = cz + 14; const hgt = 1 + Math.floor(r() * 2);
      for (let h = 0; h < hgt; h++) B.box('paint', x, y0 + h * 2.6, z, x + 2.45, y0 + (h + 1) * 2.6, z + 12, { color: cc[Math.floor(r() * cc.length)] });
      col.add(x, z, x + 2.45, z + 12, hgt * 2.6);
    }
    // Tanks
    for (const [x, z] of [[cx + 14, cz + 20], [cx + 24, cz + 20]]) { B.geometry('steel', new THREE.CylinderGeometry(3.6, 3.6, 12, 24), new THREE.Matrix4().makeTranslation(x, y0 + 6, z)); col.add(x - 3.6, z - 3.6, x + 3.6, z + 3.6, 12); }
    trucks.push([cx - 10, cz + 4, Math.PI / 2], [cx + 18, cz + 14, 0]);
    lamps.push([cx - 32, cz + 32, 0], [cx + 32, cz + 32, 0], [cx - 32, cz - 32, Math.PI], [cx + 32, cz - 32, Math.PI]);
  }

  function militaer() {
    // Umzäuntes Gelände x[-120,120] z[-282,-203] – nur Kulisse, nicht betretbar
    pois.push({ id: 'militaer', name: 'Militärgelände (gesperrt)', x: -40, z: -198, district: 'militaer' });
    const zf = -203, xs = [-122, 122], zb = -284;
    B.plane('gravel', -122, -284, 122, -203, 0.02, 6);
    // Zaun: Pfosten + Maschendraht (transparent) + Stacheldraht oben
    const fence = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0); const n = Math.ceil(len / 3);
      for (let k = 0; k <= n; k++) { const t = k / n; const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t; B.box('metal', x - 0.06, 0, z - 0.06, x + 0.06, 3.2, z + 0.06, { top: null }); }
      fenceSegs.push([x0, z0, x1, z1]);
      col.add(x0 - 0.3, z0 - 0.3, x1 + 0.3, z1 + 0.3, 4, 'zaun');
    };
    fence(xs[0], zf, -43, zf); fence(-37, zf, xs[1], zf); fence(xs[0], zb, xs[1], zb); fence(xs[0], zb, xs[0], zf); fence(xs[1], zb, xs[1], zf);
    // Tor mit Schranke + Wachhaus an der Straße x=-40
    B.box('paint', -43, 1.0, zf - 0.1, -37, 1.15, zf + 0.1, { color: [0.85, 0.1, 0.1] });
    B.box('paint', -43, 0, zf - 0.2, -42.6, 1.2, zf + 0.2, { color: [0.2, 0.2, 0.2] });
    col.add(-43, zf - 0.4, -37, zf + 0.4, 3, 'schranke');
    B.box('concrete', -50, 0, zf - 6, -45, 3, zf - 1, { topTile: 4 }); B.box('glass', -50.05, 1.2, zf - 5, -44.95, 2.4, zf - 2);
    signs.push({ tex: TX.signTexture('MILITÄRISCHER SICHERHEITSBEREICH – BETRETEN VERBOTEN', { bg: '#c41f1f', fg: '#ffffff', accent: '#ffffff', w: 1400 }), x: -30, y: 2.2, z: zf + 0.12, w: 9, h: 1.1, ry: 0 });
    signs.push({ tex: TX.signTexture('SPERRGEBIET', { bg: '#c41f1f', fg: '#ffffff', accent: '#ffffff' }), x: 60, y: 2.2, z: zf + 0.12, w: 5, h: 0.9, ry: 0 });
    // Kasernen, Hallen, Wachtürme
    for (let k = 0; k < 4; k++) { const x = -100 + k * 28; B.box('fac2', x, 0, -275, x + 22, 7, -262, { tileW: 12, tileH: 12.8, top: 'flatroof', topTile: 6 }); col.add(x, -275, x + 22, -262, 8); }
    for (const x of [-20, 30, 80]) { B.box('corrGreen', x, 0, -250, x + 26, 9, -225, { tileW: 4, tileH: 4, top: 'flatroof', topTile: 6 }); B.gable('corrGreen', x, -250, x + 26, -225, 9, 3, false, 4); col.add(x, -250, x + 26, -225, 12); }
    for (const [x, z] of [[-116, -209], [116, -209], [-116, -278], [116, -278]]) {
      for (const [dx, dz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) B.box('metal', x + dx - 0.12, 0, z + dz - 0.12, x + dx + 0.12, 9, z + dz + 0.12, { top: null });
      B.box('camo', x - 2.2, 9, z - 2.2, x + 2.2, 11.4, z + 2.2); B.box('metal', x - 2.6, 11.4, z - 2.6, x + 2.6, 11.7, z + 2.6);
    }
    flagpoles.push([-80, -215]);
    milTrucks.push([-90, -232, 0], [-80, -232, 0], [-70, -232, 0], [10, -215, Math.PI / 2]);
    B.geometry('concrete', new THREE.CylinderGeometry(9, 9, 0.12, 32), new THREE.Matrix4().makeTranslation(-55, 0.08, -240));
    signs.push({ tex: TX.signTexture('H', { bg: '#3a3d40', fg: '#f2c230', accent: '#3a3d40', w: 256, h: 256 }), x: -55, y: 0.16, z: -240, w: 7, h: 7, rx: -Math.PI / 2 });
  }

  function stadtrand() {
    // Hügel + Wald hinter der Stadtgrenze (Kulisse) und unsichtbare Grenze
    const hill = new THREE.Mesh(new THREE.RingGeometry(335, 900, 96, 6).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: TX.grassTexture(), roughness: 1, color: '#9fb07e' }));
    const pos = hill.geometry.attributes.position; const uv = hill.geometry.attributes.uv;
    for (let k = 0; k < pos.count; k++) { const x = pos.getX(k), z = pos.getZ(k); const d = Math.hypot(x, z); const h = Math.max(0, d - 345) * 0.09 + Math.sin(x * 0.02) * Math.cos(z * 0.025) * 6 * Math.min(1, Math.max(0, d - 345) / 80); pos.setY(k, h); uv.setXY(k, x / 16, z / 16); }
    hill.geometry.computeVertexNormals(); hill.receiveShadow = true; hill.name = 'huegel'; scene.add(hill);
    for (let k = 0; k < 420; k++) { const a = r() * Math.PI * 2, d = 345 + r() * 160; const x = Math.cos(a) * d, z = Math.sin(a) * d; if (x < -300 && Math.abs(z) < 340 && d < 420 && Math.abs(Math.sin(a)) < 0.5) continue; forest.push([x, z, 1.2 + r() * 1.2, Math.max(0, d - 345) * 0.09]); }
  }

  // ================== Instanzen & Props ==================
  const group = B.build(M);
  group.name = 'stadt';
  scene.add(group);
  const props = buildProps(scene, M, { trees, lamps, cars, benches, flagpoles, ambulances, trains, trucks, milTrucks, fenceSegs, forest, signs }, quality, col);
  return { group, colliders: col, pois, materials: M, props, update: props.update };
}

// ---------- Props: Bäume, Laternen, Autos usw. als InstancedMesh ----------
function instanced(geo, mat, list, setter, { cast = true } = {}) {
  if (!list.length) return null;
  const m = new THREE.InstancedMesh(geo, mat, list.length); const o = new THREE.Object3D();
  list.forEach((it, k) => { setter(o, it, k); o.updateMatrix(); m.setMatrixAt(k, o.matrix); });
  m.castShadow = cast; m.receiveShadow = true; m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere();
  return m;
}

function mergeSimple(parts) {
  const pos = [], nrm = [], uv = [];
  for (const p of parts) { const g = p.index ? p.toNonIndexed() : p; pos.push(...g.attributes.position.array); nrm.push(...g.attributes.normal.array); uv.push(...g.attributes.uv.array); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); return g;
}

function buildProps(scene, M, L, quality, col) {
  const root = new THREE.Group(); root.name = 'props'; scene.add(root);
  const add = (m) => { if (m) root.add(m); return m; };
  const leafMat = new THREE.MeshStandardMaterial({ color: '#4f7a34', roughness: 0.9, flatShading: true });
  const leafMat2 = new THREE.MeshStandardMaterial({ color: '#3d6629', roughness: 0.9, flatShading: true });
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#5a4332', roughness: 1 });

  // Bäume: Stamm + 3 Kronen-Kugeln (unregelmäßig)
  const trunk = new THREE.CylinderGeometry(0.16, 0.26, 3.2, 7).translate(0, 1.6, 0);
  const crownA = new THREE.IcosahedronGeometry(2.1, 1).translate(0, 4.6, 0);
  const crownB = new THREE.IcosahedronGeometry(1.6, 1).translate(0.9, 5.6, 0.4);
  const crownC = new THREE.IcosahedronGeometry(1.5, 1).translate(-0.8, 5.3, -0.6);
  for (const g of [crownA, crownB, crownC]) { const p = g.attributes.position; for (let k = 0; k < p.count; k++) { const s = 1 + Math.sin(p.getX(k) * 3.1 + p.getZ(k) * 2.3) * 0.12; p.setXYZ(k, p.getX(k) * s, p.getY(k), p.getZ(k) * s); } g.computeVertexNormals(); }
  const crown = mergeSimple([crownA, crownB, crownC]); crown.computeVertexNormals();
  const tset = (o, [x, z, s], k) => { o.position.set(x, 0.15, z); o.rotation.set(0, k * 1.7, 0); o.scale.setScalar(s); };
  add(instanced(trunk, trunkMat, L.trees, tset));
  const tA = L.trees.filter((_, k) => k % 2 === 0), tB = L.trees.filter((_, k) => k % 2 === 1);
  add(instanced(crown, leafMat, tA, tset)); add(instanced(crown, leafMat2, tB, tset));
  for (const [x, z, s] of L.trees) col.add(x - 0.25 * s, z - 0.25 * s, x + 0.25 * s, z + 0.25 * s, 4, 'baum');

  // Wald am Stadtrand: Nadelbäume (Kegel)
  const fir = mergeSimple([new THREE.CylinderGeometry(0.2, 0.3, 2, 6).translate(0, 1, 0), new THREE.ConeGeometry(2.2, 5, 7).translate(0, 4, 0), new THREE.ConeGeometry(1.7, 4, 7).translate(0, 6.5, 0)]);
  fir.computeVertexNormals();
  add(instanced(fir, new THREE.MeshStandardMaterial({ color: '#2f4a2a', roughness: 1, flatShading: true }), L.forest, (o, [x, z, s, y]) => { o.position.set(x, y, z); o.scale.setScalar(s); }, { cast: quality === 'hoch' }));

  // Laternen: Mast + Ausleger + Leuchte
  const pole = mergeSimple([new THREE.CylinderGeometry(0.07, 0.11, 5.6, 8).translate(0, 2.8, 0), new THREE.BoxGeometry(0.08, 0.08, 1.2).translate(0, 5.5, 0.55)]);
  const headGeo = new THREE.BoxGeometry(0.34, 0.14, 0.6).translate(0, 5.42, 1.05);
  const lampHeadMat = new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: '#ffd89a', emissiveIntensity: 0, roughness: 0.4 });
  const lset = (o, [x, z, ry]) => { o.position.set(x, 0.15, z); o.rotation.set(0, ry + Math.PI, 0); o.scale.setScalar(1); };
  add(instanced(pole, M.metal, L.lamps, lset)); const heads = add(instanced(headGeo, lampHeadMat, L.lamps, lset, { cast: false }));

  // Autos: Karosserie (Instanzfarbe) + Fenster + Räder
  const carCols = ['#9a1b1b', '#1b3a6b', '#e8e8e8', '#2a2a2a', '#7d7f82', '#3f5a3a', '#c9b48a', '#f2c230'];
  const body = mergeSimple([new THREE.BoxGeometry(1.8, 0.62, 4.3).translate(0, 0.62, 0), new THREE.BoxGeometry(1.6, 0.5, 2.1).translate(0, 1.18, -0.15)]);
  const win = new THREE.BoxGeometry(1.64, 0.4, 2.0).translate(0, 1.2, -0.15);
  const wheel = mergeSimple([[-0.82, 1.35], [0.82, 1.35], [-0.82, -1.35], [0.82, -1.35]].map(([x, z]) => new THREE.CylinderGeometry(0.33, 0.33, 0.24, 12).rotateZ(Math.PI / 2).translate(x, 0.33, z)));
  const allCars = L.cars.map(([x, z, ry, c]) => [x, z, ry, c]);
  const cset = (o, [x, z, ry]) => { o.position.set(x, 0, z); o.rotation.set(0, ry, 0); o.scale.setScalar(1); };
  const carMesh = add(instanced(body, new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.6 }), allCars, cset));
  if (carMesh) allCars.forEach(([, , , c], k) => carMesh.setColorAt(k, new THREE.Color(carCols[c % carCols.length])));
  add(instanced(win, new THREE.MeshStandardMaterial({ color: '#1c2630', roughness: 0.1, metalness: 0.8 }), allCars, cset, { cast: false }));
  add(instanced(wheel, new THREE.MeshStandardMaterial({ color: '#151515', roughness: 0.8 }), allCars, cset, { cast: false }));
  for (const [x, z, ry] of allCars) { const a = Math.abs(Math.sin(ry)) > 0.5; col.add(x - (a ? 2.2 : 0.95), z - (a ? 0.95 : 2.2), x + (a ? 2.2 : 0.95), z + (a ? 0.95 : 2.2), 1.6, 'auto'); }

  // Krankenwagen / Lkw / Militär-Lkw
  const van = (len, h, colr, list, stripe) => {
    if (!list.length) return;
    const g = mergeSimple([new THREE.BoxGeometry(2.2, h, len).translate(0, h / 2 + 0.45, -0.5), new THREE.BoxGeometry(2.2, 1.6, 1.8).translate(0, 1.25, len / 2 + 0.4)]);
    const set = (o, [x, z, ry]) => { o.position.set(x, 0, z); o.rotation.set(0, ry, 0); o.scale.setScalar(1); };
    add(instanced(g, new THREE.MeshStandardMaterial({ color: colr, roughness: 0.5, metalness: 0.2 }), list, set));
    add(instanced(mergeSimple([[-1, 1.5], [1, 1.5], [-1, -1.8], [1, -1.8]].map(([x, z]) => new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12).rotateZ(Math.PI / 2).translate(x, 0.42, z))), new THREE.MeshStandardMaterial({ color: '#151515' }), list, set, { cast: false }));
    if (stripe) add(instanced(new THREE.BoxGeometry(2.24, 0.35, len).translate(0, 1.3, -0.5), new THREE.MeshStandardMaterial({ color: stripe, emissive: stripe, emissiveIntensity: 0.15 }), list, set, { cast: false }));
    for (const [x, z, ry] of list) { const a = Math.abs(Math.sin(ry)) > 0.5; const hl = len / 2 + 1.4; col.add(x - (a ? hl : 1.2), z - (a ? 1.2 : hl), x + (a ? hl : 1.2), z + (a ? 1.2 : hl), 3, 'fahrzeug'); }
  };
  van(4.4, 2.2, '#f4f4f0', L.ambulances, '#d42a2a');
  van(7, 3, '#dcdcd6', L.trucks, '#1b3f73');
  van(5.5, 2.4, '#55603f', L.milTrucks, null);

  // Zug (abgestellt)
  for (const [x, z0, len] of L.trains) {
    const cars = Math.floor(len / 26);
    for (let k = 0; k < cars; k++) {
      const z = z0 + k * 26.5;
      const g = new THREE.Mesh(new THREE.BoxGeometry(2.9, 3.6, 26), new THREE.MeshStandardMaterial({ color: k === 0 ? '#c41f1f' : '#e9e6df', roughness: 0.4, metalness: 0.3 }));
      g.position.set(x, 2.2, z + 13); g.castShadow = g.receiveShadow = true; root.add(g);
      const w = new THREE.Mesh(new THREE.BoxGeometry(2.95, 0.9, 24), new THREE.MeshStandardMaterial({ color: '#1c2630', roughness: 0.1, metalness: 0.8 })); w.position.set(x, 2.8, z + 13); root.add(w);
      const s = new THREE.Mesh(new THREE.BoxGeometry(2.95, 0.3, 26), new THREE.MeshStandardMaterial({ color: '#1b3f73' })); s.position.set(x, 1.6, z + 13); root.add(s);
    }
  }

  // Bänke + Mülleimer
  const bench = mergeSimple([new THREE.BoxGeometry(1.8, 0.08, 0.45).translate(0, 0.45, 0), new THREE.BoxGeometry(1.8, 0.4, 0.06).translate(0, 0.72, -0.2), new THREE.BoxGeometry(0.08, 0.45, 0.4).translate(-0.8, 0.22, 0), new THREE.BoxGeometry(0.08, 0.45, 0.4).translate(0.8, 0.22, 0)]);
  add(instanced(bench, new THREE.MeshStandardMaterial({ color: '#6b4a2e', roughness: 0.8 }), L.benches, (o, [x, z, ry, y]) => { o.position.set(x, y ?? 0.15, z); o.rotation.set(0, ry, 0); o.scale.setScalar(1); }));
  for (const [x, z] of L.benches) col.add(x - 0.9, z - 0.9, x + 0.9, z + 0.9, 0.9, 'bank');

  // Zaun (Maschendraht, transparent)
  const meshMat = new THREE.MeshStandardMaterial({ color: '#9aa0a6', transparent: true, opacity: 0.35, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.5, depthWrite: false });
  for (const [x0, z0, x1, z1] of L.fenceSegs) {
    const len = Math.hypot(x1 - x0, z1 - z0); const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 3), meshMat);
    m.position.set((x0 + x1) / 2, 1.5, (z0 + z1) / 2); m.rotation.y = -Math.atan2(z1 - z0, x1 - x0); root.add(m);
    const wire = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.05), M.metal); wire.position.set((x0 + x1) / 2, 3.25, (z0 + z1) / 2); wire.rotation.y = m.rotation.y; root.add(wire);
  }

  // Fahnenmasten mit wehender Valenheim-Flagge
  const flags = [];
  const flagMat = new THREE.MeshStandardMaterial({ map: TX.flagTexture(), side: THREE.DoubleSide, roughness: 0.8 });
  for (const [x, z] of L.flagpoles) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 12, 8), M.steel); p.position.set(x, 6, z); p.castShadow = true; root.add(p);
    const fg = new THREE.PlaneGeometry(3.2, 2, 16, 4); fg.translate(1.6, 0, 0);
    const f = new THREE.Mesh(fg, flagMat); f.position.set(x + 0.08, 10.8, z); f.castShadow = true; root.add(f);
    f.userData.base = fg.attributes.position.array.slice(); flags.push(f);
    col.add(x - 0.2, z - 0.2, x + 0.2, z + 0.2, 12, 'mast');
  }

  // Schilder
  for (const s of L.signs) {
    const m = new THREE.Mesh(s.round ? new THREE.CircleGeometry(s.w / 2, 32) : new THREE.PlaneGeometry(s.w, s.h), new THREE.MeshStandardMaterial({ map: s.tex, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.position.set(s.x, s.y, s.z); m.rotation.set(s.rx || 0, s.ry || 0, 0); root.add(m);
  }

  return {
    root, heads, lampHeadMat,
    update(t) {
      for (const f of flags) {
        const p = f.geometry.attributes.position; const b = f.userData.base;
        for (let k = 0; k < p.count; k++) { const x = b[k * 3]; p.setZ(k, Math.sin(x * 1.6 - t * 4.2) * 0.22 * (x / 3.2) + Math.sin(x * 3 - t * 6.5) * 0.05 * (x / 3.2)); }
        p.needsUpdate = true; f.geometry.computeVertexNormals();
      }
    },
  };
}
