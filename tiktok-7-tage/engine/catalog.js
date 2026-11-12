// Gebäude-Katalog für die Bauplätze. Neue Folgen tragen in serie/stadt-status.json z. B.
//   { "typ": "krankenhaus", "platz": "B2", "status": "fertig", "name": "KRANKENHAUS" }
// ein – die Engine stellt das Gebäude dann automatisch an diesen Bauplatz (status: "fertig" | "im_bau").
import * as THREE from 'three';
import { textTexture } from './world.js';
import { makeRng } from './rng.js';

const M = (hex, o = {}) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.75, ...o });
const glow = (hex, i = 1.5) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: hex, emissiveIntensity: i });

export const KATALOG = {
  wohnhaus:     { name: 'WOHNHAUS',      farbe: 0xb8a58c, akzent: 0xd98b3a, h: 22, w: 34, d: 22, fenster: true },
  supermarkt:   { name: 'SUPERMARKT',    farbe: 0x8b8f94, akzent: 0x2fbf71, h: 8,  w: 40, d: 30 },
  krankenhaus:  { name: 'KRANKENHAUS',   farbe: 0xe8ebee, akzent: 0xd63a3a, h: 26, w: 38, d: 26, fenster: true, symbol: 'kreuz' },
  feuerwache:   { name: 'FEUERWACHE',    farbe: 0x8e2b22, akzent: 0xf2c94c, h: 11, w: 36, d: 24, tore: 0xb32b22 },
  polizei:      { name: 'POLIZEI',       farbe: 0x3d4a5c, akzent: 0x3a86ff, h: 14, w: 32, d: 22, fenster: true },
  schule:       { name: 'SCHULE',        farbe: 0xc9a46a, akzent: 0xf2994a, h: 13, w: 40, d: 24, fenster: true },
  bunker:       { name: 'SCHUTZBUNKER',  farbe: 0x5b5e57, akzent: 0xf2c94c, h: 5,  w: 30, d: 30, bunker: true },
  farm:         { name: 'GEWÄCHSHAUS',   farbe: 0x9fd8b0, akzent: 0x27ae60, h: 6,  w: 38, d: 26, glas: true },
  kraftwerk:    { name: 'SOLARKRAFTWERK',farbe: 0x1d2a44, akzent: 0xf2c94c, h: 2,  w: 40, d: 40, solar: true },
  wasserwerk:   { name: 'WASSERWERK',    farbe: 0x7d93a6, akzent: 0x2d9cdb, h: 10, w: 30, d: 24, tank: true },
  funkturm:     { name: 'FUNKTURM',      farbe: 0x8a8f96, akzent: 0xff3b30, h: 6,  w: 14, d: 14, turm: 70 },
  lager:        { name: 'VORRATSLAGER',  farbe: 0x6d6a60, akzent: 0xf2994a, h: 10, w: 40, d: 28, tore: 0x4a4a4a },
  rathaus:      { name: 'RATHAUS',       farbe: 0xd8cfc0, akzent: 0x39e6ff, h: 20, w: 36, d: 26, fenster: true, kuppel: true },
  doener:       { name: 'DÖNER',         farbe: 0xf1ead8, akzent: 0xd62828, h: 4.6, w: 16, d: 11, spezial: true },
  stadion:      { name: 'SV VALENHEIM 07', farbe: 0x1f3d8a, akzent: 0xf2c230, h: 9, w: 46, d: 46, spezial: true },
  bunker_tief:  { name: 'SCHUTZBUNKER',  farbe: 0x5b5e57, akzent: 0xf2c94c, h: 4.5, w: 30, d: 30, spezial: true },
  bank:         { name: 'BANK', farbe: 0xe8e1d0, akzent: 0xc9a227, h: 12, w: 26, d: 14, spezial: true },
  burger:       { name: "LOUIS' BURGER", farbe: 0x1f6fd1, akzent: 0xff8a1f, h: 5.5, w: 18, d: 12, spezial: true },
  freizeitpark: { name: 'FREIZEITPARK', farbe: 0x3f5a2a, akzent: 0xff3b8a, h: 0, w: 46, d: 46, spezial: true },
  militaer:     { name: 'MILITÄRSTATION',farbe: 0x4a5236, akzent: 0xc9a227, h: 7,  w: 30, d: 18, spezial: true },
  park:         { name: 'PARK',          farbe: 0x3f5a2a, akzent: 0x6fcf97, h: 0,  w: 44, d: 44, park: true },
};

export function buildBuilding(typ, { status = 'fertig', name, seed = 1, fortschritt = 0.5 } = {}) {
  const def = KATALOG[typ] || KATALOG.lager;
  const g = new THREE.Group();
  const r = makeRng(seed);
  const add = (geo, mat, x, y, z, cast = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; g.add(m); return m; };
  const fac = M(def.farbe); const acc = M(def.akzent, { roughness: 0.5 });
  const hMul = status === 'im_bau' ? Math.max(0.15, fortschritt) : 1;
  const H = def.h * hMul;

  if (typ === 'doener') return buildDoener(g, add, name || def.name, r);
  if (typ === 'militaer') return buildMilitaer(g, add, name || def.name, r);
  if (typ === 'stadion') return buildStadion(g, add, name || def.name, r);
  if (typ === 'bank') return buildBank(g, add, name || def.name, r);
  if (typ === 'burger') return buildBurger(g, add, name || def.name, r);
  if (typ === 'freizeitpark') return buildFreizeitpark(g, add, name || def.name, r);
  if (typ === 'bunker_tief') return buildBunker(g, add, name || def.name, r);
  if (def.park) {
    add(new THREE.CylinderGeometry(18, 18, 0.15, 40), M(0x2f4a22, { roughness: 1 }), 0, 0.08, 0, false);
    for (let k = 0; k < 18; k++) {
      const a = r.range(0, 6.28), d = r.range(4, 16);
      add(new THREE.IcosahedronGeometry(r.range(1.5, 2.6), 0), M(0x4f7a2a, { flatShading: true }), Math.cos(a) * d, r.range(3.5, 5), Math.sin(a) * d);
      add(new THREE.CylinderGeometry(0.18, 0.25, 3.5, 6), M(0x3a2a1e), Math.cos(a) * d, 1.75, Math.sin(a) * d);
    }
  } else if (def.solar) {
    for (let x = -16; x <= 16; x += 4) for (let z = -16; z <= 16; z += 6) {
      const p = add(new THREE.BoxGeometry(3.6, 0.08, 4.6), M(0x0e1a33, { roughness: 0.25, metalness: 0.5 }), x, 1.4, z);
      p.rotation.x = -0.45; add(new THREE.BoxGeometry(0.1, 1.4, 0.1), M(0x777777), x, 0.7, z, false);
    }
  } else {
    add(new THREE.BoxGeometry(def.w, H, def.d), fac, 0, H / 2, 0);
    if (def.fenster && H > 4) {
      const winM = M(0x0e141c, { roughness: 0.15, metalness: 0.3, emissive: 0xffb36b, emissiveIntensity: status === 'fertig' ? 0.18 : 0 });
      for (let y = 3; y < H - 1.5; y += 3.4) {
        add(new THREE.BoxGeometry(def.w + 0.06, 1.6, def.d * 0.86), winM, 0, y + 0.6, 0, false);
        add(new THREE.BoxGeometry(def.w * 0.9, 1.6, def.d + 0.06), winM, 0, y + 0.6, 0, false);
      }
    }
    add(new THREE.BoxGeometry(def.w + 0.4, 0.8, def.d + 0.4), acc, 0, H + 0.2, 0); // Attika in Akzentfarbe
    if (def.tore) for (let x = -def.w / 2 + 5; x < def.w / 2 - 3; x += 7) add(new THREE.BoxGeometry(5, 4.5, 0.3), M(def.tore, { metalness: 0.4 }), x, 2.25, -def.d / 2 - 0.1);
    if (def.glas) { const gm = M(0xbfe8d0, { transparent: true, opacity: 0.35, roughness: 0.1 }); add(new THREE.CylinderGeometry(def.d / 2, def.d / 2, def.w, 20, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), gm, 0, H, 0); }
    if (def.bunker) { add(new THREE.BoxGeometry(8, 3.5, 6), M(0x3a3c38), 0, 1.75, -def.d / 2 - 2); add(new THREE.BoxGeometry(5, 3, 0.4), M(0x1a1a1a), 0, 1.5, -def.d / 2 - 5.1); }
    if (def.tank) for (const x of [-8, 8]) add(new THREE.CylinderGeometry(5, 5, 14, 20), M(0x9fb3c4, { metalness: 0.5, roughness: 0.4 }), x, 7, def.d / 2 + 6);
    if (def.turm) { add(new THREE.CylinderGeometry(0.6, 2.2, def.turm, 6), M(0x9aa0a6, { metalness: 0.6 }), 0, H + def.turm / 2, 0); add(new THREE.SphereGeometry(0.8, 8, 6), glow(0xff3b30, 3), 0, H + def.turm, 0, false); }
    if (def.kuppel) add(new THREE.SphereGeometry(7, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M(0x6b8fa0, { metalness: 0.6, roughness: 0.3 }), 0, H + 0.6, 0);
    if (def.symbol === 'kreuz' && status === 'fertig') { const k = glow(0xff2a2a, 2.5); add(new THREE.BoxGeometry(1.2, 4.2, 0.3), k, 0, H - 4, -def.d / 2 - 0.3, false); add(new THREE.BoxGeometry(4.2, 1.2, 0.3), k, 0, H - 4, -def.d / 2 - 0.3, false); }
  }
  // Schild
  if (status === 'fertig') {
    const tex = textTexture(name || def.name, { w: 1024, h: 200, bg: 'rgba(8,12,16,0.85)', color: '#ffffff', font: '900 120px Montserrat' });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.7), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.6, transparent: true }));
    s.position.set(0, Math.max(H, 3) + 2.4, -Math.max(def.d, 10) / 2 - 0.5); s.rotation.y = Math.PI; g.add(s);
  }
  if (status === 'im_bau') {
    const pole = M(0xd9a21b, { metalness: 0.5 });
    for (let x = -def.w / 2 - 1; x <= def.w / 2 + 1; x += 3) for (const z of [-def.d / 2 - 1, def.d / 2 + 1]) add(new THREE.BoxGeometry(0.12, H + 2, 0.12), pole, x, (H + 2) / 2, z);
    for (let y = 2; y < H + 2; y += 2) for (const z of [-def.d / 2 - 1, def.d / 2 + 1]) add(new THREE.BoxGeometry(def.w + 2, 0.1, 0.8), M(0x8a6a3a), 0, y, z, false);
    // Kran
    add(new THREE.BoxGeometry(1.2, 48, 1.2), pole, def.w / 2 + 4, 24, 0);
    add(new THREE.BoxGeometry(34, 1.0, 1.0), pole, def.w / 2 - 8, 47.5, 0);
    add(new THREE.BoxGeometry(3, 2.2, 2.2), M(0x333333), def.w / 2 + 4, 46, 0);
  }
  return g;
}

// Blaupausen-Hologramm (zeigt, was auf einem Bauplatz entstehen KÖNNTE)
export function makeBlueprint(form = 'turm') {
  const g = new THREE.Group();
  const lineMat = new THREE.LineBasicMaterial({ color: 0x47e3ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const faceMat = new THREE.MeshBasicMaterial({ color: 0x0f6a85, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const shapes = form === 'turm'
    ? [[30, 22, 30, 0], [22, 26, 22, 22], [14, 14, 14, 48]]
    : [[42, 9, 32, 0], [16, 5, 16, 9]];
  const inner = new THREE.Group(); g.add(inner);
  for (const [w, h, d, y] of shapes) {
    const geo = new THREE.BoxGeometry(w, h, d, Math.round(w / 4), Math.round(h / 3.5), Math.round(d / 4)).translate(0, y + h / 2, 0);
    inner.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d).translate(0, y + h / 2, 0)), lineMat));
    inner.add(new THREE.LineSegments(new THREE.WireframeGeometry(geo), new THREE.LineBasicMaterial({ color: 0x1aa6c9, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false })));
    inner.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d).translate(0, y + h / 2, 0), faceMat));
  }
  // Bodenraster
  const grid = new THREE.GridHelper(46, 23, 0x47e3ff, 0x1a7f99);
  grid.material.transparent = true; grid.material.opacity = 0.55; grid.material.blending = THREE.AdditiveBlending; grid.material.depthWrite = false;
  grid.position.y = 0.06; g.add(grid);
  return { g, update(lt, fade = 1) {
    const k = Math.max(0, Math.min(1, lt / 1.4)); const e = 1 - Math.pow(1 - k, 3);
    inner.scale.set(1, Math.max(0.001, e), 1);
    const flick = lt < 0.3 ? (Math.sin(lt * 90) > 0 ? 1 : 0.3) : 1;
    lineMat.opacity = 0.95 * flick * fade; faceMat.opacity = 0.16 * fade; grid.material.opacity = 0.5 * Math.min(1, lt * 3) * fade;
    g.visible = lt >= 0 && fade > 0.001;
  } };
}

// ---------------------------------------------------------------- Döner-Imbiss (klein, vorne am Platz, mit Terrasse)
function buildDoener(g, add, name, r) {
  const Z = -12; // Richtung Platz verschoben
  const wand = M(0xf1ead8), rot = M(0xc81e1e, { roughness: 0.6 }), gelb = M(0xf2b705, { roughness: 0.6 }), dunkel = M(0x1d1d1f);
  // Terrasse
  add(new THREE.BoxGeometry(24, 0.12, 12), M(0x8a7b6a, { roughness: 0.9 }), 0, 0.06, Z - 9.5, false);
  // Gebäude
  add(new THREE.BoxGeometry(16, 4.6, 11), wand, 0, 2.3, Z);
  add(new THREE.BoxGeometry(16.4, 0.5, 11.4), rot, 0, 4.85, Z);
  add(new THREE.BoxGeometry(16.4, 0.18, 11.4), gelb, 0, 4.55, Z);
  // Schaufenster mit warmem Licht
  const glas = new THREE.MeshStandardMaterial({ color: 0x1a0f08, emissive: 0xffb15a, emissiveIntensity: 0.85, roughness: 0.15 });
  add(new THREE.BoxGeometry(11, 2.6, 0.1), glas, -1.6, 1.9, Z - 5.52, false);
  add(new THREE.BoxGeometry(2.2, 3.0, 0.12), M(0x3a2a1e), 5.6, 1.5, Z - 5.52, false); // Tür
  // Dönerspieß hinter der Scheibe (glüht)
  add(new THREE.CylinderGeometry(0.28, 0.42, 1.3, 12), new THREE.MeshStandardMaterial({ color: 0x7a3a12, emissive: 0xff6a1a, emissiveIntensity: 0.9, roughness: 0.8 }), -4.5, 1.75, Z - 4.6, false);
  add(new THREE.BoxGeometry(0.9, 1.6, 0.2), new THREE.MeshStandardMaterial({ color: 0x220a00, emissive: 0xff3a00, emissiveIntensity: 1.6 }), -4.5, 1.75, Z - 4.1, false);
  // Markise rot/weiß gestreift
  for (let k = 0; k < 8; k++) {
    const m = add(new THREE.BoxGeometry(2.0, 0.08, 2.6), k % 2 ? M(0xf4f4f0) : rot, -7 + k * 2, 3.3, Z - 6.8);
    m.rotation.x = 0.32;
  }
  // Leuchtschild
  const tex = textTexture(name, { w: 1024, h: 200, bg: '#c81e1e', color: '#ffe8a3', font: '900 132px Montserrat' });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.7), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.9 }));
  sign.position.set(0, 6.6, Z - 5.75); sign.rotation.y = Math.PI; g.add(sign);
  add(new THREE.BoxGeometry(14.4, 3.1, 0.3), dunkel, 0, 6.6, Z - 5.55);
  // Speisetafel
  const menu = textTexture(['DÖNER   7 €', 'DÜRÜM   8 €', 'AYRAN   2 €'], { w: 512, h: 512, bg: '#1b1b1b', color: '#ffffff', font: '800 64px Montserrat' });
  const tafel = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshStandardMaterial({ map: menu, emissive: 0xffffff, emissiveMap: menu, emissiveIntensity: 0.35 }));
  tafel.position.set(-11.0, 1.2, Z - 6.6); tafel.rotation.y = Math.PI - 0.4; g.add(tafel);
  // Tische mit Sonnenschirmen
  for (const [x, z] of [[-8, Z - 10], [-2.5, Z - 12], [3, Z - 10]]) {
    add(new THREE.CylinderGeometry(0.6, 0.6, 0.06, 14), M(0xeeeeee), x, 0.85, z);
    add(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), M(0x777777), x, 1.3, z, false);
    add(new THREE.ConeGeometry(1.8, 0.7, 10), r() < 0.5 ? rot : gelb, x, 2.75, z);
    for (const [dx, dz] of [[0.95, 0], [-0.95, 0]]) add(new THREE.BoxGeometry(0.45, 0.45, 0.45), M(0x4a3828), x + dx, 0.35, z + dz);
  }
  // Blumenkübel
  for (const x of [-11, 11]) { add(new THREE.BoxGeometry(1.2, 0.8, 1.2), M(0x5a5a5a), x, 0.4, Z - 15); add(new THREE.IcosahedronGeometry(0.8, 0), M(0x3f6a2a, { flatShading: true }), x, 1.2, Z - 15); }
  return g;
}

// ---------------------------------------------------------------- Militärstation mit (leider) nur EINER Rakete
function buildMilitaer(g, add, name, r) {
  const oliv = M(0x4a5236), olivD = M(0x353b26), beton = M(0x77776f), gelb = M(0xc9a227), weiss = M(0xe8e8e2, { roughness: 0.45 }), rot = M(0xb3201b, { roughness: 0.5 });
  // Betonfläche
  add(new THREE.BoxGeometry(46, 0.14, 46), beton, 0, 0.07, 0, false);
  // Hauptgebäude mit Tarnstreifen
  add(new THREE.BoxGeometry(30, 7, 16), oliv, -4, 3.5, 10);
  for (let k = 0; k < 6; k++) add(new THREE.BoxGeometry(r.range(3, 7), r.range(1.5, 4), 16.1), olivD, -16 + k * 5, r.range(1.5, 5), 10, false);
  add(new THREE.BoxGeometry(30.4, 0.6, 16.4), olivD, -4, 7.3, 10);
  add(new THREE.BoxGeometry(30.2, 0.4, 0.2), gelb, -4, 6.4, 1.9, false);
  // Schild
  const tex = textTexture(name, { w: 1024, h: 200, bg: '#20241a', color: '#e9d27a', font: '900 120px Montserrat' });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.7), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55 }));
  sign.position.set(-4, 9.4, 1.6); sign.rotation.y = Math.PI; g.add(sign);
  add(new THREE.BoxGeometry(14.3, 3.0, 0.3), olivD, -4, 9.4, 1.85);
  // Tore
  for (const x of [-14, -7]) add(new THREE.BoxGeometry(5, 4.5, 0.3), M(0x2a2e22, { metalness: 0.4 }), x, 2.25, 1.85, false);
  // Hubschrauber-Landeplatz
  add(new THREE.CylinderGeometry(7, 7, 0.08, 36), M(0x2d2f30), 12, 0.18, 12, false);
  const hTex = textTexture('H', { w: 256, h: 256, color: '#f2f2f2', font: '900 200px Montserrat' });
  const hm = new THREE.Mesh(new THREE.PlaneGeometry(6, 6).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: hTex, transparent: true }));
  hm.position.set(12, 0.24, 12); hm.rotation.y = Math.PI; g.add(hm);
  // Wachturm
  for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) add(new THREE.BoxGeometry(0.22, 9, 0.22), olivD, 19 + dx, 4.5, -19 + dz);
  add(new THREE.BoxGeometry(3.4, 2.2, 3.4), oliv, 19, 10.1, -19);
  add(new THREE.BoxGeometry(3.8, 0.3, 3.8), olivD, 19, 11.35, -19);
  // Radarschüssel
  add(new THREE.CylinderGeometry(0.3, 0.5, 5, 8), olivD, -14, 9.5, 14);
  const dish = add(new THREE.SphereGeometry(2.4, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.32), M(0xc9cbc4, { side: THREE.DoubleSide, metalness: 0.4 }), -14, 12.4, 14);
  dish.rotation.x = -1.0;
  // Raketenwerfer: 4 Startschienen – nur EINE ist belegt
  const lw = new THREE.Group(); lw.position.set(8, 0, -9); lw.rotation.y = -0.5; g.add(lw);
  const addL = (geo, mat, x, y, z, cast = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; lw.add(m); return m; };
  addL(new THREE.BoxGeometry(5, 1.2, 9), olivD, 0, 0.6, 0);                       // Fahrgestell
  for (const [x, z] of [[-2.3, -3], [2.3, -3], [-2.3, 0], [2.3, 0], [-2.3, 3], [2.3, 3]]) addL(new THREE.CylinderGeometry(0.7, 0.7, 0.5, 12).rotateZ(Math.PI / 2), M(0x151515), x, 0.7, z);
  addL(new THREE.BoxGeometry(3.2, 1.8, 2.4), oliv, 0, 2.1, -3.4);                  // Kabine
  const rack = new THREE.Group(); rack.position.set(0, 1.9, 1.2); rack.rotation.x = -0.75; lw.add(rack);
  for (let k = 0; k < 4; k++) {
    const x = -1.5 + k;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.2, 8.5), M(0x2a2e22, { metalness: 0.5 })); rail.position.set(x, 0, 2.5); rail.castShadow = true; rack.add(rail);
    if (k === 1) { // die einzige Rakete
      const rk = new THREE.Group(); rk.position.set(x, 0.55, 2.6); rack.add(rk);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 7, 16).rotateX(Math.PI / 2), weiss); body.castShadow = true; rk.add(body);
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.36, 1.4, 16).rotateX(Math.PI / 2), rot); nose.position.z = 4.2; rk.add(nose);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.35, 16).rotateX(Math.PI / 2), rot); band.position.z = 2.6; rk.add(band);
      for (let f = 0; f < 4; f++) { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 1.1), rot); fin.position.z = -3.0; fin.rotation.z = f * Math.PI / 2; fin.position.x = Math.sin(f * Math.PI / 2) * 0.5; fin.position.y = Math.cos(f * Math.PI / 2) * 0.5; rk.add(fin); }
    }
  }
  // Zaun der Station
  const zaun = M(0x3d4234, { metalness: 0.3 });
  for (let k = -21; k <= 21; k += 3.5) for (const [x, z, ry] of [[k, -22.5, 0], [k, 22.5, 0], [22.5, k, Math.PI / 2], [-22.5, k, Math.PI / 2]]) {
    if (z === -22.5 && Math.abs(k) < 5) continue; // Einfahrt zum Platz
    const m = add(new THREE.BoxGeometry(3.4, 2.4, 0.08), zaun, x, 1.3, z, false); m.rotation.y = ry;
  }
  // Sandsäcke an der Einfahrt
  for (const x of [-7, 7]) for (let k = 0; k < 3; k++) add(new THREE.BoxGeometry(2.6, 0.5, 1.2), M(0x9a8a62, { roughness: 1 }), x, 0.4 + k * 0.5, -23);
  return g;
}

// ---------------------------------------------------------------- Vereinswappen (Canvas)
export function wappenCanvas(name = 'SV VALENHEIM 07', size = 512) {
  const c = document.createElement('canvas'); c.width = size; c.height = size; const g = c.getContext('2d');
  const S = size / 512; g.scale(S, S);
  const shield = () => { g.beginPath(); g.moveTo(256, 20); g.lineTo(470, 80); g.lineTo(450, 300); g.quadraticCurveTo(400, 430, 256, 495); g.quadraticCurveTo(112, 430, 62, 300); g.lineTo(42, 80); g.closePath(); };
  shield(); g.fillStyle = '#f2c230'; g.fill();
  g.save(); g.translate(256, 262); g.scale(0.9, 0.9); g.translate(-256, -262); shield(); g.fillStyle = '#1f3d8a'; g.fill(); g.restore();
  g.save(); shield(); g.clip(); g.fillStyle = '#f2c230'; g.fillRect(232, 0, 48, 512); g.restore();
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '900 120px Montserrat'; g.strokeStyle = '#0b1a40'; g.lineWidth = 14; g.strokeText('SV', 256, 175); g.fillText('SV', 256, 175);
  g.font = '900 54px Montserrat'; g.strokeText('VALENHEIM', 256, 280); g.fillText('VALENHEIM', 256, 280);
  g.font = '900 100px Montserrat'; g.fillStyle = '#f2c230'; g.strokeText('07', 256, 380); g.fillText('07', 256, 380);
  return c;
}

// ---------------------------------------------------------------- Stadion des SV Valenheim 07
function buildStadion(g, add, name, r) {
  const blau = M(0x1f3d8a, { roughness: 0.6 }), gold = M(0xf2c230, { roughness: 0.5 }), beton = M(0x8a8a86), dunkel = M(0x2a2c30);
  add(new THREE.BoxGeometry(46, 0.14, 46), beton, 0, 0.07, 0, false);
  // Spielfeld
  const pc = document.createElement('canvas'); pc.width = 1024; pc.height = 680; const pg = pc.getContext('2d');
  for (let k = 0; k < 12; k++) { pg.fillStyle = k % 2 ? '#2f7d32' : '#36893a'; pg.fillRect(k * 1024 / 12, 0, 1024 / 12 + 1, 680); }
  pg.strokeStyle = '#f4f4f4'; pg.lineWidth = 6; pg.strokeRect(20, 20, 984, 640); pg.beginPath(); pg.moveTo(512, 20); pg.lineTo(512, 660); pg.stroke();
  pg.beginPath(); pg.arc(512, 340, 90, 0, 7); pg.stroke(); pg.strokeRect(20, 190, 130, 300); pg.strokeRect(874, 190, 130, 300); pg.strokeRect(20, 270, 50, 140); pg.strokeRect(954, 270, 50, 140);
  pg.globalAlpha = 0.85; pg.drawImage(wappenCanvas(name, 160), 432, 260, 160, 160); pg.globalAlpha = 1;
  const pt = new THREE.CanvasTexture(pc); pt.colorSpace = THREE.SRGBColorSpace; pt.anisotropy = 8;
  add(new THREE.PlaneGeometry(34, 22.6).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: pt, roughness: 0.9 }), 0, 0.16, 0, false);
  // Tore
  for (const sx of [-1, 1]) {
    const w = M(0xf4f4f4, { roughness: 0.4 });
    add(new THREE.BoxGeometry(0.15, 2.4, 0.15), w, sx * 16.6, 1.36, -3.6); add(new THREE.BoxGeometry(0.15, 2.4, 0.15), w, sx * 16.6, 1.36, 3.6);
    add(new THREE.BoxGeometry(0.15, 0.15, 7.35), w, sx * 16.6, 2.56, 0);
    add(new THREE.BoxGeometry(1.6, 2.4, 7.2), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, side: THREE.DoubleSide }), sx * 17.4, 1.36, 0, false);
  }
  // Tribünen (Stufen) an den Längsseiten und Stirnseiten
  const stufen = (len, along, side, axisX) => {
    for (let k = 0; k < 6; k++) {
      const d = 13 + k * 1.1, h = 0.6 + k * 0.75;
      const mat = (k % 2) ? blau : M(0x284fa8, { roughness: 0.6 });
      const geo = axisX ? new THREE.BoxGeometry(len, h, 1.1) : new THREE.BoxGeometry(1.1, h, len);
      if (axisX) add(geo, mat, 0, h / 2, side * d); else add(geo, mat, side * (d + 6), h / 2, 0);
    }
  };
  stufen(38, 0, -1, true); stufen(38, 0, 1, true); stufen(24, 0, -1, false); stufen(24, 0, 1, false);
  // Gold-Band "07" in den Sitzen der Gegentribüne
  // Dach über der Haupttribüne + Rückwand
  add(new THREE.BoxGeometry(40, 7, 0.6), dunkel, 0, 3.5, -20);
  const roof = add(new THREE.BoxGeometry(40, 0.4, 8), M(0xdddddd, { metalness: 0.5, roughness: 0.4 }), 0, 8.2, -16.5); roof.rotation.x = -0.08;
  // Anzeigetafel mit Wappen
  const wc = wappenCanvas(name, 512);
  const sb = document.createElement('canvas'); sb.width = 1024; sb.height = 400; const sg = sb.getContext('2d');
  sg.fillStyle = '#05070c'; sg.fillRect(0, 0, 1024, 400); sg.drawImage(wc, 20, 20, 360, 360);
  sg.fillStyle = '#f2c230'; sg.font = '900 96px Montserrat'; sg.fillText('SV VALENHEIM', 400, 150); sg.fillStyle = '#ffffff'; sg.font = '900 150px Montserrat'; sg.fillText('07', 400, 320);
  const st = new THREE.CanvasTexture(sb); st.colorSpace = THREE.SRGBColorSpace;
  const tafel = new THREE.Mesh(new THREE.PlaneGeometry(14, 5.5), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: st, emissiveIntensity: 1.0 }));
  tafel.position.set(0, 11.2, -19.6); g.add(tafel);
  add(new THREE.BoxGeometry(14.6, 6.1, 0.4), dunkel, 0, 11.2, -19.9);
  // Flutlichtmasten
  g.userData.flutlicht = [];
  for (const [x, z] of [[-21, -21], [21, -21], [-21, 21], [21, 21]]) {
    add(new THREE.CylinderGeometry(0.35, 0.6, 24, 8), M(0x9aa0a6, { metalness: 0.6 }), x, 12, z);
    const lm = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xfff4dd, emissiveIntensity: 0.0 });
    const p = add(new THREE.BoxGeometry(4, 2.4, 0.4), lm, x * 0.97, 24.5, z * 0.97, false); p.lookAt(0, 0, 0); g.userData.flutlicht.push(lm);
  }
  // Fahnen
  for (const x of [-12, -4, 4, 12]) { add(new THREE.CylinderGeometry(0.06, 0.06, 5, 6), M(0xcccccc), x, 9.5, -20.3, false); add(new THREE.BoxGeometry(1.8, 1.1, 0.04), (x / 4) % 2 ? gold : blau, x + 0.95, 11.4, -20.3, false); }
  // Eingangsschild zur Stadt hin
  const tex = textTexture(name, { w: 1024, h: 200, bg: '#1f3d8a', color: '#f2c230', font: '900 130px Montserrat' });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 3.1), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.5 }));
  sign.position.set(0, 9.0, -20.35); sign.rotation.y = Math.PI; g.add(sign);
  return g;
}

// ---------------------------------------------------------------- Schutzbunker: Eingang oben, Räume unter der Erde
function buildBunker(g, add, name, r) {
  const beton = M(0x6f706b, { roughness: 0.95 }), betonD = M(0x4a4b47), stahl = M(0x5a5f66, { metalness: 0.7, roughness: 0.35 });
  const gelbSchwarz = document.createElement('canvas'); gelbSchwarz.width = 256; gelbSchwarz.height = 64; { const x = gelbSchwarz.getContext('2d'); x.fillStyle = '#111'; x.fillRect(0, 0, 256, 64); x.fillStyle = '#f2c230'; for (let k = -2; k < 10; k++) { x.beginPath(); x.moveTo(k * 32, 64); x.lineTo(k * 32 + 16, 64); x.lineTo(k * 32 + 48, 0); x.lineTo(k * 32 + 32, 0); x.fill(); } }
  const hz = new THREE.CanvasTexture(gelbSchwarz); hz.colorSpace = THREE.SRGBColorSpace; hz.wrapS = THREE.RepeatWrapping; hz.repeat.set(4, 1);
  const hazard = new THREE.MeshStandardMaterial({ map: hz, roughness: 0.7 });
  // Oberfläche
  add(new THREE.BoxGeometry(32, 0.14, 32), M(0x5b5c58), 0, 0.07, 0, false);
  add(new THREE.BoxGeometry(14, 5, 10), beton, 0, 2.5, -6);                     // Eingangsbau
  add(new THREE.BoxGeometry(15, 0.8, 11), betonD, 0, 5.4, -6);
  add(new THREE.BoxGeometry(7.2, 4.0, 0.25), stahl, 0, 2.1, -11.05);              // Panzertür
  add(new THREE.BoxGeometry(7.6, 0.45, 0.3), hazard, 0, 4.35, -11.1, false);
  add(new THREE.BoxGeometry(0.3, 4.2, 0.3), hazard, -3.75, 2.1, -11.1, false); add(new THREE.BoxGeometry(0.3, 4.2, 0.3), hazard, 3.75, 2.1, -11.1, false);
  const tex = textTexture([name, 'NUR FÜR EINWOHNER'], { w: 1024, h: 300, bg: '#141414', color: '#f2c230', font: '900 100px Montserrat' });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.9), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55 }));
  sign.position.set(0, 7.3, -11.2); sign.rotation.y = Math.PI; g.add(sign);
  add(new THREE.BoxGeometry(10.4, 3.2, 0.3), betonD, 0, 7.3, -11.0);
  // Ausweis-Scanner
  add(new THREE.BoxGeometry(0.25, 1.3, 0.25), stahl, 4.6, 0.65, -12.6);
  add(new THREE.BoxGeometry(0.7, 0.9, 0.35), M(0x1d1f22), 4.6, 1.6, -12.6);
  const scanMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x2bff88, emissiveIntensity: 1.6 });
  add(new THREE.BoxGeometry(0.5, 0.55, 0.05), scanMat, 4.6, 1.65, -12.8, false);
  g.userData.scanner = scanMat;
  // Absperrung (Poller)
  for (const x of [-6, -3, 3, 6]) add(new THREE.CylinderGeometry(0.2, 0.2, 1.0, 10), hazard, x, 0.5, -14);
  // Lüftungsrohre
  for (const [x, z] of [[-10, 6], [10, 6], [0, 11]]) { add(new THREE.CylinderGeometry(0.6, 0.6, 2.2, 12), stahl, x, 1.1, z); add(new THREE.CylinderGeometry(0.9, 0.9, 0.2, 12), stahl, x, 2.3, z); }
  // --- Unterirdische Räume (y -11 bis -3), von innen sichtbar
  const UY = -7;
  const shell = new THREE.Mesh(new THREE.BoxGeometry(28, 8, 20), new THREE.MeshStandardMaterial({ color: 0x5e605a, roughness: 0.9, side: THREE.BackSide, emissive: 0x1c1d1a }));
  shell.position.set(0, UY, 0); shell.receiveShadow = true; g.add(shell);
  const fill = (hex, e = 0.3) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.8, emissive: hex, emissiveIntensity: e });
  // Deckenlichter
  for (const x of [-9, 0, 9]) for (const z of [-5, 5]) add(new THREE.BoxGeometry(3, 0.12, 0.4), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xfff1d6, emissiveIntensity: 2.4 }), x, UY + 3.9, z, false);
  // Gelb-schwarze Linie am Boden
  add(new THREE.BoxGeometry(26, 0.03, 0.5), hazard, 0, UY - 3.98, 0, false);
  // Stockbetten
  for (let k = 0; k < 5; k++) {
    const x = -12 + k * 2.6;
    for (const y of [0.5, 1.9]) { add(new THREE.BoxGeometry(2.0, 0.25, 0.95), fill(0x3b4a5c), x, UY - 4 + y, 8.6, false); add(new THREE.BoxGeometry(1.9, 0.15, 0.85), fill(0xd9d4c8, 0.35), x, UY - 4 + y + 0.18, 8.6, false); }
    for (const dx of [-0.95, 0.95]) add(new THREE.BoxGeometry(0.08, 2.4, 0.08), fill(0x555555), x + dx, UY - 2.8, 8.6, false);
  }
  // Vorräte: Kisten, Wasserfässer
  for (let k = 0; k < 14; k++) add(new THREE.BoxGeometry(1.1, 0.8, 0.9), fill(r() < 0.5 ? 0x6b5a3a : 0x4f5a3a), 8 + (k % 4) * 1.2, UY - 3.6 + Math.floor(k / 4) * 0.82, 8.4, false);
  for (let k = 0; k < 8; k++) add(new THREE.CylinderGeometry(0.4, 0.4, 1.1, 12), fill(0x1e5aa8, 0.35), 8 + (k % 4) * 1.0, UY - 3.45, 6.6 - Math.floor(k / 4) * 1.0, false);
  // Generator & Kontrolltisch
  add(new THREE.BoxGeometry(3, 2, 1.6), fill(0x4a5236), -11.5, UY - 3, -7.6, false);
  add(new THREE.BoxGeometry(5, 1, 2.2), fill(0x2a2c30), 0, UY - 3.5, -2, false);
  const screen = textTexture(['BUNKER-STATUS', 'PLÄTZE: 100', 'LUFT: OK · WASSER: OK'], { w: 1024, h: 512, bg: '#06121a', color: '#45e3ff', font: '800 90px Oxanium' });
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.1), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: screen, emissiveIntensity: 0.9 }));
  scr.position.set(0, UY - 1.6, -9.9); g.add(scr);
  // runde Druckschleuse an der Stirnwand
  const tuer = add(new THREE.CylinderGeometry(2.4, 2.4, 0.5, 32).rotateZ(Math.PI / 2), stahl, 13.8, UY - 1.5, 0, false);
  add(new THREE.TorusGeometry(2.45, 0.18, 8, 32).rotateY(Math.PI / 2), hazard, 13.7, UY - 1.5, 0, false);
  add(new THREE.TorusGeometry(0.8, 0.08, 8, 20).rotateY(Math.PI / 2), M(0xc9a227, { metalness: 0.8 }), 13.5, UY - 1.5, 0, false);
  g.userData.untergrundY = UY;
  return g;
}

// ---------------------------------------------------------------- Bank (klassizistisch, mit Säulen)
function buildBank(g, add, name, r) {
  const stein = M(0xe8e1d0, { roughness: 0.8 }), steinD = M(0xc9c0aa), gold = M(0xc9a227, { metalness: 0.85, roughness: 0.3 });
  add(new THREE.BoxGeometry(30, 0.14, 24), M(0x9a9488), 0, 0.07, -2, false);
  for (let k = 0; k < 3; k++) add(new THREE.BoxGeometry(24 - k * 0.8, 0.35, 4 - k * 1.1), steinD, 0, 0.17 + k * 0.35, -9.5 + k * 0.55);
  add(new THREE.BoxGeometry(24, 11, 12), stein, 0, 6.5, 0);
  add(new THREE.BoxGeometry(25, 1.0, 13), steinD, 0, 12.4, 0);
  // Giebel
  const shape = new THREE.Shape(); shape.moveTo(-12.5, 0); shape.lineTo(12.5, 0); shape.lineTo(0, 4); shape.closePath();
  const gieb = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 2.2, bevelEnabled: false }), stein); gieb.position.set(0, 12.9, -9.2); gieb.castShadow = true; g.add(gieb);
  add(new THREE.BoxGeometry(25, 0.8, 3), steinD, 0, 12.5, -8.1);
  for (let k = 0; k < 6; k++) { const x = -10 + k * 4; add(new THREE.CylinderGeometry(0.75, 0.85, 10.6, 16), stein, x, 6.9, -8.4); add(new THREE.BoxGeometry(2, 0.5, 2), steinD, x, 1.4, -8.4); add(new THREE.BoxGeometry(2, 0.5, 2), steinD, x, 12.0, -8.4); }
  // Tresortür hinter den Säulen
  add(new THREE.CylinderGeometry(2.4, 2.4, 0.4, 32).rotateX(Math.PI / 2), gold, 0, 4.2, -6.1, false);
  for (let k = 0; k < 6; k++) { const sp = add(new THREE.BoxGeometry(0.18, 2.0, 0.15), M(0x8a6a10, { metalness: 0.8 }), 0, 4.2, -6.4, false); sp.rotation.z = k * Math.PI / 6; }
  // Fenster mit warmem Licht
  const fen = new THREE.MeshStandardMaterial({ color: 0x1a140c, emissive: 0xffc070, emissiveIntensity: 0.6 });
  for (const x of [-9, -5, 5, 9]) add(new THREE.BoxGeometry(1.6, 3.2, 0.1), fen, x, 5, -6.05, false);
  const tex = textTexture(name, { w: 1024, h: 180, bg: 'rgba(0,0,0,0)', color: '#c9a227', font: '900 120px Montserrat' });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 2.8), new THREE.MeshStandardMaterial({ map: tex, transparent: true, emissive: 0xffd36a, emissiveMap: tex, emissiveIntensity: 0.6, metalness: 0.6 }));
  sign.position.set(0, 13.6, -9.35); sign.rotation.y = Math.PI; g.add(sign);
  // Geldsäcke als Deko
  for (const x of [-11.5, 11.5]) { add(new THREE.SphereGeometry(0.7, 12, 10).scale(1, 1.15, 1), M(0x9a7a4a), x, 1.5, -10.5); const t2 = textTexture('€', { w: 128, h: 128, color: '#1d1d1d', font: '900 100px Montserrat' }); const s2 = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshStandardMaterial({ map: t2, transparent: true })); s2.position.set(x, 1.6, -11.22); s2.rotation.y = Math.PI; g.add(s2); }
  return g;
}

// ---------------------------------------------------------------- Louis' Burger (eigenes Logo: Wolke + Burger)
export function burgerLogo(name = "LOUIS' BURGER", size = 512) {
  const c = document.createElement('canvas'); c.width = size; c.height = size; const x = c.getContext('2d'); x.scale(size / 512, size / 512);
  x.fillStyle = '#1f6fd1'; x.beginPath(); x.arc(256, 256, 250, 0, 7); x.fill(); x.lineWidth = 16; x.strokeStyle = '#ff8a1f'; x.stroke();
  // Wolke (wie Louis' Profilbild)
  x.fillStyle = '#ffd7a0'; for (const [cx, cy, rr] of [[200, 150, 60], [270, 120, 75], [340, 160, 55], [250, 175, 60]]) { x.beginPath(); x.arc(cx, cy, rr, 0, 7); x.fill(); }
  // Burger
  x.fillStyle = '#e8a03a'; x.beginPath(); x.ellipse(256, 270, 120, 55, 0, Math.PI, 0); x.fill();
  x.fillStyle = '#4fbf3a'; x.fillRect(140, 268, 232, 16); x.fillStyle = '#6a3a1a'; x.fillRect(146, 284, 220, 28); x.fillStyle = '#e8a03a'; x.fillRect(150, 312, 212, 24);
  x.fillStyle = '#ffffff'; x.textAlign = 'center'; x.font = '900 72px Montserrat'; x.fillText("LOUIS'", 256, 410); x.font = '900 52px Montserrat'; x.fillStyle = '#ff8a1f'; x.fillText('BURGER', 256, 465);
  return c;
}
function buildBurger(g, add, name, r) {
  const blau = M(0x1f6fd1, { roughness: 0.6 }), orange = M(0xff8a1f, { roughness: 0.5 }), weiss = M(0xf2f2f2), dunkel = M(0x202226);
  const Z = -8;
  add(new THREE.BoxGeometry(40, 0.12, 36), M(0x2c2e33), 0, 0.06, 0, false);
  add(new THREE.BoxGeometry(18, 5.5, 12), blau, 0, 2.75, Z);
  add(new THREE.BoxGeometry(18.6, 0.9, 12.6), orange, 0, 5.9, Z);
  const glas = new THREE.MeshStandardMaterial({ color: 0x0a1018, emissive: 0xffd9a0, emissiveIntensity: 0.55, roughness: 0.1 });
  add(new THREE.BoxGeometry(14, 3, 0.1), glas, 0, 2.2, Z - 6.05, false);
  const lc = new THREE.CanvasTexture(burgerLogo(name)); lc.colorSpace = THREE.SRGBColorSpace;
  const logoM = new THREE.MeshStandardMaterial({ map: lc, transparent: true, emissive: 0xffffff, emissiveMap: lc, emissiveIntensity: 0.6 });
  const l1 = new THREE.Mesh(new THREE.CircleGeometry(2.6, 40), logoM); l1.position.set(0, 7.9, Z - 6.2); l1.rotation.y = Math.PI; g.add(l1);
  add(new THREE.BoxGeometry(5.6, 5.6, 0.2), M(0xffffff, { transparent: true, opacity: 0 }), 0, 7.9, Z - 6.0, false);
  // Hoher Werbepylon mit Logo
  add(new THREE.BoxGeometry(0.8, 14, 0.8), dunkel, 13, 7, -16);
  const l2 = new THREE.Mesh(new THREE.CircleGeometry(3.2, 40), logoM); l2.position.set(13, 15.5, -16.45); l2.rotation.y = Math.PI; g.add(l2);
  add(new THREE.CylinderGeometry(3.4, 3.4, 0.6, 40).rotateX(Math.PI / 2), orange, 13, 15.5, -16.1);
  // Drive-in-Spur
  for (let k = 0; k < 8; k++) add(new THREE.BoxGeometry(0.3, 0.02, 2), weiss, -12, 0.14, -16 + k * 4, false);
  const dt = textTexture('DRIVE-IN', { w: 512, h: 128, bg: '#ff8a1f', color: '#ffffff', font: '900 90px Montserrat' });
  const dts = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.75), new THREE.MeshStandardMaterial({ map: dt })); dts.position.set(-12, 2.6, -18.2); dts.rotation.y = Math.PI; g.add(dts);
  add(new THREE.BoxGeometry(0.15, 2.2, 0.15), dunkel, -12, 1.1, -18);
  // Tische
  for (const [x, z] of [[-6, -18], [0, -19], [6, -18]]) { add(new THREE.CylinderGeometry(0.7, 0.7, 0.06, 14), orange, x, 0.85, z); add(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 6), dunkel, x, 0.45, z, false); for (const dx of [-1.1, 1.1]) add(new THREE.BoxGeometry(0.5, 0.45, 0.5), blau, x + dx, 0.35, z); }
  return g;
}

// ---------------------------------------------------------------- Freizeitpark: Riesenrad, Achterbahn, Karussell (animiert)
function buildFreizeitpark(g, add, name, r) {
  const pink = M(0xff3b8a, { roughness: 0.5 }), gelb = M(0xffd23b, { roughness: 0.5 }), cyan = M(0x2fd6e8, { roughness: 0.5 }), stahl = M(0xd8dde3, { metalness: 0.6, roughness: 0.3 }), weiss = M(0xf5f5f5);
  add(new THREE.BoxGeometry(46, 0.12, 46), M(0x4c7a34, { roughness: 1 }), 0, 0.06, 0, false);
  for (let k = 0; k < 6; k++) add(new THREE.BoxGeometry(2.5, 0.03, 14), M(0xb9a07a), 0, 0.14, -16 + k * 2.6 - 6, false);
  // Eingangstor
  for (const x of [-6, 6]) add(new THREE.BoxGeometry(1.2, 8, 1.2), pink, x, 4, -21);
  const tex = textTexture(name, { w: 1024, h: 200, bg: '#ff3b8a', color: '#ffffff', font: '900 110px Montserrat' });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(13, 2.5), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.5 }));
  sign.position.set(0, 8.6, -21.65); sign.rotation.y = Math.PI; g.add(sign);
  add(new THREE.BoxGeometry(13.4, 2.9, 0.5), gelb, 0, 8.6, -21.2);
  // Riesenrad (dreht sich)
  const radG = new THREE.Group(); radG.position.set(-9, 15, 8); g.add(radG);
  for (const sx of [-1.6, 1.6]) { const st = add(new THREE.BoxGeometry(0.6, 17, 0.6), stahl, -9 + sx, 7.5, 8 - 3); st.rotation.x = 0.28; const st2 = add(new THREE.BoxGeometry(0.6, 17, 0.6), stahl, -9 + sx, 7.5, 8 + 3); st2.rotation.x = -0.28; }
  const rad = new THREE.Group(); radG.add(rad); radG.rotation.y = Math.PI / 2;
  rad.add(Object.assign(new THREE.Mesh(new THREE.TorusGeometry(12, 0.25, 8, 64), cyan), { castShadow: true }));
  rad.add(Object.assign(new THREE.Mesh(new THREE.TorusGeometry(11.5, 0.15, 8, 64), stahl)));
  const gondeln = [];
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2; const sp = new THREE.Mesh(new THREE.BoxGeometry(0.15, 12, 0.15), stahl); sp.rotation.z = a; rad.add(sp);
    const gd = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.5, 1.8), [pink, gelb, cyan][k % 3]); gd.castShadow = true; rad.add(gd); gondeln.push({ gd, a });
  }
  // Achterbahn: geschlossene Spline-Schiene mit Stützen und fahrendem Zug
  const pts = [[8, 3, -14], [18, 9, -12], [20, 14, -2], [16, 6, 8], [8, 12, 16], [0, 4, 18], [-4, 3, 4], [2, 8, -6]].map((p) => new THREE.Vector3(...p));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.4);
  add(new THREE.TubeGeometry(curve, 200, 0.35, 8, true), M(0xff6a1a, { metalness: 0.4, roughness: 0.4 }), 0, 0, 0);
  for (let k = 0; k < 24; k++) { const p = curve.getPoint(k / 24); add(new THREE.CylinderGeometry(0.15, 0.2, p.y, 6), stahl, p.x, p.y / 2, p.z); }
  const wagen = []; for (let k = 0; k < 4; k++) { const w = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 1.2), [gelb, pink][k % 2]); w.castShadow = true; g.add(w); wagen.push(w); }
  // Karussell (dreht sich)
  const kar = new THREE.Group(); kar.position.set(-10, 0, -9); g.add(kar);
  add(new THREE.CylinderGeometry(5, 5, 0.5, 32), weiss, -10, 0.4, -9);
  add(new THREE.CylinderGeometry(0.4, 0.4, 5, 10), gelb, -10, 2.8, -9);
  add(new THREE.ConeGeometry(5.8, 2.2, 16), pink, -10, 6.3, -9);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; const pf = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 1.4), [cyan, gelb, pink, weiss][k % 4]); pf.position.set(Math.cos(a) * 3.8, 1.6, Math.sin(a) * 3.8); pf.castShadow = true; kar.add(pf);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.6, 6), stahl); st.position.set(Math.cos(a) * 3.8, 2.8, Math.sin(a) * 3.8); kar.add(st); }
  // Luftballons & Lichterketten-Masten
  for (const [x, z] of [[-4, -17], [4, -17], [14, -18], [-15, 0]]) { add(new THREE.SphereGeometry(0.6, 10, 8), [pink, gelb, cyan][(x + 20) % 3 | 0], x, 3.2, z); add(new THREE.CylinderGeometry(0.02, 0.02, 2.6, 4), weiss, x, 1.6, z, false); }
  g.userData.update = (t) => {
    rad.rotation.z = t * 0.18;
    for (const o of gondeln) { const a = o.a + t * 0.18; o.gd.position.set(Math.cos(a) * 12, Math.sin(a) * 12 - 1.0, 0); o.gd.rotation.z = -t * 0.18; }
    for (let k = 0; k < wagen.length; k++) { const u = ((t * 0.07) - k * 0.012 + 10) % 1; const p = curve.getPoint(u), q = curve.getPoint((u + 0.004) % 1); wagen[k].position.set(p.x, p.y + 0.7, p.z); wagen[k].lookAt(q.x, q.y + 0.7, q.z); }
    kar.rotation.y = t * 0.6;
  };
  return g;
}

// ---------------------------------------------------------------- Einzelobjekte (ohne Bauplatz): Zigarettenautomat, Panzer
export function buildObjekt(typ, { name } = {}) {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, cast = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; g.add(m); return m; };
  if (typ === 'zigarettenautomat') {
    add(new THREE.BoxGeometry(0.95, 1.85, 0.5), M(0x9aa3ad, { metalness: 0.7, roughness: 0.35 }), 0, 0.93, 0);
    const c = document.createElement('canvas'); c.width = 256; c.height = 512; const x = c.getContext('2d');
    x.fillStyle = '#0d0f12'; x.fillRect(0, 0, 256, 512); x.fillStyle = '#ff3b3b'; x.font = '900 34px Montserrat'; x.textAlign = 'center'; x.fillText('ZIGARETTEN', 128, 52);
    const cols = ['#e33', '#fff', '#2a6', '#fc3', '#36c', '#eee', '#c33', '#999'];
    for (let r2 = 0; r2 < 5; r2++) for (let k = 0; k < 4; k++) { x.fillStyle = cols[(r2 * 4 + k) % cols.length]; x.fillRect(22 + k * 56, 80 + r2 * 62, 44, 50); x.fillStyle = '#ffd84a'; x.font = '700 16px Montserrat'; x.fillText((7 + r2) + ' €', 44 + k * 56, 146 + r2 * 62); }
    x.fillStyle = '#2bff88'; x.fillRect(80, 410, 96, 40); x.fillStyle = '#000'; x.font = '900 22px Montserrat'; x.fillText('AB 18', 128, 438);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.6), new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.55 }));
    front.position.set(0, 0.98, 0.26); g.add(front);
    add(new THREE.BoxGeometry(1.05, 0.12, 0.6), M(0x5a6068), 0, 1.92, 0);
  } else if (typ === 'panzer') {
    const oliv = M(0x4f5a34, { roughness: 0.75 }), olivD = M(0x353d22), kette = M(0x1c1c1c, { roughness: 0.9 });
    add(new THREE.BoxGeometry(3.6, 1.3, 7.4), oliv, 0, 1.25, 0);
    add(new THREE.BoxGeometry(3.4, 0.6, 1.2), olivD, 0, 1.6, 3.6).rotation.x = 0.5;
    for (const sx of [-1, 1]) { add(new THREE.BoxGeometry(0.9, 1.0, 7.8), kette, sx * 2.1, 0.55, 0); for (let k = 0; k < 6; k++) add(new THREE.CylinderGeometry(0.42, 0.42, 0.95, 12).rotateZ(Math.PI / 2), olivD, sx * 2.1, 0.5, -3.1 + k * 1.24); }
    const turm = new THREE.Group(); turm.position.set(0, 2.4, -0.4); g.add(turm);
    const tm = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.8, 1.0, 10), oliv); tm.castShadow = true; turm.add(tm);
    const rohr = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 5.2, 10).rotateX(Math.PI / 2), olivD); rohr.position.set(0, 0.1, 3.4); rohr.castShadow = true; turm.add(rohr);
    const luke = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.15, 12), olivD); luke.position.set(0.5, 0.58, -0.4); turm.add(luke);
    // Tarnflecken
    for (let k = 0; k < 8; k++) add(new THREE.BoxGeometry(0.9, 0.05, 1.2), olivD, (k % 2 ? 1 : -1) * 0.8, 1.92, -3 + k * 0.8, false);
    if (name) { const tx = textTexture(name, { w: 512, h: 128, color: '#f2f2f2', font: '900 96px Montserrat' }); const pl = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), new THREE.MeshStandardMaterial({ map: tx, transparent: true })); pl.position.set(1.81, 1.35, 0); pl.rotation.y = Math.PI / 2; g.add(pl); }
    g.userData.update = (t) => { turm.rotation.y = Math.sin(t * 0.4) * 0.35; };
  }
  return g;
}
