// Effekte: Partikel (Brunnen, Abgas, Reifenqualm, Regenspritzer, Staub), Vogelschwärme, nasse Straßen.
import * as THREE from 'three';

const softTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
})();

// Partikelsystem mit Größe/Alpha pro Teilchen (ein Draw-Call)
class Particles {
  constructor(scene, max, { color = '#ffffff', additive = false, size = 1 } = {}) {
    this.max = max; this.n = 0; this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.life = new Float32Array(max); this.age = new Float32Array(max);
    this.size = new Float32Array(max); this.grow = new Float32Array(max); this.alpha = new Float32Array(max); this.a0 = new Float32Array(max); this.drag = new Float32Array(max); this.grav = new Float32Array(max);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.p, 3)); g.setAttribute('size', new THREE.BufferAttribute(this.size, 1)); g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { map: { value: softTex }, color: { value: new THREE.Color(color) }, scale: { value: 300 * size } },
      vertexShader: 'attribute float size; attribute float alpha; varying float vA; uniform float scale; void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform sampler2D map; uniform vec3 color; varying float vA; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(color, t.a * vA); if (gl_FragColor.a < 0.004) discard; }',
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, { life = 1, size = 0.5, grow = 0.5, alpha = 0.5, drag = 0.5, grav = 0 } = {}) {
    let i = this.n < this.max ? this.n++ : (this.cursor = ((this.cursor || 0) + 1) % this.max);
    this.p.set([x, y, z], i * 3); this.v.set([vx, vy, vz], i * 3); this.life[i] = life; this.age[i] = 0; this.size[i] = size; this.grow[i] = grow; this.a0[i] = alpha; this.alpha[i] = alpha; this.drag[i] = drag; this.grav[i] = grav;
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.age[i] >= this.life[i]) { this.alpha[i] = 0; continue; }
      this.age[i] += dt; const k = this.age[i] / this.life[i]; const d = Math.max(0, 1 - this.drag[i] * dt);
      this.v[i * 3] *= d; this.v[i * 3 + 1] = this.v[i * 3 + 1] * d - this.grav[i] * dt; this.v[i * 3 + 2] *= d;
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      this.size[i] += this.grow[i] * dt; this.alpha[i] = this.a0[i] * (1 - k) * Math.min(1, this.age[i] * 8);
    }
    const g = this.points.geometry; g.setDrawRange(0, this.n); g.attributes.position.needsUpdate = true; g.attributes.size.needsUpdate = true; g.attributes.alpha.needsUpdate = true;
  }
}

// Vogelschwarm: kleine Flügelschlag-Silhouetten, kreisen über der Stadt
class Birds {
  constructor(scene, n, center, radius, height) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.12, -0.45, 0.05, -0.05, 0, 0, -0.1, 0, 0, 0.12, 0.45, 0.05, -0.05, 0, 0, -0.1], 3)); g.computeVertexNormals();
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: '#1d2126', side: THREE.DoubleSide }), n); this.mesh.frustumCulled = false; scene.add(this.mesh);
    this.b = Array.from({ length: n }, (_, i) => ({ a: (i / n) * 6.28, r: radius * (0.7 + Math.random() * 0.5), h: height + Math.random() * 8, sp: 0.12 + Math.random() * 0.05, ph: Math.random() * 6 }));
    this.c = center; this.o = new THREE.Object3D(); this.g = g;
  }
  update(dt, t) {
    this.b.forEach((b, i) => {
      b.a += b.sp * dt; const x = this.c.x + Math.cos(b.a) * b.r, z = this.c.z + Math.sin(b.a) * b.r, y = b.h + Math.sin(t * 0.5 + b.ph) * 2;
      this.o.position.set(x, y, z); this.o.rotation.set(0, -b.a, Math.sin(t * 12 + b.ph) * 0.6); this.o.scale.setScalar(1.6); this.o.updateMatrix(); this.mesh.setMatrixAt(i, this.o.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class FX {
  constructor(engine) {
    this.e = engine; const s = engine.scene;
    this.smoke = new Particles(s, 260, { color: '#c9ccd0', size: 1 });
    this.water = new Particles(s, 420, { color: '#dfeefa', size: 0.6, additive: false });
    this.splash = new Particles(s, 300, { color: '#cfdae6', size: 0.5, additive: true });
    this.birds = [new Birds(s, 14, new THREE.Vector3(0, 0, 0), 60, 38), new Birds(s, 9, new THREE.Vector3(90, 0, 150), 35, 26)];
    this.acc = 0; this.wet = 0;
    engine.addUpdater((dt, t) => this.update(dt, t));
  }
  update(dt, t) {
    const e = this.e; this.acc += dt;
    // Brunnen auf dem Rathausplatz (nur wenn in der Nähe)
    if (Math.hypot(e.camera.position.x, e.camera.position.z - 8) < 90) for (let k = 0; k < 6; k++) {
      const a = Math.random() * 6.28, r = Math.random() * 0.25;
      this.water.emit(Math.cos(a) * r, 3.4, 8 + Math.sin(a) * r, Math.cos(a) * (0.6 + Math.random()), 5.2 + Math.random() * 1.2, Math.sin(a) * (0.6 + Math.random()), { life: 1.15, size: 0.18, grow: 0.25, alpha: 0.55, drag: 0.2, grav: 9.8 });
    }
    // Auto: Abgas + Reifenqualm beim Driften/Anfahren
    const v = e.vehicle;
    if (v) {
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading); const back = v.T.L / 2 + 0.1;
      if (this.acc > 0.05) {
        this.smoke.emit(v.pos.x - fx * back + fz * 0.5, 0.35, v.pos.z - fz * back - fx * 0.5, -fx * 0.8 + (Math.random() - 0.5) * 0.4, 0.4, -fz * 0.8, { life: 1.2, size: 0.25, grow: 0.9, alpha: 0.18, drag: 1 });
        const slip = (e.input?.hand && Math.abs(v.speed) > 6) || (Math.abs(v.steer) > 0.35 && Math.abs(v.speed) > 18);
        if (slip) for (const s of [-1, 1]) this.smoke.emit(v.pos.x - fx * (back - 0.8) + fz * s * 0.85, 0.25, v.pos.z - fz * (back - 0.8) - fx * s * 0.85, (Math.random() - 0.5), 0.6, (Math.random() - 0.5), { life: 2, size: 0.6, grow: 2.2, alpha: 0.35, drag: 1.2 });
        if (v.lastHit > 6) for (let k = 0; k < 12; k++) this.smoke.emit(v.pos.x + fx * back, 0.8, v.pos.z + fz * back, (Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4, { life: 1.4, size: 0.4, grow: 1.6, alpha: 0.4, drag: 2 });
        this.acc = 0;
      }
    }
    // Regen: Spritzer auf dem Boden rund um die Kamera
    const rain = e.atmo?.rainK || 0;
    if (rain > 0.1) for (let k = 0; k < 10 * rain; k++) {
      const x = e.camera.position.x + (Math.random() - 0.5) * 40, z = e.camera.position.z + (Math.random() - 0.5) * 40;
      this.splash.emit(x, 0.18, z, 0, 1.4, 0, { life: 0.25, size: 0.08, grow: 0.5, alpha: 0.6, drag: 0, grav: 9 });
    }
    // Nasse Straßen: glänzender und dunkler
    this.wet += ((rain > 0.2 ? 1 : 0) - this.wet) * Math.min(1, dt * 0.25);
    const M = e.city.materials;
    for (const [k, base] of [['asphalt', 1], ['sidewalk', 1], ['plaza', 1]]) { const m = M[k]; if (!m) continue; m.roughness = base - this.wet * 0.62; m.color.setScalar(1 - this.wet * 0.35); }
    e.scene.environmentIntensity = Math.max(e.scene.environmentIntensity, 0.12 + this.wet * 0.25);
    this.smoke.update(dt); this.water.update(dt); this.splash.update(dt);
    for (const b of this.birds) { b.mesh.visible = (e.dayLight ?? 1) > 0.4 && rain < 0.3; if (b.mesh.visible) b.update(dt, t); }
  }
}
