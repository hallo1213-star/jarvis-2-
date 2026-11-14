// VALENHEIM 2.0 – Fahrzeug in der Welt: Modell + Kollisionskörper. Eigenes Auto: Arcade-Fahrphysik mit Rapier-Kollision.
import * as THREE from 'three';
import { baueAuto, entsorge, KATALOG } from './modelle.js';

const SCHWERKRAFT = 22;
export class Auto {
  // pose: { x, y (Boden), z, h }
  constructor(scene, RAPIER, world, look, pose, { lokal = false } = {}) {
    this.scene = scene; this.RAPIER = RAPIER; this.world = world; this.look = look; this.lokal = lokal;
    this.mesh = baueAuto(look); scene.add(this.mesh); const T = this.T = this.mesh.userData.T; this.M = this.mesh.userData.M;
    this.pos = new THREE.Vector3(pose.x, pose.y, pose.z); this.heading = pose.h || 0; this.speed = 0; this.steer = 0; this.rad = 0; this.velY = 0;
    const hoehe = Math.max(...T.cabin.map((p) => p[1])); this.halbH = hoehe / 2 - 0.12;
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pose.x, pose.y + this.halbH + 0.18, pose.z));
    this.collider = world.createCollider(RAPIER.ColliderDesc.cuboid(T.W / 2, this.halbH, T.L / 2), this.body);
    this.setzeDrehung();
    if (lokal) {
      this.ctrl = world.createCharacterController(0.04);
      this.ctrl.enableSnapToGround(0.6); this.ctrl.enableAutostep(0.3, 0.5, false); this.ctrl.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(35)); this.ctrl.setSlideEnabled(true);
    }
    // Leistung: Katalog + Motor-Tuning
    const motor = look.tuning?.motor || 0;
    this.vmax = (this.M.kmh / 3.6) * (1 + motor * 0.05); this.beschl = this.M.beschleunigung * (1 + motor * 0.12);
    this.sync(0);
  }
  setzeDrehung() { const q = { x: 0, y: Math.sin(this.heading / 2), z: 0, w: Math.cos(this.heading / 2) }; this.body.setRotation(q, true); }
  kmh() { return Math.abs(this.speed) * 3.6; }

  // Eingabe: gas -1..1, lenk -1..1, bremse (Handbremse)
  fahre(dt, { gas, lenk, bremse }, ausnahme) {
    const vmax = this.vmax, rueck = -11;
    if (gas > 0) this.speed += (this.speed < -0.5 ? 26 : this.beschl * (1 - Math.max(0, this.speed) / vmax) * 1.15) * gas * dt;
    else if (gas < 0) this.speed += (this.speed > 0.5 ? -28 : -8 * (1 - Math.min(0, this.speed) / rueck)) * -gas * dt;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), (1.8 + Math.abs(this.speed) * 0.06) * dt);
    if (bremse) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 18 * dt);
    this.speed = THREE.MathUtils.clamp(this.speed, rueck, vmax);
    const sMax = THREE.MathUtils.lerp(0.6, 0.13, Math.min(1, Math.abs(this.speed) / 45));
    this.steer += (lenk * sMax - this.steer) * Math.min(1, dt * 7);
    const wb = this.T.wheels[1] - this.T.wheels[0];
    this.heading -= (this.speed / wb) * Math.tan(this.steer) * (bremse ? 1.6 : 1) * dt;
    this.setzeDrehung();
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    this.velY = this.velY - SCHWERKRAFT * dt;
    const wunsch = { x: fx * this.speed * dt, y: this.velY * dt, z: fz * this.speed * dt };
    this.ctrl.computeColliderMovement(this.collider, wunsch, undefined, undefined, ausnahme ? (c) => c.handle !== ausnahme.handle : undefined);
    const mv = this.ctrl.computedMovement();
    if (this.ctrl.computedGrounded()) this.velY = 0;
    // Zusammenstoß: Fahrt deutlich gebremst → Geschwindigkeit verlieren (und leicht abprallen)
    const soll = Math.hypot(wunsch.x, wunsch.z), ist = Math.hypot(mv.x, mv.z);
    this.stoss = 0; let seitlich = false;
    for (let i = 0; i < this.ctrl.numComputedCollisions(); i++) { const c = this.ctrl.computedCollision(i); if (c && Math.abs(c.normal1.y) < 0.6) { seitlich = true; break; } }
    if (seitlich && soll > 0.02 && ist < soll * 0.55) { this.stoss = Math.abs(this.speed); this.speed *= ist < soll * 0.15 ? -0.2 : 0.55; }
    const t = this.body.translation(); const neu = { x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z };
    if (neu.y < -20) { neu.y = 3; this.velY = 0; }
    this.body.setNextKinematicTranslation(neu);
    this.pos.set(neu.x, neu.y - this.halbH - 0.18, neu.z);
    this.rad += (this.speed / this.T.r) * dt; this.sync(dt);
  }
  // Fremdes/geparktes Auto an eine Position setzen (Netz)
  setze(x, y, z, h, dt = 0) {
    const vx = x - this.pos.x, vz = z - this.pos.z; const v = dt > 0 ? Math.hypot(vx, vz) / dt : 0;
    const vor = vx * Math.sin(this.heading) + vz * Math.cos(this.heading);
    this.speed += ((Math.sign(vor) * v) - this.speed) * Math.min(1, dt * 6);
    let dh = h - this.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); this.steer += (THREE.MathUtils.clamp(-dh * 6, -0.5, 0.5) - this.steer) * Math.min(1, dt * 5);
    this.pos.set(x, y, z); this.heading = h; this.setzeDrehung();
    this.body.setNextKinematicTranslation({ x, y: y + this.halbH + 0.18, z });
    this.rad += (this.speed / this.T.r) * dt; this.sync(dt);
  }
  sync(dt) {
    const m = this.mesh; m.position.copy(this.pos); m.rotation.y = this.heading;
    for (const w of m.userData.wheels) { w.spin.rotation.x = this.rad; if (w.front) w.g.rotation.y = this.steer * -1; }
    const b = m.userData.body; b.rotation.z += ((this.steer * Math.min(1, Math.abs(this.speed) / 20)) * 0.05 - b.rotation.z) * Math.min(1, dt * 5);
  }
  // Wo steigt man aus? Links neben der Fahrertür
  ausstieg() { const s = this.T.W / 2 + 0.9; return { x: this.pos.x + Math.cos(this.heading) * s, z: this.pos.z - Math.sin(this.heading) * s }; }
  abstand(p) { return Math.hypot(p.x - this.pos.x, p.z - this.pos.z); }
  entferne() {
    this.scene.remove(this.mesh); entsorge(this.mesh);
    if (this.ctrl) this.world.removeCharacterController(this.ctrl);
    this.world.removeRigidBody(this.body);
  }
}
export { KATALOG };
