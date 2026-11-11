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
