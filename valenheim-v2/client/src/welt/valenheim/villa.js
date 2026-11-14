// Villenviertel: Jeder Follower bekommt eine moderne Luxusvilla mit Namen.
// Alle Villen werden pro Material zu einem Mesh zusammengefasst (wenige Draw-Calls trotz vieler Details).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRng } from './rng.js';
import { KOLLISION } from './world.js';

const MATS = () => ({
  putz: new THREE.MeshStandardMaterial({ color: 0xf3f0ea, roughness: 0.82 }),
  anthrazit: new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.55, metalness: 0.35 }),
  holz: new THREE.MeshStandardMaterial({ color: 0x9a6a42, roughness: 0.7 }),
  stein: new THREE.MeshStandardMaterial({ color: 0xb9ad98, roughness: 0.9 }),
  glas: new THREE.MeshStandardMaterial({ color: 0x18222c, roughness: 0.06, metalness: 0.7, emissive: 0xffb469, emissiveIntensity: 0 }),
  wasser: new THREE.MeshStandardMaterial({ color: 0x2fb6d8, roughness: 0.03, metalness: 0.2, emissive: 0x0b7fa6, emissiveIntensity: 0.25 }),
  rasen: new THREE.MeshStandardMaterial({ color: 0x5f8f3a, roughness: 1 }),
  deck: new THREE.MeshStandardMaterial({ color: 0x7b5a3c, roughness: 0.8 }),
  pflaster: new THREE.MeshStandardMaterial({ color: 0xcfc8bb, roughness: 0.9 }),
  weiss: new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.5 }),
  hecke: new THREE.MeshStandardMaterial({ color: 0x2f5a24, roughness: 0.95 }),
  licht: new THREE.MeshStandardMaterial({ color: 0xfff2d8, emissive: 0xffd9a0, emissiveIntensity: 0.2 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.9 }),
  stamm: new THREE.MeshStandardMaterial({ color: 0x5a4332, roughness: 1 }),
});
// Spiel (v2): Kollisionsbox in Weltkoordinaten mitschreiben
const _kv = new THREE.Vector3();
function kollidiere(base, ry, w, h, d, x, y, z) { if (!KOLLISION.aktiv || h < 0.05) return; _kv.set(x, y, z).applyMatrix4(base); KOLLISION.liste.push([_kv.x, _kv.y, _kv.z, w, h, d, ry]); }
const LACKE = [0x111318, 0xf2f2f2, 0x8b0f14, 0x1b3a6b, 0x6d7278, 0xd4af37, 0x0f4a2e];

// Namensatlas: goldene Schrift (Hausfassade) + Messingschild (Tor)
function nameAtlas(names) {
  const cols = 2, cw = 1024, ch = 128; const rows = Math.ceil(names.length / cols);
  const c = document.createElement('canvas'); c.width = cols * cw; c.height = Math.max(128, rows * ch); const g = c.getContext('2d');
  names.forEach((n, i) => {
    const x = (i % cols) * cw, y = Math.floor(i / cols) * ch; let size = 92; const txt = n.toUpperCase();
    g.font = `900 ${size}px Montserrat, sans-serif`; while (g.measureText(txt).width > cw - 60 && size > 30) { size -= 4; g.font = `900 ${size}px Montserrat, sans-serif`; }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 10; g.strokeStyle = 'rgba(20,16,8,0.85)'; g.strokeText(txt, x + cw / 2, y + ch / 2);
    const gr = g.createLinearGradient(0, y + 20, 0, y + ch - 20); gr.addColorStop(0, '#fff1b8'); gr.addColorStop(0.5, '#e2b84a'); gr.addColorStop(1, '#a8801e'); g.fillStyle = gr; g.fillText(txt, x + cw / 2, y + ch / 2);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return { tex: t, uv: (i) => { const u0 = (i % cols) / cols, v1 = 1 - Math.floor(i / cols) * ch / c.height; return [u0, v1 - ch / c.height, u0 + 1 / cols, v1]; } };
}

export function baueVillenviertel(scene, { plaetze, namen, slab = 0.22, seed = 4242 }) {
  const M = MATS(); const parts = {}; for (const k in M) parts[k] = [];
  const rng = makeRng(seed); const atlas = nameAtlas(namen); const schrift = [];
  const tmp = new THREE.Object3D(); const grp = new THREE.Group(); grp.name = 'villenviertel'; scene.add(grp);
  const autos = []; const baeume = []; const zyp = []; const villen = [];

  plaetze.slice(0, namen.length).forEach(([px, pz, ry], idx) => {
    const v = idx % 4; const r = makeRng(seed + idx * 97);
    // lokales Koordinatensystem: Front (Straße) bei +z, Grundstück W×D
    const W = 46, D = 24; const base = new THREE.Matrix4().makeRotationY(ry).setPosition(px, slab, pz);
    const put = (mat, geo, x, y, z, rx = 0, ryy = 0, sx = 1, sy = 1, sz = 1) => { tmp.position.set(x, y, z); tmp.rotation.set(rx, ryy, 0); tmp.scale.set(sx, sy, sz); tmp.updateMatrix(); const g = geo.clone(); g.applyMatrix4(tmp.matrix); g.applyMatrix4(base); parts[mat].push(g); };
    const box = (mat, w, h, d, x, y, z) => { kollidiere(base, ry, w, h, d, x, y, z); put(mat, new THREE.BoxGeometry(w, h, d), x, y + h / 2, z); };
    // Grundstück: Rasen, Mauer, Tor, Einfahrt
    box('rasen', W, 0.12, D, 0, 0, 0);
    box('putz', W, 1.4, 0.4, 0, 0, -D / 2 + 0.2); box('putz', 0.4, 1.4, D, -W / 2 + 0.2, 0, 0); box('putz', 0.4, 1.4, D, W / 2 - 0.2, 0, 0);
    const torX = v % 2 ? -W / 2 + 7 : W / 2 - 7;
    box('putz', (torX + W / 2) - 3.4, 1.4, 0.4, (-W / 2 + torX - 3.4) / 2, 0, D / 2 - 0.2); box('putz', W / 2 - torX - 3.4, 1.4, 0.4, (W / 2 + torX + 3.4) / 2, 0, D / 2 - 0.2);
    for (const s of [-1, 1]) { box('stein', 0.9, 2.4, 0.9, torX + s * 3.4, 0, D / 2 - 0.2); box('licht', 0.5, 0.25, 0.5, torX + s * 3.4, 2.4, D / 2 - 0.2); }
    for (let k = -2.6; k <= 2.6; k += 0.35) box('anthrazit', 0.08, 1.9, 0.08, torX + k, 0.1, D / 2 - 0.2);
    box('anthrazit', 5.4, 0.12, 0.12, torX, 1.95, D / 2 - 0.2); box('anthrazit', 5.4, 0.1, 0.1, torX, 0.2, D / 2 - 0.2);
    box('pflaster', 6, 0.14, 9, torX, 0, D / 2 - 4.6);
    // Haus: zwei versetzte Kuben, große Glasfronten, Holzverkleidung, Flachdach mit Überstand
    const hx = v % 2 ? 4 : -4; const L1 = 22 + r() * 4, T1 = 11, H1 = 3.6; const L2 = 14 + r() * 3, T2 = 9, H2 = 3.3; const o2 = (v < 2 ? 1 : -1) * 3.5;
    const hz = -D / 2 + T1 / 2 + 1.2;
    box('putz', L1, H1, T1, hx, 0.12, hz);
    box('putz', L2, H2, T2, hx + o2, 0.12 + H1, hz - 0.5);
    if (v === 3) box('putz', 8, 3, 7, hx - o2 * 1.2, 0.12 + H1 + H2, hz - 1); // Turmaufsatz
    box('anthrazit', L1 + 1.2, 0.28, T1 + 1.6, hx, 0.12 + H1, hz + 0.3);          // Deckenplatte mit Überstand
    box('anthrazit', L2 + 1.4, 0.3, T2 + 2.2, hx + o2, 0.12 + H1 + H2, hz - 0.2); // Dach
    // Glasfront EG (vorne) mit Pfosten, OG mit Fensterband + Holzpaneel
    const gz = hz + T1 / 2 + 0.02; box('glas', L1 * 0.72, H1 - 0.5, 0.06, hx - L1 * 0.12, 0.35, gz);
    for (let k = 0; k <= 6; k++) box('anthrazit', 0.12, H1 - 0.5, 0.12, hx - L1 * 0.12 - L1 * 0.36 + k * L1 * 0.12, 0.35, gz + 0.04);
    box('holz', L1 * 0.22, H1 - 0.3, 0.12, hx + L1 * 0.36, 0.2, gz);
    const g2 = hz - 0.5 + T2 / 2 + 0.02; box('glas', L2 * 0.6, H2 - 0.8, 0.06, hx + o2 - L2 * 0.15, 0.12 + H1 + 0.4, g2);
    box('holz', L2 * 0.32, H2, 0.14, hx + o2 + L2 * 0.33, 0.12 + H1, g2);
    // Balkon mit Glasgeländer vor dem OG
    box('anthrazit', L2 * 0.6, 0.2, 2.2, hx + o2 - L2 * 0.15, 0.12 + H1, g2 + 1.1); box('glas', L2 * 0.6, 1.05, 0.05, hx + o2 - L2 * 0.15, 0.32 + H1, g2 + 2.15);
    // Seitenfenster
    for (const s of [-1, 1]) box('glas', 0.06, 2.2, T1 * 0.5, hx + s * (L1 / 2 + 0.02), 0.9, hz);
    // Garage mit Tor
    const gx = torX; box('putz', 6.4, 3.0, 6.5, gx, 0.12, -D / 2 + 4.5 + 0.2); box('anthrazit', 5.2, 2.5, 0.08, gx, 0.12, -D / 2 + 7.8);
    // Terrasse + Pool + Liegen + Sonnenschirm
    const tx = -torX * 0.35; box('deck', 16, 0.18, 4.5, tx, 0.12, gz + 2.3);
    const pw = 11, pd = 4.2, pzc = gz + 4.6 + pd / 2 + 0.6; box('stein', pw + 1.2, 0.24, pd + 1.2, tx, 0.1, pzc); box('wasser', pw, 0.08, pd, tx, 0.28, pzc);
    for (let k = 0; k < 3; k++) { const lx = tx - 4 + k * 2.2; box('weiss', 0.75, 0.28, 2, lx, 0.32, gz + 2.3); box('weiss', 0.75, 0.6, 0.12, lx, 0.5, gz + 1.4); }
    put('stamm', new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), tx + 5.2, 0.12 + 1.3, gz + 2.3); put('weiss', new THREE.ConeGeometry(1.7, 0.6, 12), tx + 5.2, 0.12 + 2.7, gz + 2.3);
    // Garten: Hecken, Zypressen, Bäume, Bodenleuchten
    box('hecke', 0.9, 1.1, D - 2, -W / 2 + 1.2, 0, 0); box('hecke', 0.9, 1.1, D - 2, W / 2 - 1.2, 0, 0);
    for (let k = 0; k < 5; k++) { const zz = -D / 2 + 3 + k * 4.3; zyp.push(new THREE.Vector3(...[-W / 2 + 1.4, 0, zz])); zyp.push(new THREE.Vector3(W / 2 - 1.4, 0, zz)); }
    for (let k = 0; k < 4; k++) box('licht', 0.18, 0.5, 0.18, -W / 2 + 4 + k * ((W - 8) / 3), 0.12, D / 2 - 1.5);
    // Zypressen in Weltkoordinaten
    for (const p of zyp.splice(0)) { p.applyMatrix4(base); baeume.push(p); }
    // Auto in der Einfahrt
    autos.push({ m: new THREE.Matrix4().multiplyMatrices(base, new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(gx, 0.02, D / 2 - 5.2)), c: LACKE[(idx * 3) % LACKE.length] });
    // Name: groß an der Fassade (über dem Glas) + Schild am Torpfeiler
    schrift.push({ i: idx, m: new THREE.Matrix4().multiplyMatrices(base, new THREE.Matrix4().setPosition(hx, 0.12 + H1 + H2 + 0.2 + (v === 3 ? 3 : 0), hz - 0.5 + T2 / 2 + 1.15)), w: Math.min(L2 + 2, 13), h: 1.6 });
    schrift.push({ i: idx, m: new THREE.Matrix4().multiplyMatrices(base, new THREE.Matrix4().setPosition(torX + 3.4, 1.5, D / 2 + 0.27)), w: 0.86, h: 0.12, schild: true });
    const wp = new THREE.Vector3(torX, 0, D / 2 + 3).applyMatrix4(base); const hp = new THREE.Vector3(hx, 4, hz).applyMatrix4(base);
    villen.push({ name: namen[idx], tor: [wp.x, wp.z], haus: [hp.x, hp.y, hp.z], ry });
  });

  for (const k in parts) if (parts[k].length) { const m = new THREE.Mesh(mergeGeometries(parts[k]), M[k]); m.castShadow = k !== 'wasser' && k !== 'rasen'; m.receiveShadow = true; grp.add(m); }
  // Zypressen (instanziert)
  const zg = new THREE.ConeGeometry(0.75, 6.5, 8).translate(0, 3.6, 0); const zypM = new THREE.InstancedMesh(zg, M.hecke, baeume.length);
  baeume.forEach((p, i) => { tmp.position.copy(p); tmp.position.y = slab; tmp.rotation.set(0, i, 0); tmp.scale.setScalar(0.85 + ((i * 7) % 5) * 0.06); tmp.updateMatrix(); zypM.setMatrixAt(i, tmp.matrix); });
  zypM.castShadow = true; zypM.frustumCulled = false; grp.add(zypM);
  // Autos: Sportwagen-Silhouette
  const karo = mergeGeometries([new THREE.BoxGeometry(4.5, 0.6, 1.95).translate(0, 0.55, 0), new THREE.BoxGeometry(2.1, 0.5, 1.7).translate(-0.3, 1.05, 0)]);
  const reifen = new THREE.CylinderGeometry(0.36, 0.36, 2.0, 14).rotateX(Math.PI / 2);
  const am = new THREE.InstancedMesh(karo, new THREE.MeshPhysicalMaterial({ roughness: 0.25, metalness: 0.6, clearcoat: 1 }), autos.length);
  const rm = new THREE.InstancedMesh(reifen, M.anthrazit, autos.length * 2);
  autos.forEach((a, i) => { am.setMatrixAt(i, a.m); am.setColorAt(i, new THREE.Color(a.c)); for (const [s, k] of [[1.45, 0], [-1.45, 1]]) { const mm = a.m.clone().multiply(new THREE.Matrix4().setPosition(s, 0.36, 0)); rm.setMatrixAt(i * 2 + k, mm); } });
  am.castShadow = true; am.frustumCulled = rm.frustumCulled = false; grp.add(am, rm);
  // Schrift (eine Geometrie mit Atlas-UVs)
  const sg = []; for (const s of schrift) { const g = new THREE.PlaneGeometry(s.w, s.h); const [u0, v0, u1, v1] = atlas.uv(s.i); const uv = g.attributes.uv; uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0); g.applyMatrix4(s.m); sg.push(g); }
  const schriftM = new THREE.MeshStandardMaterial({ map: atlas.tex, transparent: true, alphaTest: 0.25, emissive: 0xffd27a, emissiveMap: atlas.tex, emissiveIntensity: 0.35, roughness: 0.4, metalness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
  if (sg.length) grp.add(new THREE.Mesh(mergeGeometries(sg), schriftM));

  return {
    villen, group: grp,
    nacht(n) { M.glas.emissiveIntensity = n * n * 0.75; M.licht.emissiveIntensity = 0.2 + n * 3; M.wasser.emissiveIntensity = 0.25 + n * 1.4; schriftM.emissiveIntensity = 0.35 + n * 1.2; },
  };
}

// ============================================================================
// DIE PRÄSIDENTENVILLA – ein ganzes Anwesen (≈130 × 130 m)
// Palmenallee, goldenes Tor, Brunnen, 3-geschossiger Glaspalast mit LED-Kanten,
// Infinity-Pool im 1. Stock, Hauptpool mit Poolhaus, Garage mit 5 Sportwagen,
// Tennisplatz, Hubschrauber auf dem Dach.
// ============================================================================
export function baueMegaVilla(scene, { x = 0, z = 0, ry = 0, slab = 0.22, name = 'PRÄSIDENTENVILLA' } = {}) {
  const M = MATS();
  M.led = new THREE.MeshStandardMaterial({ color: 0xfff0c8, emissive: 0xffd27a, emissiveIntensity: 1.2 });
  M.goldGlanz = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.18, metalness: 1, emissive: 0x3a2a00, emissiveIntensity: 0.3 });
  M.marmor = new THREE.MeshStandardMaterial({ color: 0xece8e2, roughness: 0.25, metalness: 0.05 });
  M.court = new THREE.MeshStandardMaterial({ color: 0x2a5a9a, roughness: 0.85 });
  M.linie = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  M.palme = new THREE.MeshStandardMaterial({ color: 0x3f7a2a, roughness: 0.9, side: THREE.DoubleSide });
  M.rinde = new THREE.MeshStandardMaterial({ color: 0x7a6248, roughness: 1 });
  M.heli = new THREE.MeshPhysicalMaterial({ color: 0x101216, roughness: 0.2, metalness: 0.8, clearcoat: 1 });
  M.wand = new THREE.MeshStandardMaterial({ color: 0x3a3226, emissive: 0xffc890, emissiveIntensity: 0.35 });
  M.zaun = new THREE.MeshStandardMaterial({ color: 0x1c2a1c, roughness: 0.8, transparent: true, opacity: 0.55 });
  const parts = {}; for (const k in M) parts[k] = [];
  const base = new THREE.Matrix4().makeRotationY(ry).setPosition(x, slab, z);
  const tmp = new THREE.Object3D();
  const put = (mat, geo, px, py, pz, rx = 0, ryy = 0, rz = 0) => { tmp.position.set(px, py, pz); tmp.rotation.set(rx, ryy, rz); tmp.scale.set(1, 1, 1); tmp.updateMatrix(); const g = geo.clone(); g.applyMatrix4(tmp.matrix); g.applyMatrix4(base); parts[mat].push(g); };
  const box = (mat, w, h, d, px, py, pz) => { if (mat !== 'led' && mat !== 'linie') kollidiere(base, ry, w, h, d, px, py, pz); put(mat, new THREE.BoxGeometry(w, h, d), px, py + h / 2, pz); };
  const S = 65; // halbe Grundstücksgröße
  // Grund, Mauer, Tor
  box('rasen', 2 * S, 0.3, 2 * S, 0, 0, 0);
  box('stein', 2 * S, 2.4, 1, 0, 0.3, -S); box('stein', 1, 2.4, 2 * S, -S, 0.3, 0); box('stein', 1, 2.4, 2 * S, S, 0.3, 0);
  box('stein', S - 9, 2.4, 1, -(S + 9) / 2, 0.3, S); box('stein', S - 9, 2.4, 1, (S + 9) / 2, 0.3, S);
  for (const s of [-1, 1]) { box('marmor', 3.2, 7, 3.2, s * 10.6, 0.3, S); box('goldGlanz', 3.6, 0.6, 3.6, s * 10.6, 7.3, S); box('led', 1.2, 1.2, 1.2, s * 10.6, 7.9, S); }
  for (let k = -8.6; k <= 8.6; k += 0.55) box('goldGlanz', 0.14, 5.2 + Math.cos(k / 8.6 * Math.PI / 2) * 1.2, 0.14, k, 0.3, S);
  box('goldGlanz', 17.6, 0.3, 0.3, 0, 5.6, S); box('goldGlanz', 17.6, 0.25, 0.25, 0, 0.8, S);
  put('goldGlanz', new THREE.TorusGeometry(1.6, 0.18, 10, 32), 0, 4.2, S + 0.1);
  // Allee + Brunnen-Kreisel
  box('marmor', 12, 0.36, 36, 0, 0, S - 18);
  put('marmor', new THREE.CylinderGeometry(15, 15, 0.36, 48), 0, 0.18, 26);
  put('stein', new THREE.CylinderGeometry(7, 7.4, 1.0, 40), 0, 0.8, 26); put('wasser', new THREE.CylinderGeometry(6.5, 6.5, 0.2, 40), 0, 1.25, 26);
  put('marmor', new THREE.CylinderGeometry(1.2, 1.6, 3, 16), 0, 2.7, 26); put('wasser', new THREE.CylinderGeometry(2.8, 1.2, 0.5, 24), 0, 4.4, 26);
  put('goldGlanz', new THREE.BoxGeometry(0.7, 4.5, 0.7), -0.9, 6.6, 26, 0, 0, 0.35); put('goldGlanz', new THREE.BoxGeometry(0.7, 4.5, 0.7), 0.9, 6.6, 26, 0, 0, -0.35);
  box('marmor', 12, 0.36, 12, 0, 0, 7);
  const palmen = []; for (let k = 0; k < 5; k++) for (const s of [-1, 1]) palmen.push([s * 9, S - 4 - k * 8]);
  for (const a of [0.6, 1.4, 2.2, 3.0, 3.8, 4.6, 5.4]) palmen.push([Math.cos(a) * 19, 26 + Math.sin(a) * 19]);
  // ---------- Haupthaus (Front bei z = +1)
  const hz = -14; const W0 = 66, D0 = 28, H0 = 5.4; const W1 = 54, D1 = 22, H1 = 4.8; const W2 = 32, D2 = 16, H2 = 4.4;
  const y0 = 0.3, y1 = y0 + H0 + 0.5, y2 = y1 + H1 + 0.5, y3 = y2 + H2 + 0.5;
  // EG: Marmorsockel, Glasfront mit Goldpfosten, Steinwände
  box('marmor', W0 + 6, 0.5, D0 + 8, 0, 0.3 - 0.2, hz + 2);
  box('stein', 14, H0, D0, -W0 / 2 + 7, y0, hz); box('putz', W0 - 14, H0, D0 - 1, 7, y0, hz - 0.5);
  box('glas', W0 - 16, H0 - 0.4, 0.1, 7, y0 + 0.2, hz + D0 / 2 + 0.02);
  for (let k = 0; k <= 10; k++) box('goldGlanz', 0.16, H0 - 0.4, 0.16, 7 - (W0 - 16) / 2 + k * (W0 - 16) / 10, y0 + 0.2, hz + D0 / 2 + 0.08);
  box('anthrazit', W0 + 4, 0.5, D0 + 6, 0, y0 + H0, hz + 1.5); box('led', W0 + 4, 0.08, 0.08, 0, y0 + H0 + 0.05, hz + 1.5 + (D0 + 6) / 2);
  // 1. OG: auskragend, Holz + Glas, davor Infinity-Pool mit Glaskante
  box('holz', W1, H1, D1, -3, y1, hz - 3); box('glas', W1 * 0.7, H1 - 0.6, 0.1, -3 - W1 * 0.12, y1 + 0.3, hz - 3 + D1 / 2 + 0.03);
  box('anthrazit', W1 + 3, 0.45, D1 + 4, -3, y1 + H1, hz - 3); box('led', W1 + 3, 0.08, 0.08, -3, y1 + H1 + 0.05, hz - 3 + (D1 + 4) / 2);
  box('stein', 34, 0.6, 7.6, 6, y1, hz + D0 / 2 - 2.5); box('wasser', 33, 0.25, 6.6, 6, y1 + 0.5, hz + D0 / 2 - 2.5); box('glas', 34, 1.2, 0.08, 6, y1, hz + D0 / 2 + 1.25);
  // 2. OG: Penthouse ganz aus Glas, Dachterrasse, Hubschrauberlandeplatz
  box('glas', W2, H2, D2, 8, y2, hz - 4); for (let k = 0; k <= 8; k++) box('goldGlanz', 0.16, H2, 0.16, 8 - W2 / 2 + k * W2 / 8, y2, hz - 4 + D2 / 2 + 0.05);
  box('anthrazit', W2 + 2, 0.4, D2 + 2, 8, y3 - 0.5, hz - 4); box('led', W2 + 2, 0.08, 0.08, 8, y3 - 0.45, hz - 4 + (D2 + 2) / 2);
  put('anthrazit', new THREE.CylinderGeometry(8.5, 8.5, 0.5, 40), -16, y2 + 0.25, hz - 4); box('anthrazit', 0.5, H1 + 0.5, 0.5, -16, y1 - 0.2, hz - 4);
  put('linie', new THREE.TorusGeometry(6.8, 0.18, 6, 40), -16, y2 + 0.52, hz - 4, Math.PI / 2);
  box('linie', 1, 0.05, 6, -18, y2 + 0.5, hz - 4); box('linie', 1, 0.05, 6, -14, y2 + 0.5, hz - 4); box('linie', 3, 0.05, 1, -16, y2 + 0.5, hz - 4);
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; box('led', 0.3, 0.2, 0.3, -16 + Math.cos(a) * 8.2, y2 + 0.5, hz - 4 + Math.sin(a) * 8.2); }
  // Hubschrauber
  const hy = y2 + 0.5;
  put('heli', new THREE.SphereGeometry(1.7, 20, 14).scale(1.6, 1, 1), -16, hy + 1.9, hz - 4);
  put('glas', new THREE.SphereGeometry(1.3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.2, 0.9, 1), -14.2, hy + 2.1, hz - 4, 0, 0, -0.5);
  put('heli', new THREE.CylinderGeometry(0.25, 0.45, 6, 10).rotateZ(Math.PI / 2), -20.5, hy + 2.2, hz - 4);
  put('heli', new THREE.BoxGeometry(0.15, 1.6, 0.9), -23.4, hy + 2.8, hz - 4);
  for (const s of [-1, 1]) box('anthrazit', 4.2, 0.12, 0.12, -16, hy + 0.15, hz - 4 + s * 1.2);
  for (const a of [0, Math.PI / 2]) put('anthrazit', new THREE.BoxGeometry(11, 0.06, 0.35), -16, hy + 3.7, hz - 4, 0, a + 0.4);
  // Schriftzug an der Fassade
  // Garage-Showroom mit 5 Sportwagen (offene Front, LED-Decke)
  const gx = -44, gz = 12; box('marmor', 34, 0.3, 14, gx, 0.3, gz); box('anthrazit', 34, 0.5, 14, gx, 5.6, gz); for (let k = 0; k < 5; k++) box('led', 0.4, 0.05, 12, gx - 13.6 + k * 6.8, 5.55, gz);
  box('anthrazit', 34, 5.3, 0.4, gx, 0.6, gz - 7); box('anthrazit', 0.4, 5.3, 14, gx - 17, 0.6, gz); box('anthrazit', 0.4, 5.3, 14, gx + 17, 0.6, gz);
  for (let k = 0; k <= 5; k++) box('goldGlanz', 0.2, 5.3, 0.2, gx - 17 + k * 6.8, 0.6, gz + 7);
  box('wand', 33, 4.6, 0.1, gx, 0.7, gz - 6.7); // beleuchtete Rückwand – Autos stehen im Licht
  // Hauptpool mit Poolhaus, Liegen
  const px = 40, pz = 22; box('marmor', 36, 0.32, 18, px, 0.3, pz); box('wasser', 30, 0.15, 12, px, 0.55, pz);
  for (let k = 0; k < 6; k++) { box('weiss', 0.9, 0.35, 2.2, px - 13 + k * 5, 0.62, pz + 7.6); box('weiss', 0.9, 0.7, 0.14, px - 13 + k * 5, 0.8, pz + 6.6); }
  box('putz', 12, 3.6, 7, px + 6, 0.3, pz - 13); box('glas', 9, 2.8, 0.08, px + 6, 0.6, pz - 9.5); box('anthrazit', 14, 0.35, 9, px + 6, 3.9, pz - 13);
  box('led', 30, 0.06, 0.06, px, 0.62, pz + 6.05);
  // Tennisplatz
  const tx = 40, tz = -38; box('court', 24, 0.1, 12, tx, 0.3, tz);
  for (const [w, d, ox, oz] of [[24, 0.1, 0, 6], [24, 0.1, 0, -6], [0.1, 12, 12, 0], [0.1, 12, -12, 0], [0.1, 9, 0, 0], [12.8, 0.1, 0, 0]]) box('linie', w, 0.02, d, tx + ox, 0.4, tz + oz);
  box('weiss', 0.1, 1, 12, tx, 0.4, tz);
  for (const [w, d, ox, oz] of [[28, 0.1, 0, 8], [28, 0.1, 0, -8], [0.1, 16, 14, 0], [0.1, 16, -14, 0]]) box('zaun', w, 3.5, d, tx + ox, 0.3, tz + oz);
  // Gartenleuchten entlang der Allee
  for (let k = 0; k < 9; k++) for (const s of [-1, 1]) box('led', 0.25, 0.8, 0.25, s * 6.6, 0.3, S - 4 - k * 4.4);
  // Zusammenfassen
  const grp = new THREE.Group(); grp.name = 'praesidentenvilla'; scene.add(grp);
  for (const k in parts) if (parts[k].length) { const m = new THREE.Mesh(mergeGeometries(parts[k]), M[k]); m.castShadow = !['wasser', 'rasen', 'led', 'linie', 'zaun'].includes(k); m.receiveShadow = true; grp.add(m); }
  // Palmen (Stamm leicht gebogen + 9 Wedel)
  const stamm = []; for (let i = 0; i < 6; i++) stamm.push(new THREE.CylinderGeometry(0.28 - i * 0.02, 0.32 - i * 0.02, 1.6, 8).translate(i * 0.12, 0.8 + i * 1.55, 0));
  const wedel = []; for (let i = 0; i < 9; i++) { const g = new THREE.ConeGeometry(0.55, 4.6, 4).scale(1, 1, 0.15).translate(0, 2.3, 0).rotateZ(-1.2).rotateY(i / 9 * Math.PI * 2).translate(0.7, 9.4, 0); wedel.push(g); }
  const stammG = mergeGeometries(stamm), wedelG = mergeGeometries(wedel);
  const sI = new THREE.InstancedMesh(stammG, M.rinde, palmen.length), wI = new THREE.InstancedMesh(wedelG, M.palme, palmen.length);
  palmen.forEach(([px2, pz2], i) => { const m = new THREE.Matrix4().multiplyMatrices(base, new THREE.Matrix4().compose(new THREE.Vector3(px2, 0.3, pz2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, i * 1.3, 0)), new THREE.Vector3().setScalar(1 + (i % 3) * 0.08))); sI.setMatrixAt(i, m); wI.setMatrixAt(i, m); });
  sI.castShadow = wI.castShadow = true; sI.frustumCulled = wI.frustumCulled = false; grp.add(sI, wI);
  // Sportwagen (keilförmig) in Showroom + am Brunnen
  const prof = new THREE.Shape([[0, 0.25], [0, 0.85], [1.2, 1.0], [1.9, 1.22], [3.0, 1.18], [3.9, 0.82], [4.6, 0.62], [4.65, 0.25]].map(([a, b]) => new THREE.Vector2(a, b)));
  const karo = new THREE.ExtrudeGeometry(prof, { depth: 1.95, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 }).translate(-2.3, 0, -0.97);
  const lacke = [0xd4af37, 0x8b0f14, 0x111318, 0xf2f2f2, 0x1b3a6b, 0x0f8a4a];
  const autos = []; for (let k = 0; k < 5; k++) autos.push([gx - 13.6 + k * 6.8, 0.6, gz + 1, Math.PI / 2 + 0.0]); autos.push([7, 0.66, 12, 0.2]);
  const aI = new THREE.InstancedMesh(karo, new THREE.MeshPhysicalMaterial({ roughness: 0.2, metalness: 0.7, clearcoat: 1, clearcoatRoughness: 0.05 }), autos.length);
  const rI = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.36, 0.36, 2.05, 16).rotateX(Math.PI / 2), M.anthrazit, autos.length * 2);
  autos.forEach(([ax, ay, az, ar], i) => { const m = new THREE.Matrix4().multiplyMatrices(base, new THREE.Matrix4().compose(new THREE.Vector3(ax, ay, az), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ar, 0)), new THREE.Vector3(1, 1, 1))); aI.setMatrixAt(i, m); aI.setColorAt(i, new THREE.Color(lacke[i % lacke.length])); for (const [o, j] of [[1.4, 0], [-1.4, 1]]) rI.setMatrixAt(i * 2 + j, m.clone().multiply(new THREE.Matrix4().setPosition(o, 0.36, 0))); });
  aI.castShadow = true; aI.frustumCulled = rI.frustumCulled = false; grp.add(aI, rI);
  // Riesiger goldener Schriftzug auf dem Dach des Erdgeschosses
  const c = document.createElement('canvas'); c.width = 2048; c.height = 256; const g = c.getContext('2d');
  let size = 190; g.font = `900 ${size}px Montserrat, sans-serif`; while (g.measureText(name).width > 1960) { size -= 6; g.font = `900 ${size}px Montserrat, sans-serif`; }
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 14; g.strokeStyle = 'rgba(15,10,0,0.9)'; g.strokeText(name, 1024, 128);
  const gr = g.createLinearGradient(0, 30, 0, 226); gr.addColorStop(0, '#fff3c0'); gr.addColorStop(0.5, '#e8bd4c'); gr.addColorStop(1, '#a87e1c'); g.fillStyle = gr; g.fillText(name, 1024, 128);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const schriftM = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.3, emissive: 0xffd27a, emissiveMap: tex, emissiveIntensity: 0.8, metalness: 0.6, roughness: 0.3 });
  const sm = new THREE.Mesh(new THREE.PlaneGeometry(40, 5), schriftM); sm.applyMatrix4(new THREE.Matrix4().multiplyMatrices(base, new THREE.Matrix4().setPosition(-3, y1 + H1 + 3.2, hz - 3 + D1 / 2 + 1.8))); grp.add(sm);
  const P0 = (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyMatrix4(base).toArray();
  return {
    group: grp,
    punkte: { tor: P0(0, 4, S), brunnen: P0(0, 4, 26), haus: P0(0, 8, hz), pool1: P0(6, y1 + 1, hz + D0 / 2 - 2.5), garage: P0(gx, 2, gz), pool: P0(px, 1, pz), tennis: P0(tx, 1, tz), heli: P0(-16, hy + 2, hz - 4), schrift: P0(-3, y1 + H1 + 3, hz + 8) },
    nacht(n) { M.glas.emissiveIntensity = 0.1 + n * n * 0.42; M.licht.emissiveIntensity = 0.3 + n * 3; M.led.emissiveIntensity = 1.2 + n * 3; M.wasser.emissiveIntensity = 0.35 + n * 1.6; schriftM.emissiveIntensity = 0.8 + n * 1.5; },
  };
}
