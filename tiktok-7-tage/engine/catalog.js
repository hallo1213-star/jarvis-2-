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
