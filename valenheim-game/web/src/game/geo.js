// Geometrie-Sammler: viele Boxen/Flächen pro Material zu EINEM Mesh zusammenfassen (wenige Draw-Calls).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export class Builder {
  constructor() { this.parts = new Map(); }
  _get(key) { if (!this.parts.has(key)) this.parts.set(key, { pos: [], nrm: [], uv: [], col: [] }); return this.parts.get(key); }

  // Viereck aus 4 Punkten (gegen den Uhrzeigersinn von außen gesehen), UVs explizit
  quad(key, a, b, c, d, n, uvs, color = [1, 1, 1]) {
    const p = this._get(key);
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const v = [a, b, c, d][i]; p.pos.push(v[0], v[1], v[2]); p.nrm.push(n[0], n[1], n[2]);
      p.uv.push(uvs[i][0], uvs[i][1]); p.col.push(color[0], color[1], color[2]);
    }
  }

  // Quader mit Weltmaß-UVs an den Seiten (u: Meter / tileW, v: Meter / tileH)
  // opts: { sides: {tileW, tileH, v0}, top: key|null, topTile, bottom:false, color, sideKey }
  box(key, x0, y0, z0, x1, y1, z1, opts = {}) {
    const tw = opts.tileW || 1, th = opts.tileH || 1, v0 = opts.v0 || 0, c = opts.color;
    const h0 = v0 / th, h1 = (v0 + (y1 - y0)) / th;
    const uo = opts.uOffset || 0;
    const sides = [
      // +z (Süd)
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], x1 - x0],
      // -z (Nord)
      [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], x1 - x0],
      // +x (Ost)
      [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], z1 - z0],
      // -x (West)
      [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], z1 - z0],
    ];
    for (const [a, b, cc, d, n, len] of sides) {
      if (opts.skip && opts.skip.includes(n.join())) continue;
      const u1 = uo + len / tw;
      this.quad(key, a, b, cc, d, n, [[uo, h0], [u1, h0], [u1, h1], [uo, h1]], c);
    }
    const topKey = opts.top === undefined ? key : opts.top;
    if (topKey) {
      const t = opts.topTile || 1;
      this.quad(topKey, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0],
        [[x0 / t, -z1 / t], [x1 / t, -z1 / t], [x1 / t, -z0 / t], [x0 / t, -z0 / t]], opts.topColor || c);
    }
    if (opts.bottom) this.quad(key, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], c);
  }

  // Ebene Fläche (y fest), UV in Weltmaß
  plane(key, x0, z0, x1, z1, y, tile = 1, color) {
    this.quad(key, [x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0],
      [[x0 / tile, -z1 / tile], [x1 / tile, -z1 / tile], [x1 / tile, -z0 / tile], [x0 / tile, -z0 / tile]], color);
  }

  // Satteldach entlang x (First parallel zu x) oder z
  gable(key, x0, z0, x1, z1, y, h, alongX, tile = 4, color) {
    if (alongX) {
      const zm = (z0 + z1) / 2; const sl = Math.hypot(h, (z1 - z0) / 2) / tile;
      const n1 = new THREE.Vector3(0, (z1 - z0) / 2, h).normalize(); const n2 = new THREE.Vector3(0, (z1 - z0) / 2, -h).normalize();
      this.quad(key, [x0, y, z1], [x1, y, z1], [x1, y + h, zm], [x0, y + h, zm], n1.toArray(), [[x0 / tile, 0], [x1 / tile, 0], [x1 / tile, sl], [x0 / tile, sl]], color);
      this.quad(key, [x1, y, z0], [x0, y, z0], [x0, y + h, zm], [x1, y + h, zm], n2.toArray(), [[x0 / tile, 0], [x1 / tile, 0], [x1 / tile, sl], [x0 / tile, sl]], color);
      this._tri(key + ':giebel', [x0, y, z0], [x0, y, z1], [x0, y + h, zm], [-1, 0, 0], color);
      this._tri(key + ':giebel', [x1, y, z1], [x1, y, z0], [x1, y + h, zm], [1, 0, 0], color);
    } else {
      const xm = (x0 + x1) / 2; const sl = Math.hypot(h, (x1 - x0) / 2) / tile;
      const n1 = new THREE.Vector3(h, (x1 - x0) / 2, 0).normalize(); const n2 = new THREE.Vector3(-h, (x1 - x0) / 2, 0).normalize();
      this.quad(key, [x1, y, z1], [x1, y, z0], [xm, y + h, z0], [xm, y + h, z1], n1.toArray(), [[z1 / tile, 0], [z0 / tile, 0], [z0 / tile, sl], [z1 / tile, sl]], color);
      this.quad(key, [x0, y, z0], [x0, y, z1], [xm, y + h, z1], [xm, y + h, z0], n2.toArray(), [[z0 / tile, 0], [z1 / tile, 0], [z1 / tile, sl], [z0 / tile, sl]], color);
      this._tri(key + ':giebel', [x0, y, z1], [x1, y, z1], [xm, y + h, z1], [0, 0, 1], color);
      this._tri(key + ':giebel', [x1, y, z0], [x0, y, z0], [xm, y + h, z0], [0, 0, -1], color);
    }
  }
  _tri(key, a, b, c, n, color = [1, 1, 1]) {
    const p = this._get(key);
    for (const v of [a, b, c]) { p.pos.push(...v); p.nrm.push(...n); p.uv.push(v[0] / 4 + v[2] / 4, v[1] / 4); p.col.push(...color); }
  }

  // Beliebige Three-Geometrie (transformiert) hinzufügen
  geometry(key, geo, matrix, color = [1, 1, 1]) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.applyMatrix4(matrix);
    const p = this._get(key); const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    for (let i = 0; i < P.count; i++) {
      p.pos.push(P.getX(i), P.getY(i), P.getZ(i)); p.nrm.push(N.getX(i), N.getY(i), N.getZ(i));
      p.uv.push(U ? U.getX(i) : 0, U ? U.getY(i) : 0); p.col.push(color[0], color[1], color[2]);
    }
  }

  build(materials, { castShadow = true, receiveShadow = true } = {}) {
    const group = new THREE.Group();
    for (const [key, p] of this.parts) {
      const matKey = key.split(':')[0] + (key.includes(':giebel') ? ':giebel' : '');
      const mat = materials[matKey] || materials[key.split(':')[0]];
      if (!mat) { console.warn('Material fehlt:', key); continue; }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(p.nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(p.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(p.col, 3));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat); m.castShadow = castShadow && !mat.userData.noShadow; m.receiveShadow = receiveShadow; m.name = key;
      m.matrixAutoUpdate = false; group.add(m);
    }
    return group;
  }
}

export { mergeGeometries };
