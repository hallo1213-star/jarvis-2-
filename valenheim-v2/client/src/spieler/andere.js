// VALENHEIM 2.0 – Phase 4: andere Spieler im selben Server (Aussehen, weiche Bewegung, Kollision, Namensschild)
import * as THREE from 'three';
import { Mensch, namensschild, zufall } from './mensch.js';
import { Auto } from '../fahrzeuge/auto.js';

const VERZOEGERUNG = 0.15; // s – Puffer für flüssige Interpolation
const FUSS = 0.9;          // Kapselmitte → Füße

export class AndereSpieler {
  constructor(scene, RAPIER, world) { this.scene = scene; this.RAPIER = RAPIER; this.world = world; this.map = new Map(); }

  setze(info) { // { id, name, look, pos }
    this.entferne(info.id);
    const fig = new Mensch(info.look || zufall()); const schild = namensschild(info.name); fig.root.add(schild);
    const p = info.pos || { x: 0, y: 1, z: 0, h: 0 };
    fig.root.position.set(p.x, p.y - FUSS, p.z); fig.root.rotation.y = p.h || 0; this.scene.add(fig.root);
    const body = this.world.createRigidBody(this.RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x, p.y, p.z));
    this.world.createCollider(this.RAPIER.ColliderDesc.capsule(0.5, 0.3), body);
    this.map.set(info.id, { id: info.id, name: info.name, fig, schild, body, buf: [{ t: performance.now() / 1000, x: p.x, y: p.y, z: p.z, h: p.h || 0, f: info.f || 0 }], tempo: 0, wagen: null });
    if (info.auto) this.auto(info.id, info.auto, info.f);
  }
  // Auto eines anderen Spielers erscheint / wird getunt / verschwindet
  auto(id, auto, f) {
    const o = this.map.get(id); if (!o) return;
    if (!auto) { o.wagen?.entferne(); o.wagen = null; o.f = 0; return; }
    const look = { id: auto.id, modell: auto.modell, farbe: auto.farbe, kennzeichen: auto.kennzeichen, tuning: auto.tuning };
    if (!o.wagen || JSON.stringify(o.wagen.look) !== JSON.stringify(look)) {
      const pose = o.wagen ? { x: o.wagen.pos.x, y: o.wagen.pos.y, z: o.wagen.pos.z, h: o.wagen.heading } : { x: auto.x, y: auto.y - FUSS, z: auto.z, h: auto.h };
      o.wagen?.entferne(); o.wagen = new Auto(this.scene, this.RAPIER, this.world, look, pose);
    }
    o.f = f ? 1 : 0;
  }
  aussehen(id, look) { const o = this.map.get(id); if (o && look) o.fig.setzeAussehen(look); }
  entferne(id) {
    const o = this.map.get(id); if (!o) return;
    this.scene.remove(o.fig.root); o.fig.root.traverse((m) => { m.geometry?.dispose(); if (m.material) { m.material.map?.dispose(); m.material.dispose(); } });
    o.wagen?.entferne(); this.world.removeRigidBody(o.body); this.map.delete(id);
  }
  snapshot(liste, ich) {
    const t = performance.now() / 1000;
    for (const [id, x, y, z, h, f] of liste) { if (id === ich) continue; const o = this.map.get(id); if (!o) continue; o.buf.push({ t, x, y, z, h, f: f || 0 }); if (o.buf.length > 20) o.buf.shift(); }
  }
  namen() { return [...this.map.values()].map((o) => ({ id: o.id, name: o.name })); }

  update(dt, kamera) {
    const jetzt = performance.now() / 1000 - VERZOEGERUNG;
    for (const o of this.map.values()) {
      const b = o.buf; let a = b[0], c = b[b.length - 1];
      for (let i = 0; i < b.length - 1; i++) if (b[i].t <= jetzt && b[i + 1].t >= jetzt) { a = b[i]; c = b[i + 1]; break; }
      const k = c.t > a.t ? THREE.MathUtils.clamp((jetzt - a.t) / (c.t - a.t), 0, 1) : 1;
      const x = a.x + (c.x - a.x) * k, y = a.y + (c.y - a.y) * k, z = a.z + (c.z - a.z) * k;
      let dh = c.h - a.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); const h = a.h + dh * k;
      const r = o.fig.root; const vx = x - r.position.x, vz = z - r.position.z, vy = (y - FUSS) - r.position.y;
      const v = dt > 0 ? Math.hypot(vx, vz) / dt : 0; o.tempo += (v - o.tempo) * Math.min(1, dt * 8);
      // Fährt der Spieler? Dann bewegt sich sein Auto, die Figur sitzt (unsichtbar) darin
      if (c.f && o.wagen) {
        o.wagen.setze(x, y - FUSS, z, h, dt); r.visible = false; o.schild.visible = false; o.body.setNextKinematicTranslation({ x, y: -50, z });
        r.position.set(x, y - FUSS, z); while (b.length > 2 && b[1].t < jetzt) b.shift(); continue;
      }
      r.position.set(x, y - FUSS, z); r.rotation.y = h; o.body.setNextKinematicTranslation({ x, y, z });
      const fern = r.position.distanceToSquared(kamera.position);
      o.schild.visible = fern < 60 * 60; r.visible = fern < 300 * 300;
      if (r.visible) o.fig.animate(dt, o.tempo > 0.4 ? o.tempo : 0, Math.abs(vy / Math.max(dt, 1e-3)) > 3);
      // Puffer kürzen
      while (b.length > 2 && b[1].t < jetzt) b.shift();
    }
  }
  alleWeg() { for (const id of [...this.map.keys()]) this.entferne(id); }
}
