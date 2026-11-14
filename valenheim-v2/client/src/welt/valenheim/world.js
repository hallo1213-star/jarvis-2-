// KOPIE aus tiktok-7-tage/engine (Video-Engine) – identische Stadt. Änderungen nur: Kollisionsboxen.
// VALENHEIM – prozedurale 3D-Stadt. Gleicher Seed => identische Stadt in jeder Folge.
import * as THREE from 'three';
import { makeRng, hash1 } from './rng.js';
import { baumGeometrie, baumMaterialien, BAUM_ZEIT } from './baum.js';

// ---- Echte Foto-Texturen (Poly Haven, CC0) – nur im Spiel. Laden im Hintergrund, Shader nutzen sie sofort.
const TEX_NAMEN = ['asphalt', 'gehweg', 'pflaster', 'schotter', 'erde', 'putz', 'beige', 'ziegel', 'beton', 'dach'];
export const TEXU = {};
{
  const ld = typeof document !== 'undefined' ? new THREE.TextureLoader() : null;
  const leer = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1); leer.needsUpdate = true;
  for (const n of TEX_NAMEN) for (const art of ['farbe', 'normal']) {
    const key = 'uT_' + n + (art === 'normal' ? 'N' : '');
    const t = ld ? ld.load(`/tex/${n}_${art}.jpg`) : leer; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    if (art === 'farbe') t.colorSpace = THREE.SRGBColorSpace;
    TEXU[key] = { value: t };
  }
}
const TEXDECL = (namen) => namen.map((n) => `uniform sampler2D uT_${n}; uniform sampler2D uT_${n}N;`).join('\n');
// Kachel-Unterdrückung: zwei leicht verschobene Abtastungen mischen, damit keine Wiederholung sichtbar ist
const TEXFN = /* glsl */`
vec3 txc(sampler2D t, vec2 uv){ vec3 a = texture2D(t, uv).rgb; vec3 b = texture2D(t, uv*0.37 + vec2(0.31,0.73)).rgb; float m = smoothstep(0.35, 0.65, vnoise(uv*0.21)); return mix(a, b, m*0.5); }
vec3 txn(sampler2D t, vec2 uv){ return texture2D(t, uv).xyz*2.0 - 1.0; }
`;

export const P = 74;          // Raster (Block + Straße)
export const HB = 28;         // halbe Blockgröße inkl. Gehweg
export const INNER = 6;       // detaillierte Stadt: Blöcke -6..6
export const OUTER = 14;      // Fernkulisse bis Block 14
export const SLAB = 0.22;     // Gehweghöhe

// Feste Bauplätze rund um den Zentralplatz – hier entstehen die Gebäude der Zuschauer.
export const BAUPLAETZE = {
  B1: [-1, 0], B2: [1, 0], B3: [-1, 1], B4: [1, 1],
  B5: [-2, 0], B6: [2, 0], B7: [0, 2], B8: [-2, 1],
};

// Zusätzliche Bauplätze (ab Folge 5). Dort stehende Altbauten werden abgerissen, ohne den Zufallsgenerator
// der Stadt zu verändern – alle anderen Gebäude bleiben dadurch exakt gleich.
export const ZUSATZ_PLAETZE = { B9: [2, 1], B10: [2, -1], B11: [-2, -1], B12: [1, 2], B13: [-1, 2], B14: [2, 2], B15: [1, -1] }; // B15 = Janniks Autohaus (nur im Spiel)
// Nur Zusatz-Plätze, die im Serienstand/der Folge benutzt werden, werden freigeräumt (ältere Folgen bleiben unverändert)
let AKTIVE_ZUSATZ = [];
const inZusatz = (x, z) => AKTIVE_ZUSATZ.some((k) => { const [i, j] = ZUSATZ_PLAETZE[k]; return Math.abs(x - i * P) < HB - 3.5 && Math.abs(z - j * P) < HB - 3.5; });

export const ANKER = {
  platz: [0, SLAB, 0],
  figur: [7, SLAB, 14],
  supermarkt: [0, SLAB, 74],
  wohnblock: [-148, SLAB, 148],
};

export const U = {
  time: { value: 0 },
  skyTop: { value: new THREE.Color(0x22385c) },
  skyHor: { value: new THREE.Color(0xe39a66) },
  sunCol: { value: new THREE.Color(0xffbf88) },
  sunDir: { value: new THREE.Vector3(-1, 0.36, -0.42).normalize() },
  blockMap: { value: null },
  alarm: { value: 0 },
  litThr: { value: 0.972 },
  markR: { value: 7 },
};

function blockType(i, j) {
  const d = Math.max(Math.abs(i), Math.abs(j));
  if (i === 0 && j === 0) return 'platz';
  for (const k in BAUPLAETZE) if (BAUPLAETZE[k][0] === i && BAUPLAETZE[k][1] === j) return 'bauplatz';
  if (i === 0 && j === 1) return 'supermarkt';
  if (i === -2 && j === 2) return 'wohnblock';
  if (d > INNER) return 'fern';
  const h = hash1(i * 31.7 + j * 91.3);
  if (d >= 3 && h < 0.09) return 'park';
  if (d <= 2) return 'downtown';
  if (d <= 4) return 'mixed';
  return 'wohnen';
}
const TYPE_CODE = { normal: 0, platz: 1, bauplatz: 2, park: 3, supermarkt: 4, fern: 5, wohnblock: 6 };

// ---------------------------------------------------------------- Shader-Bausteine
const NOISE = /* glsl */`
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float h31(vec3 p){ return h21(p.xy + p.z*17.137); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s; }
`;

function patchStandard(mat, { vertexDecl = '', vertexBody = '', fragDecl = '', colorBody = '', roughBody = '', emisBody = '', texturen = [] }) {
  mat.onBeforeCompile = (sh) => {
    for (const n of texturen) { sh.uniforms['uT_' + n] = TEXU['uT_' + n]; sh.uniforms['uT_' + n + 'N'] = TEXU['uT_' + n + 'N']; }
    Object.assign(sh.uniforms, { uMarkR: U.markR, uLitThr: U.litThr, uTime: U.time, uSkyTop: U.skyTop, uSkyHor: U.skyHor, uSunCol: U.sunCol, uSunDir: U.sunDir, uBlockMap: U.blockMap, uAlarm: U.alarm });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWP; varying vec3 vWN;\n${vertexDecl}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vWP = (modelMatrix * instanceMatrix * vec4(transformed,1.0)).xyz;
          vWN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
        #else
          vWP = (modelMatrix * vec4(transformed,1.0)).xyz;
          vWN = normalize(mat3(modelMatrix) * objectNormal);
        #endif
        ${vertexBody}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uMarkR; uniform float uLitThr; uniform float uTime; uniform float uAlarm; uniform vec3 uSkyTop; uniform vec3 uSkyHor; uniform vec3 uSunCol; uniform vec3 uSunDir;
        uniform sampler2D uBlockMap;
        varying vec3 vWP; varying vec3 vWN;
        ${NOISE}
        ${TEXDECL(texturen)}
        ${texturen.length ? TEXFN : ''}
        ${fragDecl}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\nfloat xRough = roughness; vec3 xEmis = vec3(0.0); vec3 xWN = vec3(0.0);\n${colorBody}`)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nif (dot(xWN, xWN) > 0.01) normal = normalize((viewMatrix * vec4(normalize(xWN), 0.0)).xyz);')
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = xRough;\n${roughBody}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += xEmis;\n${emisBody}`);
  };
  mat.customProgramCacheKey = () => mat.name;
  return mat;
}

// Gebäude-Fassaden komplett prozedural: Fenster, Spiegelungen, Schmutz, vereinzelt Licht.
function buildingMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0.0, name: 'bau' });
  return patchStandard(mat, {
    texturen: ['putz', 'beige', 'ziegel', 'beton', 'dach'],
    vertexDecl: 'attribute vec3 aColor; attribute vec4 aParams; varying vec3 vCol; varying vec4 vPar;',
    vertexBody: 'vCol = aColor; vPar = aParams;',
    fragDecl: 'varying vec3 vCol; varying vec4 vPar;',
    colorBody: /* glsl */`
      vec3 bN = normalize(vWN);
      float bKind = vPar.w; float bId = vPar.x;
      vec3 fac = vCol; float by = vWP.y;
      if (abs(bN.y) < 0.5) {
        vec2 tng = normalize(vec2(-bN.z, bN.x));
        float u = dot(vWP.xz, tng);
        float fh = vPar.y, ws = vPar.z;
        float fl = floor(by / fh), fv = fract(by / fh);
        float cu = floor(u / ws), fu = fract(u / ws);
        float dirt = fbm(vec2(u*0.12, by*0.035) + bId*3.1);
        // Echte Fassade: je nach Haus Putz, Beige, Ziegel oder Sichtbeton (Foto-Textur + Relief)
        float wahl = h21(vec2(bId, 7.3)); vec2 fuv = vec2(u, by) / 3.2; vec3 ftex; vec3 fnor;
        if (bKind < 0.5) { ftex = txc(uT_beton, fuv); fnor = txn(uT_betonN, fuv); fac = fac * ftex * 2.6; }
        else if (bKind < 1.5 && wahl < 0.35) { fuv = vec2(u, by) / 2.0; ftex = txc(uT_ziegel, fuv); fnor = txn(uT_ziegelN, fuv); fac = mix(ftex * 1.1, fac * ftex * 3.0, 0.25); }
        else if (wahl < 0.65) { ftex = txc(uT_putz, fuv); fnor = txn(uT_putzN, fuv); fac = fac * ftex * 3.2; }
        else if (wahl < 0.85) { ftex = txc(uT_beige, fuv); fnor = txn(uT_beigeN, fuv); fac = fac * ftex * 2.6; }
        else { ftex = txc(uT_beton, fuv); fnor = txn(uT_betonN, fuv); fac = fac * ftex * 2.6; }
        vec3 tng3 = vec3(tng.x, 0.0, tng.y);
        float relief = 1.0 - smoothstep(60.0, 260.0, length(vWP - cameraPosition));
        xWN = normalize(tng3 * fnor.x * relief + vec3(0.0, 1.0, 0.0) * fnor.y * relief + bN * max(fnor.z, 0.3));
        fac *= 0.85 + 0.25*dirt;
        fac *= mix(0.42, 1.0, smoothstep(0.0, 10.0, by));
        float streak = vnoise(vec2(u*1.7, bId)) * smoothstep(0.0, 1.0, fract(-by/fh*0.5));
        fac *= 1.0 - 0.12*streak;
        float win = 0.0;
        float aU = max(fwidth(u/ws), 0.0015), aV = max(fwidth(by/fh), 0.0015);
        float lod = smoothstep(0.18, 0.55, max(aU, aV));
        #define BX(x,a,b,w) (smoothstep((a)-(w),(a)+(w),(x)) - smoothstep((b)-(w),(b)+(w),(x)))
        float avgW = 0.0;
        if (bKind < 0.5) {            // Glasturm
          win = BX(fu,0.06,0.94,aU)*BX(fv,0.12,0.94,aV); avgW = 0.72;
        } else if (bKind < 1.5) {     // Wohnhaus
          win = BX(fu,0.22,0.78,aU)*BX(fv,0.3,0.86,aV); avgW = 0.3;
          float bal = (1.0 - smoothstep(0.075-aV, 0.075+aV, fv)) * step(0.45, h21(vec2(floor(u/ (ws*2.0)), bId+fl*0.1)));
          fac = mix(fac, vec3(0.08), bal*0.6*(1.0-lod));
        } else if (bKind < 2.5) {     // Büro/Geschäftshaus
          win = BX(fu,0.14,0.86,aU)*BX(fv,0.26,0.84,aV); avgW = 0.42;
          if (by < 4.6) {             // Schaufenster
            float f2 = fract(u/6.0); float a2 = max(fwidth(u/6.0), 0.0015);
            win = BX(f2,0.07,0.93,a2)*step(0.55,by)*step(by,3.9); avgW = 0.7;
            cu = floor(u/6.0); fl = -1.0;
            fac = mix(fac, fac*0.5, step(3.9,by)*step(by,4.6));
          }
        }
        win = mix(win, avgW, lod);
        if (by < 1.2 && bKind < 1.5 && bKind > 0.5) win = 0.0;
        if (win > 0.001) {
          float hh = h31(vec3(cu, fl, bId));
          vec3 V = normalize(vWP - cameraPosition);
          vec3 R = reflect(V, bN);
          float fres = pow(1.0 - max(dot(-V, bN), 0.0), 3.0);
          vec3 sky = mix(uSkyHor, uSkyTop, clamp(R.y*1.6+0.05, 0.0, 1.0));
          sky += uSunCol * pow(max(dot(R, uSunDir), 0.0), 28.0) * 3.0;
          vec3 gcol = vec3(0.02, 0.025, 0.034) * mix(0.6 + 0.8*hh, 1.0, lod);
          float refl = (bKind < 0.5 ? 1.0 : 0.55) * (0.06 + 0.6*fres) * mix(0.75 + 0.5*h21(vec2(cu*1.3, fl+bId)), 1.0, lod);
          vec3 ge = sky * refl;
          float lit = (1.0 - lod*0.7);
          if (hh > uLitThr) {
            float fl2 = hh > 0.994 ? step(0.4, fract(sin(floor(uTime*11.0) + cu*7.0)*43758.5)) : 1.0;
            ge += vec3(1.0, 0.6, 0.3) * 0.85 * fl2 * (0.5 + 0.5*fract(hh*91.0)) * lit;
          } else if (hh < 0.035) { gcol = mix(vec3(0.0), gcol, lod); ge *= mix(0.15, 1.0, lod); }
          fac = mix(fac, gcol, win);
          xRough = mix(xRough, 0.2, win); xWN = normalize(mix(xWN, bN, win));
          xEmis += ge * win;
        }
      } else if (bN.y > 0.5) {
        vec2 duv = vWP.xz / 6.0; fac = txc(uT_dach, duv) * (0.55 + 0.25*vnoise(vWP.xz*0.25)); vec3 dn = txn(uT_dachN, duv);
        xWN = normalize(vec3(dn.x, dn.z, dn.y)); xRough = 0.95;
      }
      diffuseColor.rgb = fac;
    `,
  });
}

// Boden: Asphalt, Markierungen, Zebrastreifen, Gehwege, Platz-Pflaster, Bauplätze, Parks.
function groundMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0, name: 'boden' });
  return patchStandard(mat, {
    texturen: ['asphalt', 'gehweg', 'pflaster', 'schotter', 'erde'],
    colorBody: /* glsl */`
      const float P = ${P.toFixed(1)}; const float HB = ${HB.toFixed(1)};
      vec2 w = vWP.xz;
      vec2 bi = floor((w + P*0.5) / P);
      vec2 f = w - bi*P;
      ivec2 tc = ivec2(clamp(bi + 16.0, 0.0, 31.0));
      float code = floor(texelFetch(uBlockMap, tc, 0).r * 255.0 + 0.5);
      vec3 bN = normalize(vWN);
      vec3 col; float n = fbm(w*0.35); vec3 tn = vec3(0.0, 0.0, 1.0);
      float edge = HB - max(abs(f.x), abs(f.y));   // Abstand zur Bordsteinkante (im Block)
      float fern = smoothstep(120.0, 420.0, length(vWP - cameraPosition)); // in der Ferne weniger Relief
      if (vWP.y > 0.04) {
        if (abs(bN.y) < 0.5) { col = txc(uT_gehweg, vec2(dot(w, vec2(-bN.z, bN.x)), vWP.y)/1.2) * 0.75; }
        else if (code == 1.0) {               // Stadtplatz: Kopfsteinpflaster mit Ringen
          vec2 uv = w/1.8; col = txc(uT_pflaster, uv) * 0.6; tn = txn(uT_pflasterN, uv);
          float r = length(w);
          col = mix(col, col*1.35, smoothstep(0.35,0.0,abs(r-10.0)));
          col = mix(col, txc(uT_gehweg, w/3.0)*0.55, step(abs(r-15.5),0.6)*0.8);
          col = mix(col, col*1.3, smoothstep(0.3,0.0,abs(r-21.0)));
          xRough = 0.8 - 0.3*smoothstep(0.55,0.75,fbm(w*0.08));
        } else if (edge < 4.2) {              // Gehweg (Betonplatten) + Bordstein
          vec2 uv = w/3.0; col = txc(uT_gehweg, uv) * 0.82; tn = txn(uT_gehwegN, uv);
          col = mix(col, vec3(0.42,0.41,0.40)*(0.85+0.2*n), step(edge,0.35));
          col *= 0.88 + 0.2*n; xRough = 0.85;
        } else if (code == 2.0) {             // Bauplatz: Erde/Schotter
          vec2 uv = w/4.0; col = txc(uT_schotter, uv) * 0.8; tn = txn(uT_schotterN, uv);
          col = mix(col, col*0.55, smoothstep(0.55,0.7,fbm(w*0.15+3.0))*0.7); xRough = 0.95;
        } else if (code == 3.0 || code == 6.0) { // Park / Innenhof: Rasen
          vec2 uv = w/3.5; col = txc(uT_erde, uv) * vec3(0.85, 0.95, 0.75); tn = txn(uT_erdeN, uv);
          col *= 0.8 + 0.35*fbm(w*0.08); xRough = 0.95;
        } else if (code == 4.0) {             // Parkplatz
          vec2 uv = w/5.0; col = txc(uT_asphalt, uv) * 0.9; tn = txn(uT_asphaltN, uv);
          vec2 pk = fract(w/vec2(3.0,6.0)); col = mix(col, vec3(0.55), step(pk.x,0.04)*step(0.2,pk.y)*0.7);
        } else {                              // Innenbereich der Blöcke
          vec2 uv = w/3.0; col = txc(uT_gehweg, uv) * 0.6; tn = txn(uT_gehwegN, uv);
        }
      } else {                                // Straße: echter Asphalt
        vec2 uv = w/5.5; col = txc(uT_asphalt, uv) * 0.78; tn = txn(uT_asphaltN, uv);
        col *= 0.85 + 0.3*fbm(w*0.04);
        bool rZ = abs(f.x) > HB, rX = abs(f.y) > HB;
        vec3 paint = vec3(0.62,0.61,0.57) * (0.6 + 0.4*smoothstep(0.3,0.7,fbm(w*1.3)));
        float pm = 0.0;
        if (abs(bi.x) <= uMarkR && abs(bi.y) <= uMarkR) {
          if (rZ && !rX) {
            float c = P*0.5 - abs(f.x);
            if (c < 0.13 && fract(w.y/7.0) < 0.5 && abs(f.y) < HB-6.5) pm = 0.9;
            if (abs(c-7.7) < 0.1 && abs(f.y) < HB-6.0) pm = 0.75;
            if (abs(f.y) > HB-5.6 && abs(f.y) < HB-1.2 && fract(f.x/1.3) < 0.5 && c > 0.6) pm = 0.95;
          } else if (rX && !rZ) {
            float c = P*0.5 - abs(f.y);
            if (c < 0.13 && fract(w.x/7.0) < 0.5 && abs(f.x) < HB-6.5) pm = 0.9;
            if (abs(c-7.7) < 0.1 && abs(f.x) < HB-6.0) pm = 0.75;
            if (abs(f.x) > HB-5.6 && abs(f.x) < HB-1.2 && fract(f.y/1.3) < 0.5 && c > 0.6) pm = 0.95;
          }
        }
        col = mix(col, paint, pm); tn = mix(tn, vec3(0.0,0.0,1.0), pm);
        float wet = smoothstep(0.62, 0.7, fbm(w*0.045 + 11.0));
        xRough = mix(0.9, 0.12, wet);
        col *= mix(1.0, 0.5, wet); tn = mix(tn, vec3(0.0,0.0,1.0), wet*0.85);
      }
      if (bN.y > 0.5) { tn.xy *= 0.9 * (1.0 - fern); xWN = normalize(vec3(tn.x, tn.z, tn.y)); }
      diffuseColor.rgb = col;
    `,
  });
}

// ---------------------------------------------------------------- Box-Sammler (gemergte Geometrie)
// Spiel (v2): Kollisionsboxen mitschreiben – [x, y0, z, sx, sy, sz, ry]
export const KOLLISION = { aktiv: false, liste: [] };

class BoxBatch {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.par = []; this.idx = []; this.n = 0; }
  // Quader: Mittelpunkt x/z, Unterkante y0, Größe sx/sy/sz, optional Drehung ry
  add(x, y0, z, sx, sy, sz, color, params, ry = 0) {
    if (this.filter && this.filter(x, z)) return;
    if (KOLLISION.aktiv && this.kollision !== false) KOLLISION.liste.push([x, y0, z, sx, sy, sz, ry]);
    const hx = sx / 2, hz = sz / 2, y1 = y0 + sy;
    const c = Math.cos(ry), s = Math.sin(ry);
    const T = (px, pz) => [x + px * c + pz * s, z - px * s + pz * c];
    const faces = [
      [[hx, 0, 0], [[hx, y0, hz], [hx, y0, -hz], [hx, y1, -hz], [hx, y1, hz]]],
      [[-hx, 0, 0], [[-hx, y0, -hz], [-hx, y0, hz], [-hx, y1, hz], [-hx, y1, -hz]]],
      [[0, 0, hz], [[-hx, y0, hz], [hx, y0, hz], [hx, y1, hz], [-hx, y1, hz]]],
      [[0, 0, -hz], [[hx, y0, -hz], [-hx, y0, -hz], [-hx, y1, -hz], [hx, y1, -hz]]],
      [[0, 1, 0], [[-hx, y1, hz], [hx, y1, hz], [hx, y1, -hz], [-hx, y1, -hz]]],
    ];
    for (const [nrm, vs] of faces) {
      const nl = Math.hypot(nrm[0], nrm[2]) || 1;
      const nx = nrm[1] ? 0 : (nrm[0] * c + nrm[2] * s) / nl, nz = nrm[1] ? 0 : (-nrm[0] * s + nrm[2] * c) / nl;
      for (const v of vs) {
        const [wx, wz] = T(v[0], v[2]);
        this.pos.push(wx, v[1], wz); this.nor.push(nx, nrm[1], nz);
        this.col.push(color.r, color.g, color.b); this.par.push(...params);
      }
      const b = this.n; this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3); this.n += 4;
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aParams', new THREE.Float32BufferAttribute(this.par, 4));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

// ---------------------------------------------------------------- Requisiten-Geometrien
function vcolor(geo, hex) {
  const c = new THREE.Color(hex); const n = geo.attributes.position.count; const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo;
}
function merge(list) {
  // einfache Merge-Funktion (nicht-indiziert)
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const total = parts.reduce((s, g) => s + g.attributes[name].array.length, 0);
    const arr = new Float32Array(total); let o = 0;
    for (const g of parts) { arr.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  out.computeBoundingSphere();
  return out;
}
const box = (sx, sy, sz, x, y, z, hex) => vcolor(new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z), hex);
const cyl = (r1, r2, h, x, y, z, hex, seg = 8) => vcolor(new THREE.CylinderGeometry(r1, r2, h, seg).translate(x, y, z), hex);

function carGeometry() {
  const parts = [
    box(4.3, 0.75, 1.82, 0, 0.62, 0, 0xffffff),
    box(2.3, 0.62, 1.62, -0.25, 1.28, 0, 0x0b0f16),
    box(2.0, 0.08, 1.5, -0.25, 1.62, 0, 0xffffff),
    box(0.06, 0.18, 0.4, 2.16, 0.78, 0.6, 0xbfc6cc), box(0.06, 0.18, 0.4, 2.16, 0.78, -0.6, 0xbfc6cc),
    box(0.06, 0.16, 0.42, -2.16, 0.8, 0.6, 0x5a0606), box(0.06, 0.16, 0.42, -2.16, 0.8, -0.6, 0x5a0606),
  ];
  for (const [x, z] of [[1.35, 0.86], [1.35, -0.86], [-1.35, 0.86], [-1.35, -0.86]]) {
    parts.push(vcolor(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 10).rotateX(Math.PI / 2).translate(x, 0.36, z), 0x0a0a0a));
  }
  return merge(parts);
}
function lampGeometry() {
  return merge([
    cyl(0.09, 0.13, 7.5, 0, 3.75, 0, 0x2a2d31), box(1.8, 0.1, 0.12, 0.85, 7.45, 0, 0x2a2d31),
    box(0.6, 0.12, 0.3, 1.65, 7.36, 0, 0x1a1c1f), cyl(0.2, 0.25, 0.4, 0, 0.2, 0, 0x2a2d31),
  ]);
}
function treeGeometry() {
  const crown1 = vcolor(new THREE.IcosahedronGeometry(2.0, 0).translate(0, 4.6, 0), 0xffffff);
  const crown2 = vcolor(new THREE.IcosahedronGeometry(1.45, 0).translate(0.5, 5.9, 0.3), 0xe8e8e8);
  return merge([cyl(0.14, 0.22, 3.6, 0, 1.8, 0, 0x3a2a1e, 6), crown1, crown2]);
}
function benchGeometry() {
  return merge([box(1.9, 0.08, 0.5, 0, 0.48, 0, 0x4a3828), box(1.9, 0.45, 0.07, 0, 0.75, -0.24, 0x4a3828),
    box(0.08, 0.48, 0.45, -0.8, 0.24, 0, 0x222222), box(0.08, 0.48, 0.45, 0.8, 0.24, 0, 0x222222)]);
}
function trafficLightGeometry() {
  return merge([cyl(0.1, 0.12, 5.2, 0, 2.6, 0, 0x26292d), box(0.45, 1.3, 0.4, 0, 4.7, 0.25, 0x15171a),
    box(0.22, 0.22, 0.05, 0, 5.1, 0.47, 0x220505), box(0.22, 0.22, 0.05, 0, 4.7, 0.47, 0x6a4a08), box(0.22, 0.22, 0.05, 0, 4.3, 0.47, 0x041a08)]);
}
function fenceGeometry() {
  return merge([box(3.4, 1.9, 0.05, 0, 1.15, 0, 0x8a8f94), box(0.1, 2.1, 0.1, -1.7, 1.05, 0, 0x55595e),
    box(3.4, 0.25, 0.06, 0, 0.6, 0.0, 0xc77a1a)]);
}
function acGeometry() { return merge([box(1, 1, 1, 0, 0.5, 0, 0x6c7075)]); }
function bagGeometry() { return vcolor(new THREE.IcosahedronGeometry(0.45, 0).scale(1, 0.75, 1).translate(0, 0.3, 0), 0x111214); }
function paperGeometry() { return vcolor(new THREE.PlaneGeometry(0.4, 0.3).rotateX(-Math.PI / 2).translate(0, 0.02, 0), 0xb8b2a6); }

function instanced(geo, mat, list, { shadow = true, receive = true, colorFn } = {}) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  const o = new THREE.Object3D(); const col = new THREE.Color();
  list.forEach((p, i) => {
    o.position.set(p.x, p.y ?? 0, p.z); o.rotation.set(p.rx || 0, p.ry || 0, p.rz || 0);
    o.scale.setScalar(p.s || 1); if (p.sy) o.scale.y = p.sy; o.updateMatrix(); m.setMatrixAt(i, o.matrix);
    if (colorFn) m.setColorAt(i, col.set(colorFn(p, i)));
  });
  m.count = list.length; m.castShadow = shadow; m.receiveShadow = receive;
  m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.frustumCulled = false;
  return m;
}

export function textTexture(lines, { w = 1024, h = 256, bg = 'rgba(0,0,0,0)', color = '#fff', font = '800 150px Montserrat', glow = 0, align = 'center' } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.textAlign = align; g.textBaseline = 'middle'; g.fillStyle = color; g.font = font;
  if (glow) { g.shadowColor = color; g.shadowBlur = glow; }
  const arr = Array.isArray(lines) ? lines : [lines];
  arr.forEach((l, i) => { const mw = g.measureText(l).width; const sx = Math.min(1, (w - 60) / mw);
    g.save(); g.translate(align === 'center' ? w / 2 : 30, h * (i + 1) / (arr.length + 1)); g.scale(sx, 1); g.fillText(l, 0, 0); g.restore(); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// ---------------------------------------------------------------- Himmel mit ziehenden Wolken
function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTime: U.time, uTop: U.skyTop, uHor: U.skyHor, uSunCol: U.sunCol, uSunDir: U.sunDir, uAlarm: U.alarm },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `
      uniform float uTime; uniform float uAlarm; uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uSunCol; uniform vec3 uSunDir; varying vec3 vDir;
      ${NOISE}
      void main(){
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 col = mix(uHor, uTop, pow(h, 0.42));
        float sd = max(dot(d, uSunDir), 0.0);
        col += uSunCol * (pow(sd, 6.0)*0.55 + pow(sd, 90.0)*1.6 + pow(sd, 900.0)*14.0);
        col += uHor * 0.25 * pow(1.0-h, 6.0);
        if (d.y > -0.02) {
          vec2 uv = d.xz / (d.y + 0.12);
          vec2 q = uv*0.55 + vec2(uTime*0.018, uTime*0.007);
          float c = fbm(q + fbm(q*1.7 + uTime*0.01)*0.6);
          float cov = smoothstep(0.42, 0.82, c);
          float thick = smoothstep(0.5, 1.0, c);
          vec3 cdark = mix(vec3(0.075,0.08,0.11), uTop*0.7, 0.4);
          vec3 clit = uSunCol * (0.75 + 1.6*pow(sd, 5.0));
          vec3 cc = mix(clit*0.9, cdark, thick*0.85 + 0.15);
          cc += uSunCol * pow(sd, 18.0) * (1.0-thick) * 1.6;
          col = mix(col, cc, cov * smoothstep(-0.02, 0.12, d.y) * 0.92);
        }
        float nacht = smoothstep(0.08, 0.01, dot(uTop, vec3(0.3, 0.6, 0.1)));
        if (nacht > 0.0 && d.y > 0.0) { vec2 sp = d.xz / (d.y + 0.25) * 260.0; float st = h21(floor(sp)); float tw = 0.6 + 0.4*sin(uTime*3.0 + st*60.0);
          col += vec3(0.85, 0.9, 1.0) * step(0.9965, st) * smoothstep(0.5, 0.1, length(fract(sp) - 0.5)) * tw * nacht * smoothstep(0.02, 0.2, d.y) * 1.6; }
        if (d.y < 0.0) col = mix(col, uHor*0.55, smoothstep(0.0, -0.08, d.y));
        col = mix(col, col*vec3(1.4,0.35,0.3), uAlarm*0.6);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), mat);
  m.frustumCulled = false; m.renderOrder = -1;
  return m;
}

// ---------------------------------------------------------------- Staubpartikel
function makeDust() {
  const N = 1400; const pos = new Float32Array(N * 3); const seed = new Float32Array(N * 4);
  const r = makeRng(99);
  for (let i = 0; i < N; i++) { seed[i * 4] = r(); seed[i * 4 + 1] = r(); seed[i * 4 + 2] = r(); seed[i * 4 + 3] = r(); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: U.time, uCam: { value: new THREE.Vector3() }, uSize: { value: 30 }, uBox: { value: 26 }, uSunCol: U.sunCol, uScale: { value: 1920 } },
    vertexShader: `
      attribute vec4 aSeed; uniform float uTime; uniform vec3 uCam; uniform float uBox; uniform float uSize; uniform float uScale; varying float vA;
      void main(){
        vec3 drift = vec3(0.35, 0.06 + 0.05*sin(aSeed.w*6.28), 0.18) * uTime * (0.5 + aSeed.w);
        vec3 p = aSeed.xyz * uBox*2.0 + drift + vec3(sin(uTime*0.7+aSeed.x*30.0), cos(uTime*0.5+aSeed.y*20.0), sin(uTime*0.6+aSeed.z*25.0))*0.4;
        p = mod(p - uCam + uBox, uBox*2.0) - uBox + uCam;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float dist = -mv.z;
        gl_PointSize = clamp(uSize * (0.4 + aSeed.w) / dist * (uScale/1920.0) * 18.0, 1.0, 60.0);
        vA = smoothstep(uBox, uBox*0.4, dist) * smoothstep(0.4, 2.0, dist) * (0.35 + 0.65*aSeed.y);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uSunCol; varying float vA;
      void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); float a = smoothstep(0.5, 0.0, d); a = a*a;
        gl_FragColor = vec4(mix(vec3(1.0,0.86,0.7), uSunCol, 0.5) * a * vA * 0.55, 1.0); }`,
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false;
  return pts;
}

// ---------------------------------------------------------------- Supermarkt (begehbar)
function makeSupermarket(sceneRoot) {
  const grp = new THREE.Group(); grp.position.set(0, SLAB, 74);
  const wall = new THREE.MeshStandardMaterial({ color: 0x8b8f94, roughness: 0.9, emissive: 0x1c2024 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.85 });
  const shelfBody = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.7, emissive: 0x1c2228 });
  const ceil = new THREE.MeshStandardMaterial({ color: 0x222, roughness: 0.9, emissive: 0x15181b });
  const floorM = new THREE.MeshStandardMaterial({ color: 0x9a9890, roughness: 0.3, metalness: 0.1, emissive: 0x24272a });
  const add = (geo, mat, x, y, z, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; grp.add(m); return m; };
  // Hülle: Gebäude von z=-20 (Front zum Platz) bis z=+22, Breite 48, Höhe 8
  add(new THREE.BoxGeometry(48, 0.1, 42), floorM, 0, 0.05, 1);
  add(new THREE.BoxGeometry(48, 0.6, 42.6), dark, 0, 8.0, 1);                 // Dach
  add(new THREE.BoxGeometry(47.6, 0.05, 42), ceil, 0, 7.68, 1, false);
  add(new THREE.BoxGeometry(0.6, 8, 42), wall, -24, 4, 1); add(new THREE.BoxGeometry(0.6, 8, 42), wall, 24, 4, 1);
  add(new THREE.BoxGeometry(48, 8, 0.6), wall, 0, 4, 22);
  add(new THREE.BoxGeometry(48.4, 2.6, 0.8), new THREE.MeshStandardMaterial({ color: 0x1d4f3a, roughness: 0.7 }), 0, 6.9, -20); // Blende
  for (let x = -24; x <= 24; x += 8) add(new THREE.BoxGeometry(0.5, 5.6, 0.5), dark, x, 2.8, -20);
  const glass = new THREE.MeshStandardMaterial({ color: 0x0a1218, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.32 });
  const gl = add(new THREE.BoxGeometry(48, 5.6, 0.08), glass, 0, 2.8, -19.9, false); gl.receiveShadow = false;
  // Schild
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(22, 2.2), new THREE.MeshStandardMaterial({
    map: textTexture('SUPERMARKT', { font: '900 170px Montserrat', color: '#e8f3ee' }), transparent: true,
    emissive: 0xffffff, emissiveMap: textTexture('SUPERMARKT', { font: '900 170px Montserrat', color: '#7fe0b6' }), emissiveIntensity: 0.25 }));
  sign.position.set(0, 6.9, -20.45); sign.rotation.y = Math.PI; grp.add(sign);
  // Regale (leer)
  const shelfM = new THREE.MeshStandardMaterial({ color: 0xc9ccd0, roughness: 0.6, metalness: 0.2, emissive: 0x4a5058 });
  const r = makeRng(404); const prodCols = [0xc0392b, 0xe67e22, 0x2e86c1, 0xf4d03f, 0x27ae60, 0xeeeeee];
  const prods = [];
  for (const x of [-18, -10, -2, 6, 14]) {
    add(new THREE.BoxGeometry(1.5, 2.3, 26), shelfBody, x, 1.15, 3);
    for (const y of [0.35, 0.9, 1.45, 2.0]) {
      for (const side of [-1, 1]) {
        const b = add(new THREE.BoxGeometry(0.45, 0.05, 26), shelfM, x + side * 0.95, y, 3, false);
        for (let k = 0; k < 7; k++) if (r.chance(0.55)) prods.push({ x: x + side * 0.95 + r.range(-0.12, 0.12), y: y + 0.03, z: r.range(-9, 15), ry: r.range(0, 3), rz: r.chance(0.4) ? Math.PI / 2 : 0, c: r.pick(prodCols) });
      }
    }
  }
  // umgefallene Produkte am Boden
  for (let k = 0; k < 40; k++) prods.push({ x: r.pick([-14, -6, 2, 10]) + r.range(-1.6, 1.6), y: 0.1, z: r.range(-12, 16), ry: r.range(0, 6), rz: Math.PI / 2, c: r.pick(prodCols) });
  const prodMesh = instanced(new THREE.BoxGeometry(0.22, 0.3, 0.16).translate(0, 0.15, 0), new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: 0x222222 }), prods, { colorFn: (p) => p.c, shadow: false });
  grp.add(prodMesh);
  // Einkaufswagen
  const cart = merge([box(0.9, 0.5, 0.6, 0, 0.75, 0, 0x9aa0a6), box(0.08, 0.5, 0.6, 0.48, 1.0, 0, 0x55595e), box(0.8, 0.05, 0.5, 0, 0.2, 0, 0x55595e)]);
  const carts = [{ x: -14.4, z: -2, ry: 0.4 }, { x: -13.4, z: 9, ry: 2.8, rz: 0 }, { x: -6.2, z: 4, ry: 1.2, rz: 1.45, y: 0.3 }, { x: 4, z: -15, ry: 0.2 }];
  grp.add(instanced(cart, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.6 }), carts));
  // Neonröhren (teilweise flackernd)
  const tubes = [];
  for (const x of [-14, -6, 2, 10, 18]) for (const z of [-12, -2, 8, 17]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.1, 3.2), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xd8f0ff, emissiveIntensity: 1.6 }));
    m.position.set(x, 7.55, z); grp.add(m); tubes.push({ m, seed: hash1(x * 3 + z), base: hash1(x + z * 7) < 0.3 ? 0 : 1 });
  }
  // Wiedereröffnung: volle Regale, alle Lampen an, Banner
  const full = [];
  for (const x of [-18, -10, -2, 6, 14]) for (const y of [0.35, 0.9, 1.45, 2.0]) for (const side of [-1, 1]) for (let z = -9.6; z <= 15.6; z += 0.45)
    full.push({ x: x + side * 0.95, y: y + 0.03, z, ry: 0, c: prodCols[Math.floor(hash1(x * 7 + y * 13 + z * 3 + side) * prodCols.length)] });
  const fullMesh = instanced(new THREE.BoxGeometry(0.34, 0.42, 0.36).translate(0, 0.21, 0), new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: 0x333333 }), full, { colorFn: (p) => p.c, shadow: false });
  fullMesh.visible = false; grp.add(fullMesh);
  const ban = new THREE.Mesh(new THREE.PlaneGeometry(18, 2.2), new THREE.MeshStandardMaterial({ map: textTexture('WIEDER GEÖFFNET', { w: 1024, h: 128, bg: '#2fbf71', color: '#ffffff', font: '900 96px Montserrat' }), emissive: 0xffffff, emissiveIntensity: 0.25 }));
  ban.material.emissiveMap = ban.material.map; ban.position.set(0, 4.4, -20.5); ban.rotation.y = Math.PI; ban.visible = false; grp.add(ban);
  const glowFront = new THREE.Mesh(new THREE.BoxGeometry(47.5, 5.4, 0.05), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xfff2d6, emissiveIntensity: 0.0, transparent: true, opacity: 0.0 }));
  glowFront.position.set(0, 2.8, -19.7); grp.add(glowFront);
  let offenAb = null;
  sceneRoot.add(grp);
  return {
    setOffen(t0) { offenAb = t0; },
    update(t) {
      const offen = offenAb !== null && t >= offenAb;
      fullMesh.visible = offen; ban.visible = offen;
      sign.material.emissiveIntensity = offen ? 1.1 : 0.25;
      glowFront.material.opacity = offen ? 0.35 : 0; glowFront.material.emissiveIntensity = offen ? 0.8 : 0;
      for (const tb of tubes) {
        let v = tb.base * 1.6;
        if (offen) { tb.m.material.emissiveIntensity = 2.0; continue; }
        if (tb.seed > 0.75) { const f = Math.sin(t * 37 * (0.5 + tb.seed)) * Math.sin(t * 13.7 + tb.seed * 40); v = f > 0.2 ? 1.8 : 0.05; }
        tb.m.material.emissiveIntensity = v;
      }
    },
  };
}

// ---------------------------------------------------------------- Plaza: Brunnen, Monument, Bildschirm
function makePlaza(root) {
  const stone = new THREE.MeshStandardMaterial({ color: 0x7c7a76, roughness: 0.8 });
  const darkStone = new THREE.MeshStandardMaterial({ color: 0x2b2c2e, roughness: 0.9 });
  const mk = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; root.add(m); return m; };
  // trockener Brunnen
  const ring = new THREE.Mesh(new THREE.TorusGeometry(6.5, 0.45, 8, 48), stone); ring.rotation.x = Math.PI / 2; ring.position.set(0, SLAB + 0.55, 0); ring.castShadow = true; ring.receiveShadow = true; root.add(ring);
  mk(new THREE.CylinderGeometry(6.4, 6.4, 0.25, 48), darkStone, 0, SLAB + 0.12, 0);
  mk(new THREE.CylinderGeometry(1.6, 2.0, 1.2, 24), stone, 0, SLAB + 0.6, 0);
  // Monument / Obelisk
  mk(new THREE.BoxGeometry(1.4, 16, 1.4).translate(0, 8, 0), new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.4, metalness: 0.6 }), 0, SLAB + 1.2, 0);
  const crown = mk(new THREE.OctahedronGeometry(1.1, 0), new THREE.MeshStandardMaterial({ color: 0x111, emissive: 0x39e6ff, emissiveIntensity: 0.0 }), 0, SLAB + 18.3, 0);
  // Bänke & Laternen um den Platz kommen über Instancing
  // großer Bildschirm an einem Turm (nördlich): "KEIN SIGNAL"
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(26, 14.6), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff,
    emissiveMap: textTexture(['KEIN SIGNAL', '— VALENHEIM 24 —'], { w: 1024, h: 576, bg: '#06121a', color: '#5fd6ff', font: '800 110px Oxanium' }), emissiveIntensity: 0.55 }));
  scr.position.set(0, 44, -74 + 18 + 0.08); root.add(scr);
  return { crown, scr };
}

// ---------------------------------------------------------------- Bauplatz-Ausstattung
function makeLotDecor(root, lots, fenceMat) {
  const fences = []; const signs = {};
  for (const [name, [i, j]] of Object.entries(lots)) {
    const cx = i * P, cz = j * P; const e = HB - 4.4;
    for (let k = -e + 1.7; k <= e - 1.7; k += 3.45) {
      if (Math.abs(k) < 5 && (name === 'B1' || name === 'B2')) continue; // Einfahrt zum Platz
      fences.push({ x: cx + k, z: cz - e, y: SLAB, lot: name }, { x: cx + k, z: cz + e, y: SLAB, lot: name });
      fences.push({ x: cx - e, z: cz + k, y: SLAB, ry: Math.PI / 2, lot: name }, { x: cx + e, z: cz + k, y: SLAB, ry: Math.PI / 2, lot: name });
    }
    // Schild
    const tex = textTexture([`BAUPLATZ ${name.slice(1)}`, 'FREI'], { w: 512, h: 320, bg: '#e7a222', color: '#141414', font: '900 92px Montserrat' });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.25), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, side: THREE.DoubleSide }));
    const toPlaza = new THREE.Vector2(-cx, -cz).normalize();
    sign.position.set(cx + toPlaza.x * (e + 0.1), SLAB + 2.6, cz + toPlaza.y * (e + 0.1));
    sign.lookAt(sign.position.x + toPlaza.x, sign.position.y, sign.position.z + toPlaza.y);
    sign.castShadow = true; root.add(sign); signs[name] = sign;
  }
  return { fences, signs };
}

// ================================================================ Welt aufbauen
// Lichtstimmungen pro Folge ("licht" im Drehbuch): standard = goldene Stunde, abend = kurz vor Sonnenuntergang
export const LICHT = {
  standard: { sunDir: [-1, 0.36, -0.42], sunCol: 0xffbf88, skyTop: 0x22385c, skyHor: 0xe39a66, fog: 0x8a7066, hemiSky: 0x9cb6de, hemiI: 1.35, sunI: 3.8, lit: 0.972, laternen: false, exposure: 1.2 },
  morgen: { sunDir: [1, 0.24, 0.32], sunCol: 0xffc39a, skyTop: 0x3a5a8c, skyHor: 0xf2b48c, fog: 0xa89090, hemiSky: 0xaec4ea, hemiI: 1.45, sunI: 3.6, lit: 0.99, laternen: false, exposure: 1.22 },
  nacht: { sunDir: [0.35, 0.55, -0.6], sunCol: 0xa8bcff, skyTop: 0x040814, skyHor: 0x1a2644, fog: 0x141a30, hemiSky: 0x5a6aa0, hemiI: 1.15, sunI: 1.6, lit: 0.86, laternen: true, exposure: 1.85 },
  mittag: { sunDir: [0.35, 0.92, -0.25], sunCol: 0xfff1dc, skyTop: 0x2f63b4, skyHor: 0xb9d0e8, fog: 0xa8b8c8, hemiSky: 0xbcd3f0, hemiI: 1.25, sunI: 3.2, lit: 0.996, laternen: false, exposure: 0.8 },
  abend: { sunDir: [-1, 0.2, -0.3], sunCol: 0xff9a5c, skyTop: 0x1a2a4c, skyHor: 0xe0784e, fog: 0x7a5a58, hemiSky: 0x8096c8, hemiI: 1.15, sunI: 3.4, lit: 0.93, laternen: true, exposure: 1.25 },
};

export function buildWorld(scene, { seed = 7071, licht = 'standard', zusatz = [], republik = false } = {}) {
  U.markR.value = republik ? 14 : 7;
  AKTIVE_ZUSATZ = zusatz.filter((k) => ZUSATZ_PLAETZE[k]);
  const L = LICHT[licht] || LICHT.standard;
  U.sunDir.value.set(...L.sunDir).normalize(); U.sunCol.value.set(L.sunCol); U.skyTop.value.set(L.skyTop); U.skyHor.value.set(L.skyHor); U.litThr.value = L.lit;
  const rng = makeRng(seed);
  // Blocktyp-Karte für den Boden-Shader
  const data = new Uint8Array(32 * 32 * 4);
  for (let i = -16; i < 16; i++) for (let j = -16; j < 16; j++) {
    const t = blockType(i, j); const k = ((j + 16) * 32 + (i + 16)) * 4;
    data[k] = TYPE_CODE[t] ?? 0; data[k + 3] = 255;
  }
  const bm = new THREE.DataTexture(data, 32, 32, THREE.RGBAFormat); bm.needsUpdate = true;
  U.blockMap.value = bm;

  scene.add(makeSky());
  scene.fog = new THREE.FogExp2(L.fog, 0.00095);

  // Licht
  const hemi = new THREE.HemisphereLight(L.hemiSky, 0x3a2c22, L.hemiI); scene.add(hemi);
  const sun = new THREE.DirectionalLight(L.sunCol, L.sunI);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
  scene.add(sun); scene.add(sun.target);

  // Boden + Gehwegplatten
  const gMat = groundMaterial();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4400, 4400).rotateX(-Math.PI / 2), gMat);
  ground.receiveShadow = true; scene.add(ground);
  const slabs = new BoxBatch(); const dummyP = [0, 0, 0, 0];
  const white = new THREE.Color(1, 1, 1);
  for (let i = -INNER - 1; i <= INNER + 1; i++) for (let j = -INNER - 1; j <= INNER + 1; j++) slabs.add(i * P, 0, j * P, HB * 2, SLAB, HB * 2, white, dummyP);
  const slabGeo = slabs.geometry(); slabGeo.deleteAttribute('aColor'); slabGeo.deleteAttribute('aParams');
  const slabMesh = new THREE.Mesh(slabGeo, gMat); slabMesh.receiveShadow = true; scene.add(slabMesh);

  // Gebäude
  const bb = new BoxBatch(); bb.filter = republik ? (x, z) => inZusatz(x, z) || Math.max(Math.abs(x), Math.abs(z)) > (INNER + 0.5) * P : inZusatz; const bMat = buildingMaterial();
  const roofUnits = []; const antennas = []; const awnings = [];
  let bid = 1;
  const pal = {
    glass: [0x5d6670, 0x6b7480, 0x4c5560, 0x7a7f86, 0x8a8a84, 0x55606b],
    wohn: [0xb39b82, 0xa88d78, 0x9b8f84, 0xc0ae96, 0x8f8379, 0xa39a8e, 0x7f8a8c, 0xb5a48a],
    mixed: [0x8d8378, 0x9c9184, 0x7e8183, 0xa7998a, 0x6f7477, 0x8b7d70],
  };
  const C = (hex) => new THREE.Color(hex);
  const addB = (x, z, sx, sz, h, kind, colHex, ry = 0) => {
    const id = bid++; const fh = kind === 1 ? 3.0 : kind === 0 ? 3.7 : 3.4;
    const ws = kind === 0 ? rng.range(1.6, 2.4) : kind === 1 ? rng.range(2.4, 3.2) : rng.range(2.2, 3.0);
    const col = C(colHex);
    if (kind === 0 && h > 60 && rng.chance(0.75)) { // Turm mit Rücksprüngen
      const tiers = rng.int(2, 3); let y = SLAB, w = sx, d = sz;
      for (let k = 0; k < tiers; k++) {
        const th = k === tiers - 1 ? h - (y - SLAB) : h * rng.range(0.35, 0.55);
        bb.add(x, y, z, w, th, d, col, [id, fh, ws, kind], ry); y += th; w *= rng.range(0.68, 0.85); d *= rng.range(0.68, 0.85);
        if (y - SLAB >= h - 0.1) break;
      }
      if (rng.chance(0.6)) antennas.push({ x, z, y, h: rng.range(6, 18) });
      roofUnits.push({ x, z, y, w, d });
    } else {
      bb.add(x, SLAB, z, sx, h, sz, col, [id, fh, ws, kind], ry);
      roofUnits.push({ x, z, y: SLAB + h, w: sx * 0.7, d: sz * 0.7, ry });
      if (kind === 0 && h > 40 && rng.chance(0.4)) antennas.push({ x, z, y: SLAB + h, h: rng.range(4, 12) });
    }
  };

  for (let i = -OUTER; i <= OUTER; i++) for (let j = -OUTER; j <= OUTER; j++) {
    const t = blockType(i, j); const cx = i * P, cz = j * P; const d = Math.max(Math.abs(i), Math.abs(j));
    const inner = HB - 4.5; // bebaubare Halbbreite
    if (t === 'downtown' && i === 0 && j === -1) {
      addB(cx, cz, 36, 36, 165, 0, 0x5d6670);
    } else if (t === 'downtown') {
      const north = j < 0 ? 1.35 : 1.0;
      const split = rng.int(1, 3);
      if (split === 1) addB(cx, cz, rng.range(30, 40), rng.range(30, 40), rng.range(90, 175) * north * (d === 1 ? 1.1 : 0.9), 0, rng.pick(pal.glass));
      else if (split === 2) {
        addB(cx - 11.5, cz, 20, rng.range(34, 42), rng.range(70, 150) * north, 0, rng.pick(pal.glass));
        addB(cx + 11.5, cz, 20, rng.range(30, 42), rng.range(45, 120) * north, rng.chance(0.6) ? 0 : 2, rng.pick(pal.glass));
      } else {
        for (const [dx, dz] of [[-11.5, -11.5], [11.5, -11.5], [-11.5, 11.5], [11.5, 11.5]]) addB(cx + dx, cz + dz, rng.range(17, 20.5), rng.range(17, 20.5), rng.range(35, 130) * north, rng.chance(0.7) ? 0 : 2, rng.pick(rng.chance(0.7) ? pal.glass : pal.mixed));
      }
    } else if (t === 'mixed') {
      // Blockrand mit 2-3 Häusern pro Seite
      for (const side of [0, 1, 2, 3]) {
        const n = rng.int(2, 3); const seg = (inner * 2) / n;
        for (let k = 0; k < n; k++) {
          const along = -inner + seg * (k + 0.5); const depth = rng.range(12, 17); const h = rng.range(14, 42);
          const off = inner - depth / 2;
          const [x, z, sx, sz] = side === 0 ? [cx + along, cz - off, seg - 0.6, depth] : side === 1 ? [cx + along, cz + off, seg - 0.6, depth]
            : side === 2 ? [cx - off, cz + along, depth, seg - 0.6] : [cx + off, cz + along, depth, seg - 0.6];
          if ((side >= 2) && Math.abs(along) > inner - depth) continue;
          addB(x, z, sx, sz, h, 2, rng.pick(pal.mixed));
          // Markisen an der Straßenseite
          if (rng.chance(0.55)) awnings.push({ side, x, z, len: (side < 2 ? sx : sz) * 0.8, c: rng.pick([0x7b1f1f, 0x1f4b6b, 0x2b5a2e, 0x6b5a1f, 0x4a2a5a]) });
        }
      }
    } else if (t === 'wohnen' || t === 'wohnblock') {
      const h0 = t === 'wohnblock' ? 27 : rng.range(13, 24);
      const depth = 12; const off = inner - depth / 2;
      const col = rng.pick(pal.wohn);
      addB(cx, cz - off, inner * 2, depth, h0 + (t === 'wohnblock' ? 0 : rng.range(-2, 4)), 1, col);
      addB(cx, cz + off, inner * 2, depth, h0 + (t === 'wohnblock' ? 0 : rng.range(-2, 4)), 1, t === 'wohnblock' ? col : rng.pick(pal.wohn));
      addB(cx - off, cz, depth, inner * 2 - depth * 2 - 0.5, h0 - 3, 1, rng.pick(pal.wohn));
      if (t === 'wohnblock' || rng.chance(0.6)) addB(cx + off, cz, depth, inner * 2 - depth * 2 - 0.5, h0 - 3, 1, rng.pick(pal.wohn));
    } else if (t === 'fern') {
      const n = rng.int(1, 4); const sub = n === 1 ? [[0, 0]] : [[-11, -11], [11, -11], [-11, 11], [11, 11]].slice(0, n);
      const tall = d < 10 ? 1 : 0.7;
      for (const [dx, dz] of sub) {
        const k = rng.chance(0.45) ? 0 : 1;
        const h = k === 0 ? rng.range(30, 150) * tall * (j < 0 ? 1.2 : 1) : rng.range(12, 40);
        addB(cx + dx, cz + dz, n === 1 ? rng.range(26, 40) : rng.range(14, 20), n === 1 ? rng.range(26, 40) : rng.range(14, 20), h, k, rng.pick(k === 0 ? pal.glass : pal.wohn));
      }
    }
  }
  const bb2filter = bb.filter || (() => false);
  const bMesh = new THREE.Mesh((bb.filter = null, bb.geometry()), bMat); bMesh.castShadow = true; bMesh.receiveShadow = true; scene.add(bMesh);

  // Dachaufbauten & Antennen
  const units = [];
  for (const r of roofUnits) { const n = rng.int(1, 4); for (let k = 0; k < n; k++) units.push({ x: r.x + rng.range(-r.w / 3, r.w / 3), z: r.z + rng.range(-r.d / 3, r.d / 3), y: r.y, s: rng.range(1.5, 3.6), sy: rng.range(1.2, 3), ry: r.ry || 0 }); }
  const roofMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  scene.add(instanced(acGeometry(), roofMat, units.filter((u) => !bb2filter(u.x, u.z))));
  const antMat = new THREE.MeshStandardMaterial({ color: 0x2f3236, roughness: 0.5, metalness: 0.7 });
  scene.add(instanced(new THREE.CylinderGeometry(0.18, 0.35, 1, 6).translate(0, 0.5, 0), antMat, antennas.filter((a) => !bb2filter(a.x, a.z)).map((a) => ({ x: a.x, z: a.z, y: a.y, sy: a.h }))));
  const beaconMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff1a10, emissiveIntensity: 3 });
  const beacons = instanced(new THREE.SphereGeometry(0.45, 8, 6), beaconMat, antennas.filter((a) => !bb2filter(a.x, a.z)).map((a) => ({ x: a.x, z: a.z, y: a.y + a.h })), { shadow: false });
  scene.add(beacons);

  // Markisen
  const awnList = awnings.filter((a) => !inZusatz(a.x, a.z)).map((a) => {
    const off = 0; const d = HB - 4.5;
    const o = { y: SLAB + 3.9, c: a.c, s: 1 };
    if (a.side === 0) Object.assign(o, { x: a.x, z: a.z - 7.5 - 0.8, ry: 0 }); else if (a.side === 1) Object.assign(o, { x: a.x, z: a.z + 7.5 + 0.8, ry: Math.PI });
    else if (a.side === 2) Object.assign(o, { x: a.x - 7.5 - 0.8, z: a.z, ry: Math.PI / 2 }); else Object.assign(o, { x: a.x + 7.5 + 0.8, z: a.z, ry: -Math.PI / 2 });
    o.sx = a.len; return o;
  });
  const awnMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.12, 1.8).rotateX(0.22), new THREE.MeshStandardMaterial({ roughness: 0.9 }), awnList.length || 1);
  { const o = new THREE.Object3D(); const c = new THREE.Color(); awnList.forEach((a, i) => { o.position.set(a.x, a.y, a.z); o.rotation.set(0, a.ry, 0); o.scale.set(a.sx, 1, 1); o.updateMatrix(); awnMesh.setMatrixAt(i, o.matrix); awnMesh.setColorAt(i, c.set(a.c)); }); awnMesh.count = awnList.length; awnMesh.castShadow = true; awnMesh.receiveShadow = true; scene.add(awnMesh); }

  // Straßenmöblierung
  const lamps = [], trees = [], cars = [], benches = [], lights = [], bags = [], papers = [];
  for (let i = -INNER; i <= INNER; i++) for (let j = -INNER; j <= INNER; j++) {
    const t = blockType(i, j); const cx = i * P, cz = j * P;
    const e = HB - 1.0;
    for (let k = -HB + 6; k <= HB - 6; k += 17) {
      lamps.push({ x: cx + k, z: cz - e, ry: Math.PI / 2 }, { x: cx + k, z: cz + e, ry: -Math.PI / 2 }, { x: cx - e, z: cz + k, ry: Math.PI }, { x: cx + e, z: cz + k, ry: 0 });
    }
    if (t !== 'platz' && t !== 'supermarkt') {
      const te = HB - 2.6;
      for (let k = -HB + 11; k <= HB - 11; k += 11) {
        if (t === 'downtown' && rng.chance(0.5)) continue;
        for (const p of [{ x: cx + k, z: cz - te }, { x: cx + k, z: cz + te }, { x: cx - te, z: cz + k }, { x: cx + te, z: cz + k }]) if (rng.chance(0.7)) trees.push({ ...p, y: SLAB, s: rng.range(0.8, 1.25), ry: rng.range(0, 6), c: rng.pick([0x4a5a28, 0x55602c, 0x3d4d24, 0x6a6a30, 0x5a4a26]) });
      }
    }
    if (t === 'park' || t === 'wohnblock') {
      const n = t === 'park' ? 40 : 10;
      for (let k = 0; k < n; k++) trees.push({ x: cx + rng.range(-18, 18), z: cz + rng.range(-18, 18), y: SLAB, s: rng.range(0.9, 1.6), ry: rng.range(0, 6), c: rng.pick([0x3f5226, 0x4f5d2a, 0x36461f, 0x5c5a2a]) });
      for (let k = 0; k < 4; k++) benches.push({ x: cx + rng.range(-14, 14), z: cz + rng.range(-14, 14), y: SLAB, ry: rng.pick([0, Math.PI / 2, Math.PI]) });
    }
    // Ampeln an den Ecken
    if ((i + j) % 2 === 0) for (const [sx, sz] of [[1, 1], [-1, -1]]) lights.push({ x: cx + sx * (HB - 0.8), z: cz + sz * (HB - 0.8), y: SLAB, ry: sx > 0 ? -Math.PI / 4 : (3 * Math.PI) / 4 });
    // Müll / Zeitungen
    for (let k = 0; k < 6; k++) { const s = rng.int(0, 3); const a = rng.range(-HB + 3, HB - 3); const off = HB - rng.range(0.6, 3.5);
      const p = s === 0 ? { x: cx + a, z: cz - off } : s === 1 ? { x: cx + a, z: cz + off } : s === 2 ? { x: cx - off, z: cz + a } : { x: cx + off, z: cz + a };
      bags.push({ ...p, y: SLAB, ry: rng.range(0, 6), s: rng.range(0.7, 1.3) }); }
    for (let k = 0; k < 10; k++) papers.push({ x: cx + rng.range(-HB - 8, HB + 8), z: cz + rng.range(-HB - 8, HB + 8), y: 0, ry: rng.range(0, 6) });
  }
  // Plaza: Bänke & Bäume im Kreis
  for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 + 0.3; if (Math.abs(Math.sin(a)) > 0.92) continue; benches.push({ x: Math.cos(a) * 18, z: Math.sin(a) * 18, y: SLAB, ry: -a - Math.PI / 2 }); }
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; if (Math.cos(a) < -0.4) continue; trees.push({ x: Math.cos(a) * 23.5, z: Math.sin(a) * 23.5, y: SLAB, s: 1.15, ry: k, c: 0x4f5a2a }); }

  // Autos: geparkt am Rand + verlassen auf der Fahrbahn
  const carCols = [0x8a1c1c, 0x1c3a6a, 0xd0d0d0, 0x202020, 0x5a5f66, 0x6a6a3a, 0x2c5a4a, 0xb0a080, 0x3a2a4a, 0x9a9a9a];
  for (let i = -INNER; i <= INNER; i++) for (let j = -INNER; j <= INNER + 1; j++) {
    const zR = (j - 0.5) * P; // Ost-West-Straße
    const xR = (i - 0.5) * P; // Nord-Süd-Straße
    for (let k = -HB + 4; k <= HB - 4; k += 5.6) {
      if (rng.chance(0.3)) cars.push({ x: i * P + k, z: zR - 7.6, ry: 0, c: rng.pick(carCols) });
      if (rng.chance(0.3)) cars.push({ x: i * P + k, z: zR + 7.6, ry: Math.PI, c: rng.pick(carCols) });
      if (rng.chance(0.3)) cars.push({ x: xR - 7.6, z: j * P + k, ry: Math.PI / 2, c: rng.pick(carCols) });
      if (rng.chance(0.3)) cars.push({ x: xR + 7.6, z: j * P + k, ry: -Math.PI / 2, c: rng.pick(carCols) });
    }
    if (rng.chance(0.35)) cars.push({ x: i * P + rng.range(-20, 20), z: zR + rng.range(-4, 4), ry: rng.range(-0.6, 0.6) + (rng.chance(0.5) ? Math.PI : 0), c: rng.pick(carCols) });
    if (rng.chance(0.35)) cars.push({ x: xR + rng.range(-4, 4), z: j * P + rng.range(-20, 20), ry: Math.PI / 2 + rng.range(-0.6, 0.6), c: rng.pick(carCols) });
  }
  // Autos nicht auf dem Weg der Straßenkamera (Szene 1)
  const carsF = cars.filter((c) => !(Math.abs(c.z - 37) < 4.5 && c.x > 150 && c.x < 330));

  const propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
  const carMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.45 });
  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
  scene.add(instanced(lampGeometry(), propMat, lamps.map((l) => ({ ...l, y: SLAB }))));
  // Spiel (v2): Laternen-Licht immer anlegen, Helligkeit steuert die Tageszeit
  const glowMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffc27a, emissiveIntensity: L.laternen ? 3.2 : 0 });
  let poolMatRef = null;
  {

    scene.add(instanced(new THREE.BoxGeometry(0.5, 0.06, 0.24).translate(1.65, 7.28, 0), glowMat, lamps.map((l) => ({ ...l, y: SLAB })), { shadow: false }));
    const poolMat = new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: L.laternen ? 0.16 : 0, blending: THREE.AdditiveBlending, depthWrite: false }); poolMatRef = poolMat;
    scene.add(instanced(new THREE.CircleGeometry(4.5, 20).rotateX(-Math.PI / 2).translate(1.65, 0.05, 0), poolMat, lamps.map((l) => ({ ...l, y: SLAB })), { shadow: false, receive: false }));
  }
  // Realistische Bäume (Stamm + Foto-Laubkrone), Farbton leicht variiert
  { const bg = baumGeometrie(), bm = baumMaterialien(); const liste = trees.filter((p) => !inZusatz(p.x, p.z)); const TON = [0xffffff, 0xe6efd2, 0xf3f0d6, 0xd9e6c4, 0xfff4dc];
    scene.add(instanced(bg.stamm, bm.stamm, liste)); scene.add(instanced(bg.krone, bm.krone, liste, { colorFn: (p, i) => TON[i % TON.length] })); }
  scene.add(instanced(carGeometry(), carMat, carsF.map((c) => ({ ...c, y: 0 })), { colorFn: (p) => p.c }));
  scene.add(instanced(benchGeometry(), propMat, benches.filter((p) => !inZusatz(p.x, p.z))));
  scene.add(instanced(trafficLightGeometry(), propMat, lights));
  scene.add(instanced(bagGeometry(), propMat, bags.filter((p) => !inZusatz(p.x, p.z))));
  scene.add(instanced(paperGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }), papers, { shadow: false }));

  // Zusatz-Bauplätze aktivieren (Boden, Zäune, Schilder)
  for (const [k, [i, j]] of Object.entries(ZUSATZ_PLAETZE).filter(([k]) => AKTIVE_ZUSATZ.includes(k))) { BAUPLAETZE[k] = [i, j]; const kk = ((j + 16) * 32 + (i + 16)) * 4; data[kk] = TYPE_CODE.bauplatz; }
  bm.needsUpdate = true;
  const lotDecor = makeLotDecor(scene, BAUPLAETZE);
  const fenceGeo = fenceGeometry(); const lotObjs = {};
  for (const name of Object.keys(BAUPLAETZE)) {
    const m = instanced(fenceGeo, propMat, lotDecor.fences.filter((f) => f.lot === name));
    scene.add(m); lotObjs[name] = [m, lotDecor.signs[name]];
  }

  const market = makeSupermarket(scene);
  const plaza = makePlaza(scene);
  const dust = makeDust(); scene.add(dust);

  const tmpV = new THREE.Vector3(); const ray = new THREE.Vector3();
  return {
    sun, hemi, plaza, dust, market, exposure: L.exposure, glowMat, poolMat: poolMatRef, ampeln: lights, fogFarbe: scene.fog.color, gMat, bMat, propMat, treeMat, carMat,
    setLotFree(name, frei) { for (const o of lotObjs[name] || []) o.visible = frei; },
    lotPos(name) { const [i, j] = BAUPLAETZE[name]; return new THREE.Vector3(i * P, SLAB, j * P); },
    update(t, camera) {
      U.time.value = t; BAUM_ZEIT.value = t;
      market.update(t);
      beaconMat.emissiveIntensity = (Math.sin(t * 3.2) > 0.55 ? 4.5 : 0.25);
      dust.material.uniforms.uCam.value.copy(camera.position);
      // Schattenkamera folgt dem Blickpunkt
      camera.getWorldDirection(ray);
      let dist = 60;
      if (ray.y < -0.02) dist = Math.min(900, camera.position.y / -ray.y);
      else dist = Math.min(220, 40 + camera.position.y * 2);
      const center = tmpV.copy(camera.position).addScaledVector(ray, dist * 0.75); center.y = 0;
      const size = THREE.MathUtils.clamp(dist * 0.95 + camera.position.y * 0.25, 28, 760);
      const sc = sun.shadow.camera;
      sc.left = -size; sc.right = size; sc.top = size; sc.bottom = -size; sc.near = 1; sc.far = 2400;
      sc.updateProjectionMatrix();
      sun.target.position.copy(center);
      sun.position.copy(center).addScaledVector(U.sunDir.value, 1100);
      sun.shadow.normalBias = 0.05 + size * 0.0016;
    },
  };
}

export const blockTypeOf = blockType;

export { BoxBatch, buildingMaterial, instanced, merge, treeGeometry, lampGeometry, carGeometry, benchGeometry };
