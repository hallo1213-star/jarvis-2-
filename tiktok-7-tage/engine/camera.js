// Kamerafahrten: "pfad" (Spline durch Keyframes) und "orbit" (Kreisfahrt um ein Ziel).
import * as THREE from 'three';
import { ease, clamp, lerp } from './rng.js';

export function resolvePoint(v, anchors) {
  if (Array.isArray(v)) return new THREE.Vector3(v[0], v[1], v[2]);
  const m = String(v).match(/^([a-zA-Z_]+)(?:\+(.+))?$/);
  if (!m || !anchors[m[1]]) throw new Error('Unbekannter Kamera-Anker: ' + v);
  const base = anchors[m[1]];
  const off = m[2] ? m[2].split(',').map(Number) : [0, 0, 0];
  return new THREE.Vector3(base[0] + off[0], base[1] + off[1], base[2] + off[2]);
}

// weiches, deterministisches Handkamera-Wackeln
function shake(t, amp) {
  const n = (f, p) => Math.sin(t * f + p) * 0.5 + Math.sin(t * f * 2.13 + p * 1.7) * 0.3 + Math.sin(t * f * 4.7 + p * 0.3) * 0.2;
  return new THREE.Vector3(n(0.9, 1.1), n(1.1, 2.3), n(0.8, 4.1)).multiplyScalar(amp);
}

export function prepareShot(shot, anchors) {
  const s = { ...shot };
  if (s.typ === 'pfad') {
    const P = s.keys.map((k) => resolvePoint(k.pos, anchors));
    const T = s.keys.map((k) => resolvePoint(k.ziel, anchors));
    s._pos = P.length > 2 ? new THREE.CatmullRomCurve3(P, false, 'centripetal') : null;
    s._tgt = T.length > 2 ? new THREE.CatmullRomCurve3(T, false, 'centripetal') : null;
    s._P = P; s._T = T;
  } else if (s.typ === 'orbit') {
    s._ziel = resolvePoint(s.ziel, anchors);
  }
  return s;
}

export function evalShot(s, t, out) {
  const u = clamp((t - s.t0) / Math.max(0.001, s.t1 - s.t0));
  const e = (ease[s.ease || 'inOutSine'] || ease.inOutSine)(u);
  const fov = s.fov ? lerp(s.fov[0], s.fov[1], e) : 45;
  const pos = new THREE.Vector3(), tgt = new THREE.Vector3();
  if (s.typ === 'pfad') {
    if (s._pos) s._pos.getPoint(e, pos); else pos.lerpVectors(s._P[0], s._P[s._P.length - 1], e);
    if (s._tgt) s._tgt.getPoint(e, tgt); else tgt.lerpVectors(s._T[0], s._T[s._T.length - 1], e);
  } else {
    const r = lerp(s.radius[0], s.radius[1], e), h = lerp(s.hoehe[0], s.hoehe[1], e);
    const a = THREE.MathUtils.degToRad(lerp(s.winkel[0], s.winkel[1], e));
    tgt.copy(s._ziel);
    pos.set(tgt.x + Math.sin(a) * r, tgt.y + h, tgt.z + Math.cos(a) * r);
  }
  const amp = (s.wackeln ?? 0.2) * (0.02 + pos.distanceTo(tgt) * 0.0025);
  pos.add(shake(t, amp));
  tgt.add(shake(t + 17.3, amp * 2.2));
  out.position.copy(pos);
  out.up.set(0, 1, 0);
  // Top-Down-Sicherheit
  const dir = tgt.clone().sub(pos).normalize();
  if (Math.abs(dir.y) > 0.995) out.up.set(0, 0, -1);
  out.lookAt(tgt);
  if (s.roll) out.rotateZ(THREE.MathUtils.degToRad(lerp(s.roll[0], s.roll[1], e)));
  out.fov = fov; out.updateProjectionMatrix();
  return { u, e };
}
