// Villenviertel: Jeder Follower bekommt eine moderne Luxusvilla mit Namen.
// Alle Villen werden pro Material zu einem Mesh zusammengefasst (wenige Draw-Calls trotz vieler Details).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRng } from './rng.js';

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
    const box = (mat, w, h, d, x, y, z) => put(mat, new THREE.BoxGeometry(w, h, d), x, y + h / 2, z);
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
  zypM.castShadow = true; grp.add(zypM);
  // Autos: Sportwagen-Silhouette
  const karo = mergeGeometries([new THREE.BoxGeometry(4.5, 0.6, 1.95).translate(0, 0.55, 0), new THREE.BoxGeometry(2.1, 0.5, 1.7).translate(-0.3, 1.05, 0)]);
  const reifen = new THREE.CylinderGeometry(0.36, 0.36, 2.0, 14).rotateX(Math.PI / 2);
  const am = new THREE.InstancedMesh(karo, new THREE.MeshPhysicalMaterial({ roughness: 0.25, metalness: 0.6, clearcoat: 1 }), autos.length);
  const rm = new THREE.InstancedMesh(reifen, M.anthrazit, autos.length * 2);
  autos.forEach((a, i) => { am.setMatrixAt(i, a.m); am.setColorAt(i, new THREE.Color(a.c)); for (const [s, k] of [[1.45, 0], [-1.45, 1]]) { const mm = a.m.clone().multiply(new THREE.Matrix4().setPosition(s, 0.36, 0)); rm.setMatrixAt(i * 2 + k, mm); } });
  am.castShadow = true; grp.add(am, rm);
  // Schrift (eine Geometrie mit Atlas-UVs)
  const sg = []; for (const s of schrift) { const g = new THREE.PlaneGeometry(s.w, s.h); const [u0, v0, u1, v1] = atlas.uv(s.i); const uv = g.attributes.uv; uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0); g.applyMatrix4(s.m); sg.push(g); }
  const schriftM = new THREE.MeshStandardMaterial({ map: atlas.tex, transparent: true, alphaTest: 0.25, emissive: 0xffd27a, emissiveMap: atlas.tex, emissiveIntensity: 0.35, roughness: 0.4, metalness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
  if (sg.length) grp.add(new THREE.Mesh(mergeGeometries(sg), schriftM));

  return {
    villen, group: grp,
    nacht(n) { M.glas.emissiveIntensity = n * n * 0.75; M.licht.emissiveIntensity = 0.2 + n * 3; M.wasser.emissiveIntensity = 0.25 + n * 1.4; schriftM.emissiveIntensity = 0.35 + n * 1.2; },
  };
}
