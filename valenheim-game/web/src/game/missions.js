// Missionen im Client: Missionstafeln, Zielmarkierung, getragene Ladung, Einwohner (vom Server gesteuert).
// Der Client zeigt nur an – Fortschritt und Punkte entscheidet der Server.
import * as THREE from 'three';
import { Character, nameTag } from './character.js';
import { signTexture } from './textures.js';
import { groundHeight } from './city.js';

const INTERACT = 4.3;

export class MissionClient {
  constructor(engine, net, ev = {}) {
    this.e = engine; this.net = net; this.ev = ev; this.places = {}; this.boards = []; this.mission = null; this.npcs = new Map();
    this.group = new THREE.Group(); engine.scene.add(this.group);
    // Zielmarkierung: Lichtsäule + Ring + Pfeil
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.marker = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 60, 24, 1, true), beamMat); beam.position.y = 30; this.marker.add(beam);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.85, depthWrite: false })); ring.position.y = 0.06; this.marker.add(ring); this.ring = ring;
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.2, 4).rotateX(Math.PI), new THREE.MeshStandardMaterial({ color: 0xffd54a, emissive: 0x806010, roughness: 0.4 })); arrow.position.y = 4; this.marker.add(arrow); this.arrow = arrow;
    this.marker.visible = false; this.group.add(this.marker);
    // Ladung
    this.cargo = {
      kiste: new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.42, 0.42), new THREE.MeshStandardMaterial({ color: '#a77b47', roughness: 0.9 })),
      medizin: (() => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.3), new THREE.MeshStandardMaterial({ color: '#f4f4f0', roughness: 0.5 })));
        const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.24, 0.02), new THREE.MeshStandardMaterial({ color: '#d42a2a' })); c1.position.z = 0.16; g.add(c1);
        const c2 = c1.clone(); c2.rotation.z = Math.PI / 2; g.add(c2); return g; })(),
      aushang: new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.26), new THREE.MeshStandardMaterial({ color: '#e9e4d6', roughness: 0.8 })),
    };
    for (const k in this.cargo) { this.cargo[k].position.set(0, 1.18, 0.38); this.cargo[k].castShadow = true; }
    this.prompt = null;
    engine.addUpdater((dt, t) => this.update(dt, t));
  }

  handle(m) {
    switch (m.t) {
      case 'world': this.places = m.places; this.boards = m.boards; this.buildBoards(); return true;
      case 'm_list': this.ev.list?.(m.list, m.cooldown); return true;
      case 'm_state': this.setMission(m.m); return true;
      case 'm_done': this.setMission(null); this.ev.done?.(m); return true;
      case 'm_bonus': this.ev.bonus?.(m); return true;
      case 'm_fail': this.setMission(null); this.ev.info?.(m.grund, true); return true;
      case 'm_info': this.ev.info?.(m.text); return true;
      case 'npc': this.updateNpcs(m.l); return true;
      default: return false;
    }
  }

  buildBoards() {
    if (this.boardsBuilt) return; this.boardsBuilt = true;
    const tex = signTexture('MISSIONEN', { bg: '#0b1a33', fg: '#ffffff', accent: '#d4af37', w: 512, h: 128 });
    for (const k of this.boards) {
      const p = this.places[k]; const g = new THREE.Group(); const y = groundHeight(p.x, p.z);
      const post = new THREE.MeshStandardMaterial({ color: '#2b3038', metalness: 0.6, roughness: 0.4 });
      for (const x of [-0.9, 0.9]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.4, 0.1), post); m.position.set(x, 1.2, 0); m.castShadow = true; g.add(m); }
      const board = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.3, 0.12), new THREE.MeshStandardMaterial({ color: '#13254a', roughness: 0.6 })); board.position.y = 1.7; board.castShadow = true; g.add(board);
      for (const s of [1, -1]) { const face = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.48), new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.35 })); face.position.set(0, 2.05, 0.065 * s); face.rotation.y = s < 0 ? Math.PI : 0; g.add(face); }
      const glow = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.5, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xd4af37, transparent: true, opacity: 0.6, depthWrite: false })); glow.position.y = 0.05; g.add(glow);
      g.position.set(p.x, y, p.z); g.rotation.y = Math.atan2(-p.x, -p.z) + Math.PI; // grob zur Stadtmitte gedreht
      this.group.add(g); this.e.colliders.add(p.x - 1, p.z - 0.2, p.x + 1, p.z + 0.2, 2.5, 'tafel');
    }
  }

  setMission(m) {
    this.mission = m; this.ev.state?.(m);
    const carrying = m?.tragen ? (m.titel && m.typ === 'medizin' ? 'medizin' : m.typ === 'verwaltung' ? 'aushang' : 'kiste') : null;
    if (this.carrying !== carrying) {
      if (this.carrying && this.e.char) this.e.char.root.remove(this.cargo[this.carrying]);
      if (carrying && this.e.char) this.e.char.root.add(this.cargo[carrying]);
      this.carrying = carrying; this.e.noRun = carrying === 'kiste' || carrying === 'medizin';
      if (this.e.char) this.e.char.carry = !!carrying && carrying !== 'aushang';
    }
    this.e.missionTarget = m?.ziel || null;
    if (m?.ziel) { this.marker.visible = true; this.marker.position.set(m.ziel.x, groundHeight(m.ziel.x, m.ziel.z), m.ziel.z); }
    else this.marker.visible = false;
  }

  updateNpcs(list) {
    const seen = new Set();
    for (const [id, x, z, h, v, look] of list) {
      seen.add(id); let n = this.npcs.get(id);
      if (!n) { const char = new Character(look); char.root.add(nameTag('Einwohner', { color: '#ffd54a' })); char.root.position.set(x, groundHeight(x, z), z); this.e.scene.add(char.root); n = { char, tx: x, tz: z, h, v }; this.npcs.set(id, n); }
      n.tx = x; n.tz = z; n.h = h; n.v = v;
    }
    for (const [id, n] of this.npcs) if (!seen.has(id)) { this.e.scene.remove(n.char.root); this.npcs.delete(id); }
  }

  interact() { if (this.prompt) this.net.sendMsg({ t: 'act' }); }
  accept(id) { this.net.sendMsg({ t: 'm_accept', id }); }
  abort() { this.net.sendMsg({ t: 'm_abort' }); }

  update(dt, t) {
    const p = this.e.pos;
    // Interaktions-Hinweis
    let prompt = null;
    if (!this.mission) { for (const k of this.boards) { const b = this.places[k]; if (Math.hypot(b.x - p.x, b.z - p.z) < INTERACT + 0.8) prompt = 'Missionen ansehen'; } }
    else if (this.mission.ziel && this.mission.ziel.key !== '_evac') {
      const z = this.mission.ziel; const d = Math.hypot(z.x - p.x, z.z - p.z);
      if (d < INTERACT && this.mission.typ !== 'erkundung' && this.mission.typ !== 'evakuierung') prompt = this.mission.tragen ? (this.mission.typ === 'verwaltung' ? 'Aushang aufhängen' : 'Abgeben') : (this.mission.typ === 'verwaltung' ? 'Aushänge abholen' : 'Aufnehmen');
    }
    if (prompt !== this.prompt) { this.prompt = prompt; this.ev.prompt?.(prompt); }
    if (this.e.input?.consume('interact') && this.prompt) this.interact();
    // Markierung animieren
    if (this.marker.visible) { this.arrow.position.y = 4 + Math.sin(t * 3) * 0.4; this.arrow.rotation.y += dt * 2; this.ring.scale.setScalar(1 + Math.sin(t * 4) * 0.08); }
    // Einwohner weich nachführen
    for (const n of this.npcs.values()) {
      const r = n.char.root; const k = Math.min(1, dt * 6);
      r.position.x += (n.tx - r.position.x) * k; r.position.z += (n.tz - r.position.z) * k; r.position.y = groundHeight(r.position.x, r.position.z);
      let dh = n.h - r.rotation.y; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); r.rotation.y += dh * k;
      n.char.animate(dt, n.v);
    }
    if (this.mission?.ziel) this.ev.distance?.(Math.round(Math.hypot(this.mission.ziel.x - p.x, this.mission.ziel.z - p.z)));
  }

  dispose() { this.e.scene.remove(this.group); for (const n of this.npcs.values()) this.e.scene.remove(n.char.root); }
}
