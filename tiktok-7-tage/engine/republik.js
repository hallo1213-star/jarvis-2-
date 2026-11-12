// REPUBLIK VALENHEIM – Erweiterung der Stadt zum Staat.
// Wird nur gebaut, wenn der Serienstand/die Folge "republik": true setzt. Der alte Stadtkern bleibt unverändert;
// die neuen Viertel ersetzen die frühere Fernkulisse (Blöcke 7–13) und schließen an das bestehende Straßenraster an.
import * as THREE from 'three';
import { P, HB, SLAB, BoxBatch, instanced, merge, treeGeometry, lampGeometry, textTexture } from './world.js';
import { makeRng } from './rng.js';
import { flaggeCanvas, wappenCanvas, tvLogoCanvas, FARBEN } from './identitaet.js';

const C = (hex) => new THREE.Color(hex);
const M = (hex, o = {}) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.7, ...o });
const glow = (hex, i = 2) => new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: hex, emissiveIntensity: i });

// ---------------------------------------------------------------- Gebiete (Blockraster i/j, Ring 7–13)
export const GEBIETE = {
  regierung: { name: 'REGIERUNGSVIERTEL', farbe: '#f2c230' },
  business: { name: 'INTERNATIONALES GESCHÄFTSVIERTEL', farbe: '#45e3ff' },
  uni: { name: 'UNIVERSITÄTSVIERTEL', farbe: '#9ad7ff' },
  kultur: { name: 'KULTUR- & FREIZEITVIERTEL', farbe: '#ff8acb' },
  wohnen: { name: 'NEUES WOHNGEBIET', farbe: '#ffd36a' },
  luxus: { name: 'LUXUSVIERTEL', farbe: '#e8d29a' },
  verkehr: { name: 'VERKEHRSKNOTENPUNKT', farbe: '#7fe0b6' },
  industrie: { name: 'INDUSTRIE- & GEWERBEGEBIET', farbe: '#ff9a4a' },
  flughafen: { name: 'FLUGHAFENREGION', farbe: '#b0c4ff' },
  park: { name: 'ÖFFENTLICHE PARKANLAGEN', farbe: '#6fcf97' },
  altstadt: { name: 'HISTORISCHES STADTZENTRUM', farbe: '#f2c230' },
};
export function gebietVon(i, j) {
  const d = Math.max(Math.abs(i), Math.abs(j));
  if (d <= 6) return 'altstadt';
  if (Math.abs(i) === 7 && Math.abs(j) === 7) return 'park';
  if (j <= -7 && Math.abs(i) <= 3) return 'regierung';
  if (i >= 4 && j <= -4) return 'business';
  if (i >= 7 && Math.abs(j) <= 3) return 'uni';
  if (i >= 4 && j >= 4) return 'kultur';
  if (j >= 7 && Math.abs(i) <= 3) return 'wohnen';
  if (i <= -4 && j >= 4) return 'luxus';
  if (i <= -7 && Math.abs(j) <= 3) return i >= -9 ? 'verkehr' : 'industrie';
  if (i <= -4 && j <= -4) return 'flughafen';
  return 'park';
}
// Ankerpunkte für Kamera/Drehbuch
export const REP_ANKER = {
  rathausplatz: [0, SLAB, 0],
  platz_der_republik: [0, SLAB, -700],
  regierungssitz: [0, SLAB, -888],
  parlament: [-148, SLAB, -740],
  palast: [148, SLAB, -740],
  podium: [0, SLAB, -812],
  flughafen: [-700, SLAB, -760],
  bahnhof: [-592, SLAB, 0],
  stadion: [700, SLAB, 700],
  klinikum: [814, SLAB, 0],
  uni: [630, SLAB, 0],
  tv: [518, SLAB, -592],
  business: [740, SLAB, -740],
  wohnen: [0, SLAB, 740],
  luxus: [-700, SLAB, 700],
  industrie: [-850, SLAB, 0],
};

// ---------------------------------------------------------------- wehende Flaggen (Instanzen)
function flaggenMaterial(tex, U) {
  const m = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.75 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.time;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float ph = 0.0;
        #ifdef USE_INSTANCING
          ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.21;
        #endif
        float u = uv.x;
        transformed.z += sin(u * 7.0 - uTime * 6.0 + ph) * 0.16 * u + sin(u * 13.0 - uTime * 9.0 + ph) * 0.04 * u;
        transformed.y += sin(u * 5.0 - uTime * 4.0 + ph) * 0.05 * u - u * u * 0.06;`);
  };
  return m;
}

// ================================================================ Aufbau
export function baueRepublik(scene, world, U, { seed = 2026 } = {}) {
  const rng = makeRng(seed);
  const bb = new BoxBatch();
  let bid = 5000;
  const reserviert = new Set();
  const res = (i, j) => reserviert.add(i + ',' + j);
  const frei = (i, j) => !reserviert.has(i + ',' + j);
  const flaggen = []; // {x,y,z,ry,s}
  const masten = [];
  const baeume = []; const lampen = [];
  const infoscreens = [];
  const pflaster = new BoxBatch(); // Plätze über Straßen

  const addB = (x, z, sx, sz, h, kind, hex, ry = 0, y0 = SLAB) => { const id = bid++; const fh = kind === 1 ? 3.0 : kind === 0 ? 3.8 : 3.5; const ws = kind === 0 ? rng.range(1.6, 2.4) : rng.range(2.4, 3.2); bb.add(x, y0, z, sx, h, sz, C(hex), [id, fh, ws, kind], ry); return y0 + h; };
  const flagge = (x, y, z, ry = 0, s = 1, mast = true) => { if (mast) masten.push({ x, z, y: SLAB, sy: y - SLAB, s: 1 }); flaggen.push({ x, y, z, ry, s }); };

  // Gehweg-Platten für alle neuen Blöcke
  const slabs = new BoxBatch(); const w = C(0xffffff);
  for (let i = -13; i <= 13; i++) for (let j = -13; j <= 13; j++) { const d = Math.max(Math.abs(i), Math.abs(j)); if (d >= 8) slabs.add(i * P, 0, j * P, HB * 2, SLAB, HB * 2, w, [0, 0, 0, 0]); }
  { const g = slabs.geometry(); g.deleteAttribute('aColor'); g.deleteAttribute('aParams'); const m = new THREE.Mesh(g, world.gMat); m.receiveShadow = true; scene.add(m); }

  const grp = new THREE.Group(); scene.add(grp);
  const add = (geo, mat, x, y, z, cast = true, parent = grp) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m; };
  const schild = (text, w2, h2, x, y, z, ry, bg = FARBEN.nachtblau, col = FARBEN.gold, font = '900 110px Montserrat', e = 0.8) => {
    const tex = textTexture(text, { w: 1024, h: Math.max(64, Math.round(1024 * h2 / w2)), bg, color: col, font });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w2, h2), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: e, side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.rotation.y = ry; grp.add(m); return m;
  };
  const wappenTex = new THREE.CanvasTexture(wappenCanvas(512)); wappenTex.colorSpace = THREE.SRGBColorSpace;
  const wappenMat = new THREE.MeshStandardMaterial({ map: wappenTex, transparent: true, emissive: 0xffffff, emissiveMap: wappenTex, emissiveIntensity: 0.35, side: THREE.DoubleSide });
  const wappen = (x, y, z, ry, s = 10) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), wappenMat); m.position.set(x, y, z); m.rotation.y = ry; grp.add(m); return m; };
  const stein = M(0xe6e0d2, { roughness: 0.8 }), steinD = M(0xc9c0aa), glas = M(0x16222e, { roughness: 0.12, metalness: 0.7, emissive: 0x0d2030, emissiveIntensity: 0.5 });
  const goldM = M(0xc9a227, { metalness: 0.85, roughness: 0.3 }), blauM = M(0x14244a, { roughness: 0.5 }), weiss = M(0xf2f2f0, { roughness: 0.6 });

  // ============================================================ REGIERUNGSVIERTEL (Norden)
  // Prachtachse x=0 von z=-481 bis z=-960 mit Grünstreifen, Wasserbecken und Flaggen-Allee
  for (let j = -13; j <= -7; j++) res(0, j);
  pflaster.add(0, 0.05, -720, 70, 0.2, 500, C(0xb9b2a4), [0, 0, 0, 0]);
  add(new THREE.BoxGeometry(14, 0.3, 300), M(0x2f5a8a, { roughness: 0.1, metalness: 0.4, emissive: 0x0a1a30, emissiveIntensity: 0.4 }), 0, 0.3, -640, false); // Wasserbecken
  for (let z = -500; z >= -950; z -= 24) { flagge(-30, 13, z, 0); flagge(30, 13, z, Math.PI); }
  for (let z = -510; z >= -950; z -= 30) for (const x of [-20, 20]) baeume.push({ x, z, y: SLAB, s: 1.1, ry: z, c: 0x3f6a2a });
  // Platz der Republik (vor dem Regierungssitz)
  pflaster.add(0, 0.05, -800, 260, 0.22, 60, C(0xd8d0c0), [0, 0, 0, 0]);
  // Regierungssitz (über drei Blöcke, Norden)
  for (const i of [-1, 0, 1]) { res(i, -12); res(i, -13); }
  pflaster.add(0, 0.05, -910, 220, 0.2, 110, C(0xcfc7b8), [0, 0, 0, 0]);
  add(new THREE.BoxGeometry(180, 34, 60), stein, 0, SLAB + 17, -900);
  add(new THREE.BoxGeometry(70, 46, 66), glas, 0, SLAB + 23, -892);                 // Glas-Kubus in der Mitte
  for (let y = 6; y < 46; y += 6) add(new THREE.BoxGeometry(70.4, 0.5, 66.4), M(0xdddddd), 0, SLAB + y, -892, false);
  for (let k = 0; k < 14; k++) add(new THREE.BoxGeometry(1.4, 30, 1.4), weiss, -84 + k * 12.9, SLAB + 15, -869.3);
  add(new THREE.BoxGeometry(184, 2, 64), steinD, 0, SLAB + 35, -900);
  schild('REGIERUNGSSITZ DER REPUBLIK VALENHEIM', 80, 4, 0, SLAB + 38.6, -858.8, 0);
  wappen(0, SLAB + 30, -858.6, 0, 14);
  flagge(0, SLAB + 62, -900, 0, 2.2); flagge(-70, SLAB + 46, -900, 0, 1.5); flagge(70, SLAB + 46, -900, 0, 1.5);
  // Rednerpult + Tribüne für die Staatsgründung
  add(new THREE.BoxGeometry(40, 0.1, 14), M(0x7a1a1a), 0, SLAB + 0.05, -820, false);
  add(new THREE.BoxGeometry(1.6, 1.2, 0.9), blauM, 0, SLAB + 0.6, -816.6);
  { const wp = wappen(0, SLAB + 0.75, -816.13, 0, 0.9); }
  for (const x of [-14, 14]) flagge(x, SLAB + 10, -824, 0, 1.3);
  // Parlament mit Glaskuppel (Westseite des Platzes)
  for (const [i, j] of [[-2, -10], [-2, -9], [-3, -10], [-3, -9]]) res(i, j);
  pflaster.add(-185, 0.05, -705, 120, 0.2, 120, C(0xcfc7b8), [0, 0, 0, 0]);
  add(new THREE.BoxGeometry(100, 24, 80), stein, -185, SLAB + 12, -705);
  for (let k = 0; k < 10; k++) add(new THREE.CylinderGeometry(1.2, 1.3, 20, 12), weiss, -185 + 41, SLAB + 10, -741 + k * 8);
  add(new THREE.BoxGeometry(6, 2.5, 84), steinD, -185 + 42, SLAB + 21.5, -705);
  const kuppel = add(new THREE.SphereGeometry(26, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), M(0x9fd2ff, { transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.6, emissive: 0x2a6aa0, emissiveIntensity: 0.6 }), -185, SLAB + 24, -705);
  for (let k = 0; k < 12; k++) { const r = add(new THREE.TorusGeometry(26, 0.25, 6, 40, Math.PI), M(0xdddddd, { metalness: 0.6 }), -185, SLAB + 24, -705, false); r.rotation.y = (k / 12) * Math.PI; }
  schild('NATIONALPARLAMENT', 50, 4, -185 + 45.2, SLAB + 21.5, -705, Math.PI / 2);
  flagge(-185, SLAB + 62, -705, 0, 1.6);
  // Präsidentenpalast (Ostseite) mit Ehrenhof
  for (const [i, j] of [[2, -10], [2, -9], [3, -10], [3, -9]]) res(i, j);
  pflaster.add(185, 0.05, -705, 120, 0.2, 120, C(0xd8d0c0), [0, 0, 0, 0]);
  add(new THREE.BoxGeometry(30, 20, 100), M(0xf3efe6), 215, SLAB + 10, -705);            // Hauptflügel
  for (const z of [-750, -660]) add(new THREE.BoxGeometry(70, 16, 22), M(0xf3efe6), 185, SLAB + 8, z);   // Seitenflügel
  for (let k = 0; k < 9; k++) add(new THREE.CylinderGeometry(1.1, 1.2, 16, 12), weiss, 199.5, SLAB + 8, -737 + k * 8);
  add(new THREE.BoxGeometry(4, 3, 72), goldM, 200, SLAB + 17.5, -705);
  add(new THREE.BoxGeometry(32, 1.5, 102), steinD, 215, SLAB + 20.7, -705);
  wappen(199, SLAB + 24, -705, -Math.PI / 2, 10);
  schild('PRÄSIDENTENPALAST', 36, 3, 198.8, SLAB + 18, -705, -Math.PI / 2, '#f3efe6', '#14244a');
  flagge(215, SLAB + 40, -705, 0, 1.8); flagge(160, SLAB + 12, -735, 0); flagge(160, SLAB + 12, -675, 0);
  add(new THREE.CylinderGeometry(6, 6, 1.2, 24), M(0x3a6a2a), 175, SLAB + 0.6, -705);
  // Ministerien (je eigenes Gesicht)
  const ministerien = [
    ['MINISTERIUM DES INNERN', -1, -8, 0x8a8f96, 34], ['MINISTERIUM DER FINANZEN', 1, -8, 0xb8a888, 38],
    ['MINISTERIUM FÜR GESUNDHEIT', -1, -11, 0xe8ecef, 30], ['MINISTERIUM FÜR VERKEHR', 1, -11, 0x6d7a88, 32],
    ['MINISTERIUM FÜR BILDUNG', -2, -12, 0xc98a5a, 28], ['AUSWÄRTIGES AMT', 2, -12, 0x5d6670, 40],
  ];
  for (const [n, i, j, col, h] of ministerien) {
    res(i, j); const cx = i * P, cz = j * P; const s2 = Math.sign(i);
    addB(cx, cz, 44, 40, h * 0.55, 2, col); addB(cx + s2 * 6, cz, 28, 28, h, 0, col);
    add(new THREE.BoxGeometry(46, 1.2, 42), blauM, cx, SLAB + h * 0.55 + 0.6, cz, false);
    schild(n, 30, 2.2, cx - s2 * 22.2, SLAB + 6, cz, s2 > 0 ? -Math.PI / 2 : Math.PI / 2);
    flagge(cx - s2 * 18, SLAB + 16, cz - 16, 0); flagge(cx - s2 * 18, SLAB + 16, cz + 16, 0);
  }
  // Staatliche Informationszentrale
  res(2, -7); addB(148, -518, 40, 34, 22, 2, 0x2a3646);
  schild('STAATLICHE INFORMATIONSZENTRALE', 34, 2.6, 148 - 20.2, SLAB + 16, -518, Math.PI / 2, FARBEN.nachtblau, '#ffffff');
  const izScr = new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = 1024; c.height = 576; const x = c.getContext('2d'); x.fillStyle = '#06121a'; x.fillRect(0, 0, 1024, 576); x.fillStyle = '#f2c230'; x.font = '900 70px Montserrat'; x.fillText('STAATLICHE INFORMATION', 40, 110); x.fillStyle = '#fff'; x.font = '700 52px Oxanium'; ['SCHUTZRÄUME GEÖFFNET', 'VERSORGUNG GESICHERT', 'INFOS: VALENHEIM TV'].forEach((t, k) => x.fillText('• ' + t, 50, 230 + k * 100)); return c; })());
  izScr.colorSpace = THREE.SRGBColorSpace;
  const izMat = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffffff, emissiveMap: izScr, emissiveIntensity: 0.9 });

  // ============================================================ GESCHÄFTSVIERTEL (Nordosten) + VALENHEIM TV
  // TV-Zentrum mit Sendeturm
  res(7, -8); res(7, -7);
  addB(518, -592, 50, 46, 30, 0, 0x2a3646);
  const tvTex = new THREE.CanvasTexture(tvLogoCanvas()); tvTex.colorSpace = THREE.SRGBColorSpace;
  const tvMat = new THREE.MeshStandardMaterial({ map: tvTex, emissive: 0xffffff, emissiveMap: tvTex, emissiveIntensity: 0.9, side: THREE.DoubleSide });
  { const l = new THREE.Mesh(new THREE.PlaneGeometry(40, 9.1), tvMat); l.position.set(518 - 25.2, SLAB + 26, -592); l.rotation.y = -Math.PI / 2; grp.add(l); }
  add(new THREE.CylinderGeometry(3.5, 7, 180, 16), M(0xd8dde3, { metalness: 0.4 }), 518, SLAB + 90, -518);
  add(new THREE.SphereGeometry(13, 24, 16), glas, 518, SLAB + 150, -518);
  add(new THREE.CylinderGeometry(0.8, 1.6, 60, 8), M(0xd23b3b), 518, SLAB + 210, -518);
  const tvBeacon = glow(0xff2020, 4); add(new THREE.SphereGeometry(1.4, 8, 6), tvBeacon, 518, SLAB + 241, -518, false);
  // Kongresszentrum + Hotels
  res(8, -8); add(new THREE.BoxGeometry(52, 18, 50), glas, 592, SLAB + 9, -592); add(new THREE.CylinderGeometry(26, 26, 3, 32), goldM, 592, SLAB + 19.5, -592);
  schild('KONGRESSZENTRUM VALENHEIM', 40, 3, 592 - 26.2, SLAB + 14, -592, -Math.PI / 2, '#0d1a2a', '#ffffff');
  res(9, -7); addB(666, -518, 30, 30, 110, 0, 0x3a2a24); schild('GRAND HOTEL VALENHEIM', 26, 3, 666 - 15.2, SLAB + 104, -518, -Math.PI / 2, '#1a1206', '#f2c230');
  res(7, -10); addB(518, -740, 34, 26, 85, 0, 0x5d6670); schild('HOTEL REPUBLIK', 22, 3, 518 - 17.2, SLAB + 80, -740, -Math.PI / 2, FARBEN.nachtblau, '#ffffff');

  // ============================================================ UNIVERSITÄT & ZENTRALKLINIKUM (Osten)
  for (const [i, j] of [[8, -1], [8, 0], [8, 1], [9, 0]]) res(i, j);
  pflaster.add(630, 0.05, 0, 150, 0.2, 200, C(0x5a7a3a), [0, 0, 0, 0]); // Campus-Wiese
  for (const [x, z, sx, sz, h] of [[600, -70, 60, 18, 16], [600, 70, 60, 18, 16], [660, -60, 20, 50, 20], [660, 60, 20, 50, 20]]) addB(x, z, sx, sz, h, 2, 0xb8885a);
  add(new THREE.CylinderGeometry(16, 16, 14, 32), M(0xd8cfc0), 640, SLAB + 7, 0); add(new THREE.SphereGeometry(16, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M(0x4a6a8a, { metalness: 0.5 }), 640, SLAB + 14, 0); // Bibliothek
  schild('UNIVERSITÄT VALENHEIM', 30, 3.5, 585, SLAB + 6, 0, -Math.PI / 2, '#5a2a1a', '#f2e6c8');
  for (let k = 0; k < 20; k++) baeume.push({ x: 600 + rng.range(-40, 70), z: rng.range(-90, 90), y: SLAB, s: rng.range(1, 1.5), ry: k, c: 0x3f6a2a });
  flagge(585, SLAB + 14, -12, 0); flagge(585, SLAB + 14, 12, 0);
  for (const [i, j] of [[11, -1], [11, 0], [11, 1]]) res(i, j);
  add(new THREE.BoxGeometry(40, 50, 150), M(0xf2f4f6), 814, SLAB + 25, 0); add(new THREE.BoxGeometry(70, 26, 40), M(0xf2f4f6), 790, SLAB + 13, 0);
  for (let y = 4; y < 50; y += 4) add(new THREE.BoxGeometry(40.3, 1.4, 150.3), M(0x2a3a4a, { emissive: 0xa8d0ff, emissiveIntensity: 0.25 }), 814, SLAB + y, 0, false);
  { const k = glow(0xff2a2a, 2.4); add(new THREE.BoxGeometry(0.4, 12, 3.6), k, 793.8, SLAB + 40, 0, false); add(new THREE.BoxGeometry(0.4, 3.6, 12), k, 793.8, SLAB + 40, 0, false); }
  schild('ZENTRALKLINIKUM', 30, 3.5, 793.7, SLAB + 30, 0, -Math.PI / 2, '#ffffff', '#c8102e');

  // ============================================================ KULTUR & FREIZEIT + NATIONALSTADION (Südosten)
  for (const [i, j] of [[9, 9], [9, 10], [10, 9], [10, 10], [9, 8], [10, 8]]) res(i, j);
  pflaster.add(703, 0.05, 680, 200, 0.2, 210, C(0x8a8a86), [0, 0, 0, 0]);
  { const s = new THREE.Group(); s.position.set(703, SLAB, 690); s.scale.set(1, 1, 0.8); grp.add(s);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(95, 82, 34, 48, 1, true), M(0xe8e8e8, { side: THREE.DoubleSide })); ring.position.y = 17; ring.castShadow = true; s.add(ring);
    const dach = new THREE.Mesh(new THREE.TorusGeometry(88, 10, 6, 48), M(0xf2f2f2, { metalness: 0.4 })); dach.rotation.x = Math.PI / 2; dach.position.y = 36; dach.scale.set(1, 1, 0.3); s.add(dach);
    const rasen = new THREE.Mesh(new THREE.CylinderGeometry(72, 72, 0.4, 48), M(0x2f7d32)); rasen.position.y = 0.4; s.add(rasen);
    for (let k = 0; k < 6; k++) { const t = new THREE.Mesh(new THREE.CylinderGeometry(80 - k * 0.2, 74, 2, 48, 1, true), M(k % 2 ? 0x14244a : 0xf2c230, { side: THREE.DoubleSide })); t.position.y = 4 + k * 4.2; s.add(t); }
    const band = new THREE.Mesh(new THREE.CylinderGeometry(95.3, 95.3, 5, 48, 1, true), new THREE.MeshStandardMaterial({ color: 0x14244a, emissive: 0x3a6aff, emissiveIntensity: 0.6, side: THREE.DoubleSide })); band.position.y = 28; s.add(band); }
  schild('NATIONALSTADION', 50, 6, 703, SLAB + 42, 590, Math.PI);
  flagge(703, SLAB + 48, 620, 0, 2);
  res(8, 6); add(new THREE.BoxGeometry(46, 20, 46), M(0xd94a6a), 592, SLAB + 10, 444); add(new THREE.SphereGeometry(18, 20, 12), M(0xf2f2f2, { metalness: 0.5, roughness: 0.2 }), 592, SLAB + 26, 444);
  schild('KULTURZENTRUM', 26, 3, 592 - 23.2, SLAB + 14, 444, -Math.PI / 2, '#d94a6a', '#ffffff');
  res(11, 6); add(new THREE.BoxGeometry(50, 16, 50), glas, 814, SLAB + 8, 444); schild('EINKAUFSZENTRUM REPUBLIK', 36, 3, 814 - 25.2, SLAB + 12, 444, -Math.PI / 2, '#ff8a3d', '#ffffff');

  // ============================================================ HAUPTBAHNHOF (Verkehrsknoten, Westen)
  for (const [i, j] of [[-8, -1], [-8, 0], [-8, 1], [-9, -1], [-9, 0], [-9, 1]]) res(i, j);
  pflaster.add(-628, 0.05, 0, 130, 0.2, 210, C(0x8a8a86), [0, 0, 0, 0]);
  { const halle = new THREE.Mesh(new THREE.CylinderGeometry(40, 40, 190, 32, 1, true, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), M(0x9fb8cc, { side: THREE.DoubleSide, metalness: 0.5, roughness: 0.25, transparent: true, opacity: 0.75 }));
    halle.position.set(-640, SLAB + 8, 0); halle.scale.set(1, 0.55, 1); halle.castShadow = true; grp.add(halle); }
  add(new THREE.BoxGeometry(40, 26, 80), stein, -578, SLAB + 13, 0);
  add(new THREE.CylinderGeometry(4, 4, 46, 12), stein, -575, SLAB + 23, -36); add(new THREE.BoxGeometry(9, 9, 1), M(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.4 }), -575, SLAB + 40, -40.5, false); // Uhrturm
  schild('HAUPTBAHNHOF VALENHEIM', 40, 4, -557.8, SLAB + 21, 0, Math.PI / 2);
  flagge(-560, SLAB + 30, -30, 0, 1.4); flagge(-560, SLAB + 30, 30, 0, 1.4);
  // Gleise Richtung Flughafen/Westen
  const gleisM = M(0x4a4038, { roughness: 1 });
  for (const z of [-24, -12, 0, 12, 24]) { add(new THREE.BoxGeometry(700, 0.4, 3.2), gleisM, -1000, 0.2, z, false); add(new THREE.BoxGeometry(700, 0.15, 0.3), M(0x9a9a9a, { metalness: 0.8 }), -1000, 0.5, z - 0.75, false); add(new THREE.BoxGeometry(700, 0.15, 0.3), M(0x9a9a9a, { metalness: 0.8 }), -1000, 0.5, z + 0.75, false); }
  // Züge
  const zugM = M(0xf2f2f2, { metalness: 0.3, roughness: 0.3 });
  for (const [x, z] of [[-660, -12], [-640, 12]]) { for (let k = 0; k < 4; k++) { add(new THREE.BoxGeometry(24, 4, 3.2), zugM, x - k * 25, 2.4, z); add(new THREE.BoxGeometry(24.1, 0.8, 3.25), M(0x14244a), x - k * 25, 1.6, z, false); add(new THREE.BoxGeometry(24.1, 0.4, 3.25), goldM, x - k * 25, 2.2, z, false); } }

  // ============================================================ FLUGHAFEN (Nordwesten)
  for (let i = -13; i <= -4; i++) for (let j = -13; j <= -4; j++) if (Math.max(Math.abs(i), Math.abs(j)) >= 7) res(i, j);
  pflaster.add(-700, 0.05, -700, 520, 0.2, 520, C(0x5a6a4a), [0, 0, 0, 0]);  // Flughafenwiese
  add(new THREE.BoxGeometry(1100, 0.3, 60), M(0x2a2c30, { roughness: 0.9 }), -760, 0.3, -900, false);          // Start-/Landebahn
  for (let x = -1290; x <= -240; x += 40) add(new THREE.BoxGeometry(22, 0.05, 1.2), M(0xf2f2f2), x, 0.48, -900, false);
  add(new THREE.BoxGeometry(700, 0.25, 26), M(0x34363a), -700, 0.28, -840, false);                         // Rollweg
  add(new THREE.BoxGeometry(360, 0.25, 110), M(0x3a3c40), -700, 0.27, -770, false);                        // Vorfeld
  { const term = new THREE.Mesh(new THREE.CylinderGeometry(220, 220, 18, 48, 1, false, -0.55, 1.1), glas); term.position.set(-700, SLAB + 9, -500); term.castShadow = true; grp.add(term); }
  add(new THREE.BoxGeometry(320, 1.2, 40), M(0xe8e8e8, { metalness: 0.4 }), -700, SLAB + 18.6, -700);
  add(new THREE.BoxGeometry(320, 16, 34), glas, -700, SLAB + 8, -702);
  schild('VALENHEIM INTERNATIONAL AIRPORT', 90, 6, -700, SLAB + 24, -720.2, Math.PI);
  add(new THREE.CylinderGeometry(4, 6, 60, 12), M(0xdddddd), -480, SLAB + 30, -760); add(new THREE.CylinderGeometry(9, 7, 8, 12), glas, -480, SLAB + 64, -760); // Tower
  for (const x of [-830, -780, -620, -570]) flagge(x, SLAB + 14, -722, 0, 1.3);
  const flieger = (x, z, ry) => {
    const f = new THREE.Group(); f.position.set(x, 0.3, z); f.rotation.y = ry; grp.add(f);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 40, 16).rotateX(Math.PI / 2), M(0xf4f4f4, { metalness: 0.3, roughness: 0.3 })); body.position.y = 4.2; body.castShadow = true; f.add(body);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(2.4, 16, 10).scale(1, 1, 2), M(0xf4f4f4)); nose.position.set(0, 4.2, 20); f.add(nose);
    const strip = new THREE.Mesh(new THREE.CylinderGeometry(2.42, 2.42, 40, 16, 1, true, 1.0, 1.1).rotateX(Math.PI / 2), M(0x14244a, { side: THREE.DoubleSide })); strip.position.y = 4.2; f.add(strip);
    const fl = new THREE.Mesh(new THREE.BoxGeometry(38, 0.5, 7), M(0xdcdcdc)); fl.position.set(0, 3.4, 1); fl.castShadow = true; f.add(fl);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 9, 6), M(0x14244a)); tail.position.set(0, 9, -17); f.add(tail);
    const gold = new THREE.Mesh(new THREE.BoxGeometry(0.55, 2, 4), goldM); gold.position.set(0, 9.5, -17); f.add(gold);
    const ht = new THREE.Mesh(new THREE.BoxGeometry(14, 0.4, 4), M(0xdcdcdc)); ht.position.set(0, 5, -18); f.add(ht);
    for (const sx of [-7, 7]) { const e = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 4, 12).rotateX(Math.PI / 2), M(0x9aa0a6)); e.position.set(sx, 2.6, 2.5); f.add(e); }
  };
  for (const [x, z] of [[-820, -775], [-740, -775], [-660, -775], [-580, -775]]) flieger(x, z, Math.PI);
  flieger(-1000, -900, Math.PI / 2);

  // ============================================================ INDUSTRIE & GEWERBE (Westen außen)
  for (let i = -13; i <= -10; i++) for (let j = -3; j <= 3; j++) {
    res(i, j); const cx = i * P, cz = j * P;
    if ((i + j) % 3 === 0) { add(new THREE.CylinderGeometry(4, 5, 60, 12), M(0x8a8278), cx + 12, SLAB + 30, cz - 10); add(new THREE.CylinderGeometry(4.2, 4.2, 4, 12), M(0xc8102e), cx + 12, SLAB + 56, cz - 10, false); }
    addB(cx - 6, cz + 4, 40, 34, rng.range(10, 18), 3, rng.pick([0x7a7a72, 0x6d6a60, 0x8a8f94]));
    add(new THREE.CylinderGeometry(6, 6, 12, 16), M(0xb8bcc2, { metalness: 0.5 }), cx + 16, SLAB + 6, cz + 16);
  }
  schild('INDUSTRIE- & GEWERBEGEBIET', 40, 4, -740, SLAB + 8, -230, 0, '#ff9a4a', '#141414');

  // ============================================================ Normale Bebauung der übrigen Blöcke
  const pal = { glas: [0x5d6670, 0x6b7480, 0x4c5560, 0x7a7f86, 0x55606b, 0x3a4652, 0x6a5a4a], wohn: [0xd8c8b0, 0xc0ae96, 0xe0d4c0, 0xb8b0a4, 0xcfc3b0], luxus: [0xf0ebe0, 0xe8e0cc, 0xfaf6ee] };
  for (let i = -13; i <= 13; i++) for (let j = -13; j <= 13; j++) {
    const d = Math.max(Math.abs(i), Math.abs(j)); if (d < 7 || !frei(i, j)) continue;
    const g = gebietVon(i, j); const cx = i * P, cz = j * P; const inner = HB - 4.5;
    if (g === 'business' || g === 'regierung') {
      // Hochhäuser: gestuft, verdreht oder rund (aus gedrehten Scheiben)
      const typ = rng.int(0, 2); const h = (g === 'business' ? rng.range(110, 300) : rng.range(40, 80)) * (1 - (d - 7) * 0.04);
      const col = rng.pick(pal.glas);
      if (typ === 0) { let y = SLAB, ww = rng.range(30, 40); for (let k = 0; k < 3; k++) { const th = h / 3; y = addB(cx, cz, ww, ww, th, 0, col, 0, y); ww *= 0.8; } }
      else if (typ === 1) { const n = Math.round(h / 8); for (let k = 0; k < n; k++) addB(cx, cz, 28, 28, 8, 0, col, k * 0.035, SLAB + k * 8); }
      else { for (let k = 0; k < 4; k++) addB(cx, cz, 30, 30, h, 0, col, k * Math.PI / 8); }
      if (h > 150) { add(new THREE.CylinderGeometry(0.4, 0.8, 30, 6), M(0x9aa0a6), cx, SLAB + h + 15, cz); add(new THREE.SphereGeometry(0.8, 8, 6), glow(0xff2020, 3), cx, SLAB + h + 30, cz, false); }
      if (rng.chance(0.5)) addB(cx + 18, cz + 18, 16, 16, rng.range(20, 40), 2, rng.pick(pal.glas));
    } else if (g === 'uni' || g === 'kultur') {
      for (const [dx, dz] of [[-12, -12], [12, 12]]) addB(cx + dx, cz + dz, 22, 22, rng.range(14, 34), 2, rng.pick([0xb8885a, 0xd8c8b0, 0x8a8f94, 0xc96a5a]));
      for (let k = 0; k < 4; k++) baeume.push({ x: cx + rng.range(-20, 20), z: cz + rng.range(-20, 20), y: SLAB, s: rng.range(1, 1.4), ry: k, c: 0x4f7a2a });
    } else if (g === 'wohnen') {
      // moderne Wohnhochhäuser + Grünhöfe
      for (const [dx, dz] of [[-12, -12], [12, 12]]) addB(cx + dx, cz + dz, 18, 18, rng.range(45, 95), 1, rng.pick(pal.wohn));
      addB(cx - 12, cz + 14, 22, 12, rng.range(16, 24), 1, rng.pick(pal.wohn));
      for (let k = 0; k < 5; k++) baeume.push({ x: cx + rng.range(-6, 22), z: cz + rng.range(-22, 4), y: SLAB, s: rng.range(1, 1.3), ry: k, c: 0x4f7a2a });
    } else if (g === 'luxus') {
      for (const [dx, dz] of [[-12, -12], [12, -12], [-12, 12], [12, 12]]) {
        if (rng.chance(0.15)) { addB(cx + dx, cz + dz, 16, 16, rng.range(50, 80), 0, 0xd8d0c0); continue; }
        addB(cx + dx, cz + dz, 14, 12, 4, 1, rng.pick(pal.luxus)); addB(cx + dx + 2, cz + dz - 1, 9, 8, 7.5, 1, rng.pick(pal.luxus));
        add(new THREE.BoxGeometry(6, 0.3, 4), M(0x2ab0e0, { roughness: 0.05, emissive: 0x0a4a6a, emissiveIntensity: 0.5 }), cx + dx - 2, SLAB + 0.2, cz + dz + 8, false);
        baeume.push({ x: cx + dx + 6, z: cz + dz + 6, y: SLAB, s: 1.3, ry: dx, c: 0x5a8a3a });
      }
    } else if (g === 'verkehr' || g === 'industrie') {
      addB(cx, cz, 44, 40, rng.range(10, 20), 3, rng.pick([0x7a7a72, 0x6d6a60]));
    } else if (g === 'park') {
      for (let k = 0; k < 26; k++) baeume.push({ x: cx + rng.range(-24, 24), z: cz + rng.range(-24, 24), y: SLAB, s: rng.range(0.9, 1.6), ry: k, c: rng.pick([0x3f6a2a, 0x4f7a2a, 0x36561f]) });
      if (rng.chance(0.5)) add(new THREE.CylinderGeometry(9, 9, 0.3, 24), M(0x2a6a9a, { roughness: 0.05, emissive: 0x0a2a4a, emissiveIntensity: 0.4 }), cx, SLAB + 0.2, cz, false);
    }
    // Laternen an jedem Block
    for (const [lx, lz, ry] of [[cx - 20, cz - HB + 1, Math.PI / 2], [cx + 20, cz + HB - 1, -Math.PI / 2]]) lampen.push({ x: lx, z: lz, y: SLAB, ry });
  }
  // Grün im Gebiet „Park“ entlang der Ringautobahn
  // Ringautobahn (6-spurig) knapp außerhalb von Block 13
  const RA = 1010; const asph = M(0x2a2c30, { roughness: 0.9 }); const strich = M(0xd8d8d0);
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(2 * RA + 36, 0.3, 36), asph, 0, 0.32, s * RA, false); add(new THREE.BoxGeometry(36, 0.3, 2 * RA + 36), asph, s * RA, 0.32, 0, false);
    for (let k = -RA; k <= RA; k += 30) { add(new THREE.BoxGeometry(14, 0.05, 0.6), strich, k, 0.5, s * RA, false); add(new THREE.BoxGeometry(0.6, 0.05, 14), strich, s * RA, 0.5, k, false); }
    add(new THREE.BoxGeometry(2 * RA, 1.2, 1), M(0x9a9a9a), 0, 0.9, s * RA, false); add(new THREE.BoxGeometry(1, 1.2, 2 * RA), M(0x9a9a9a), s * RA, 0.9, 0, false);
  }
  // Stadteingänge: Torbögen mit Flaggen an den vier Achsen
  for (const [x, z, ry] of [[0, -RA + 30, 0], [0, RA - 30, 0], [-RA + 30, 0, Math.PI / 2], [RA - 30, 0, Math.PI / 2]]) {
    const tor = new THREE.Group(); tor.position.set(x, SLAB, z); tor.rotation.y = ry; grp.add(tor);
    for (const sx of [-14, 14]) { const p = new THREE.Mesh(new THREE.BoxGeometry(3, 16, 3), blauM); p.position.set(sx, 8, 0); p.castShadow = true; tor.add(p); }
    const b = new THREE.Mesh(new THREE.BoxGeometry(31, 3, 3), blauM); b.position.y = 16.5; tor.add(b);
    const t = textTexture('REPUBLIK VALENHEIM', { w: 1024, h: 110, bg: '#14244a', color: '#f2c230', font: '900 86px Montserrat' });
    const s2 = new THREE.Mesh(new THREE.PlaneGeometry(28, 3), new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.7, side: THREE.DoubleSide })); s2.position.set(0, 16.5, 1.6); tor.add(s2);
    const wx = x + Math.cos(ry) * 22, wz = z - Math.sin(ry) * 22; flagge(wx, SLAB + 20, wz, ry); flagge(x - Math.cos(ry) * 22, SLAB + 20, z + Math.sin(ry) * 22, ry);
  }
  // Rathausplatz: großer Fahnenmast (Flagge wird in der Gründungsfolge gehisst)
  const hauptMast = add(new THREE.CylinderGeometry(0.25, 0.4, 24, 12), M(0xd8dde3, { metalness: 0.7 }), 0, SLAB + 12, -19.5);
  add(new THREE.CylinderGeometry(2.4, 2.8, 0.8, 16), stein, 0, SLAB + 0.4, -19.5);
  // Informationsbildschirme in allen Vierteln
  const infoPos = [[0, -490], [60, -470], [-480, 60], [480, -60], [60, 480], [-470, -60], [490, 300], [-300, 490], [300, -490], [-490, -300], [140, 40], [-40, 140]];
  for (const [x, z] of infoPos) {
    add(new THREE.BoxGeometry(0.6, 3, 0.6), M(0x333333), x, SLAB + 1.5, z);
    const sc = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 3.2), izMat); sc.position.set(x, SLAB + 4.6, z); sc.lookAt(0, SLAB + 4.6, 0); grp.add(sc);
    add(new THREE.BoxGeometry(6, 3.6, 0.3), M(0x1a1a1a), x, SLAB + 4.6, z, false).lookAt(0, SLAB + 4.6, 0);
    infoscreens.push([x, z]);
  }
  // Gebietsschilder an den Grenzen
  for (const [g, x, z] of [['regierung', 0, -470], ['business', 470, -470], ['uni', 470, 0], ['kultur', 470, 470], ['wohnen', 0, 470], ['luxus', -470, 470], ['verkehr', -470, 0], ['flughafen', -470, -470]]) {
    const info = GEBIETE[g]; add(new THREE.BoxGeometry(0.5, 7, 0.5), blauM, x, SLAB + 3.5, z);
    const sg = schild(info.name, 18, 2.4, x, SLAB + 7.5, z, Math.atan2(-x, -z), FARBEN.nachtblau, info.farbe, '900 80px Montserrat', 0.8);
  }

  // ---------------------------------------------------------------- Geometrie zusammenbauen
  { const m = new THREE.Mesh(bb.geometry(), world.bMat); m.castShadow = true; m.receiveShadow = true; scene.add(m); }
  { const g = pflaster.geometry(); g.deleteAttribute('aParams'); const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: false, color: 0xffffff, roughness: 0.85 }));
    // Farbe aus aColor als Vertexfarbe übernehmen
    g.setAttribute('color', g.getAttribute('aColor')); m.material.vertexColors = true; m.receiveShadow = true; scene.add(m); }
  scene.add(instanced(treeGeometry(), world.treeMat, baeume, { colorFn: (p) => p.c }));
  scene.add(instanced(lampGeometry(), world.propMat, lampen));
  // Flaggen
  const fTex = new THREE.CanvasTexture(flaggeCanvas(512)); fTex.colorSpace = THREE.SRGBColorSpace; fTex.anisotropy = 4;
  const fGeo = new THREE.PlaneGeometry(6, 4, 16, 6).translate(3, 0, 0);
  const fMesh = instanced(fGeo, flaggenMaterial(fTex, U), flaggen.map((f) => ({ x: f.x, y: f.y - 2 * f.s, z: f.z, ry: f.ry, s: f.s })), { shadow: false });
  scene.add(fMesh);
  scene.add(instanced(new THREE.CylinderGeometry(0.12, 0.16, 1, 8).translate(0, 0.5, 0), M(0xd8dde3, { metalness: 0.7 }), masten));
  // einzelne große Flagge am Rathausplatz (wird gehisst)
  const hissFlagge = new THREE.Mesh(new THREE.PlaneGeometry(9, 6, 20, 8).translate(4.5, -3, 0), flaggenMaterial(fTex, U));
  hissFlagge.position.set(0.3, SLAB + 23.6, -19.5); scene.add(hissFlagge);

  return {
    hissFlagge, tvBeacon,
    setHissen(k) { hissFlagge.position.y = SLAB + 3.2 + k * 20.4; hissFlagge.visible = k > 0.001; },
    update(t) { tvBeacon.emissiveIntensity = Math.sin(t * 3) > 0.5 ? 5 : 0.3; },
  };
}
