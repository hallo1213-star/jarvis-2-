// VALENHEIM 2.0 – Spielkern (Phase 1): Renderer, Licht, Rapier-Physik, Spielfigur, Kamera (Third/First Person), Speichern.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { PROFILE, STUFEN, autoStufe, geraet, zielFps, FpsWaechter } from './quality.js';
import { Input } from '../spieler/eingabe.js';
import { zufall } from '../spieler/mensch.js';
import { Mensch3D, ladeFiguren } from '../spieler/figur3d.js';
import { baueTestgelaende } from '../welt/testgelaende.js';
import { baueValenheim, SPAWN } from '../welt/karte.js';
import { U as WELT_U } from '../welt/valenheim/world.js';
import { Detailsteuerung } from './details.js';
import { Tageszeit } from '../atmosphaere/tageszeit.js';
import { Wetter, WETTER_NAME } from '../atmosphaere/wetter.js';
import { baueAmpeln } from '../welt/ampeln.js';
import { getToken } from '../lib/api.js';
import { AndereSpieler } from '../spieler/andere.js';
import { Auto } from '../fahrzeuge/auto.js';
import { setAutoNacht, ladeAutos } from '../fahrzeuge/modelle.js';
import { baueJobPunkte } from '../welt/jobs.js';
import { Verkehr } from '../fahrzeuge/verkehr.js';
import { Passanten } from '../spieler/passanten.js';

const GEHEN = 4.4, RENNEN = 7.4, SPRUNG = 5.6, SCHWERKRAFT = 18;
const KAPSEL = { halb: 0.55, r: 0.35 }; // Gesamthöhe 1,8 m
const AUGEN = 1.62;

export class Game {
  static async erstelle(canvas, opts) {
    opts.onFortschritt?.('Menschen werden geladen …', 0.12); await Promise.all([RAPIER.init(), ladeFiguren(), ladeAutos()]); const g = new Game(canvas, opts); await g.ladeWelt(opts.onFortschritt); g.starte(); return g;
  }

  constructor(canvas, { konto, onStatus, onHinweis, onChat, onAbgelehnt, onOeffne, raumWunsch }) {
    this.onOeffne = onOeffne; this.canvas = canvas; this.onStatus = onStatus; this.onHinweis = onHinweis; this.onChat = onChat; this.onAbgelehnt = onAbgelehnt; this.raumWunsch = raumWunsch || {};
    const st = konto.spielstand; this.settings = { ...st.settings };
    this.geraet = geraet(); this.stufe = this.settings.grafik === 'auto' ? autoStufe(this.geraet) : this.settings.grafik;
    const P = PROFILE[this.stufe];

    // Renderer
    const r = new THREE.WebGLRenderer({ canvas, antialias: P.aa, powerPreference: 'high-performance', stencil: false });
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1;
    r.shadowMap.type = THREE.PCFShadowMap; this.renderer = r;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.08, P.sicht);

    this.welt = st.pos.welt === 'test' ? 'test' : 'valenheim';
    this.world = new RAPIER.World({ x: 0, y: -SCHWERKRAFT, z: 0 });
    // Spieler (kinematische Kapsel + Charakter-Controller)
    const p = this.welt === 'valenheim' && !st.pos.welt ? { ...SPAWN } : st.pos; this.spawn = this.welt === 'valenheim' ? { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z } : { x: 0, y: 1.2, z: 8 };
    this.body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x, Math.max(p.y, 1.2), p.z));
    this.collider = this.world.createCollider(RAPIER.ColliderDesc.capsule(KAPSEL.halb, KAPSEL.r), this.body);
    this.ctrl = this.world.createCharacterController(0.02);
    this.ctrl.enableAutostep(0.42, 0.25, true); this.ctrl.enableSnapToGround(0.45); this.ctrl.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(42));
    this.ctrl.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(48)); this.ctrl.setApplyImpulsesToDynamicBodies(true); this.ctrl.setCharacterMass(70);
    this.velY = 0; this.boden = false; this.heading = p.h ?? Math.PI;
    this.name = konto.profil.name; this.figur = new Mensch3D(st.charakter?.aussehen || zufall()); this.scene.add(this.figur.root);

    // Kamera
    this.modus = this.settings.kamera === 'ego' ? 'ego' : 'verfolger';
    this.yaw = this.heading + Math.PI; this.pitch = 0.28; this.abstand = 5.5; this.camAbstand = undefined;
    this.input = new Input(canvas);

    // Netz: Position an den Server (10×/s), Server prüft + speichert; andere Spieler im selben Raum
    this.andere = new AndereSpieler(this.scene, RAPIER, this.world);
    this.netz(); this.sendT = 0;

    // Qualität + Wächter (angewendet in starte())
    this.waechter = new FpsWaechter(zielFps(this.geraet), () => {
      if (this.settings.grafik !== 'auto') return; const i = STUFEN.indexOf(this.stufe); if (i > 0) { this.setzeStufe(STUFEN[i - 1]); this.onHinweis?.(`Grafik automatisch auf „${PROFILE[this.stufe].name}“ gesenkt, damit es flüssig bleibt.`); }
    });

    this.timer = new THREE.Timer(); this.t = 0; this.fps = 0; this.frames = 0; this.fpsT = 0;
    this.resize = this.resize.bind(this); addEventListener('resize', this.resize);
    window.VH2 = this;
  }

  // Welt laden: Valenheim-Karte aus den Videos (Standard) oder Testgelände
  async ladeWelt(onFortschritt) {
    if (this.welt === 'test') {
      const sky = new Sky(); sky.scale.setScalar(4000); this.scene.add(sky);
      const u = sky.material.uniforms; u.turbidity.value = 5; u.rayleigh.value = 1.5; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.8;
      this.sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(52), THREE.MathUtils.degToRad(210)); u.sunPosition.value.copy(this.sunDir);
      this.scene.fog = new THREE.FogExp2('#9fb0c2', PROFILE[this.stufe].nebel);
      this.scene.add(new THREE.HemisphereLight('#c4d6f0', '#4a4034', 0.45));
      this.sun = new THREE.DirectionalLight('#ffecc8', 2.2); this.scene.add(this.sun, this.sun.target);
      this.gelaende = baueTestgelaende(this.scene, RAPIER, this.world); this.exposure = 0.5;
    } else {
      const karte = await baueValenheim(this.scene, RAPIER, this.world, { onFortschritt });
      this.gelaende = karte; this.jobPunkte = baueJobPunkte(this.scene);
      // Phase 9: Leben in der Stadt (Menge je nach Grafikstufe)
      const viel = { niedrig: [8, 6], mittel: [14, 10], hoch: [20, 16] }[this.stufe] || [12, 8];
      this.verkehr = new Verkehr(this.scene, RAPIER, this.world, { anzahl: viel[0] }); this.passanten = new Passanten(this.scene, { anzahl: viel[1] }); this.zonen = [...(karte.zonen || []), ...this.jobPunkte.zonen]; this.sun = karte.world.sun; this.hemi = karte.world.hemi;
      this.sunDir = WELT_U.sunDir.value.clone();
      this.exposure = karte.world.exposure || 1.1; this.kollisionen = karte.kollisionen;
      this.details = new Detailsteuerung(this.scene);
      this.tageszeit = new Tageszeit(karte.world, this.renderer);
      this.ampeln = baueAmpeln(this.scene, karte.world.ampeln);
      this.wetter = new Wetter(this.scene, this.renderer, { ton: this.settings.ton !== false });
      this.weckTon = () => this.wetter?.ton.resume(); addEventListener('pointerdown', this.weckTon); addEventListener('keydown', this.weckTon);
    }
    // Umgebungslicht für Spiegelungen (Glas, Autos) – in der Video-Stadt nicht (dort wie in den Videos beleuchtet)
    if (this.welt === 'valenheim') {
      this.renderer.toneMappingExposure = this.exposure;
      // Echtes Himmelslicht (HDRI, Poly Haven CC0) für Spiegelungen – lädt im Hintergrund
      new HDRLoader().load('/hdri/himmel_1k.hdr', (hdr) => {
        if (this.beendet) return; const pm = new THREE.PMREMGenerator(this.renderer); hdr.mapping = THREE.EquirectangularReflectionMapping;
        this.scene.environment = pm.fromEquirectangular(hdr).texture; this.scene.environmentIntensity = 0.35; hdr.dispose(); pm.dispose();
      });
      return;
    }
    const pm = new THREE.PMREMGenerator(this.renderer); const env = new THREE.Scene(); const s2 = new Sky(); s2.scale.setScalar(1000); s2.material.uniforms.sunPosition.value.copy(this.sunDir); env.add(s2);
    this.scene.environment = pm.fromScene(env, 0, 0.1, 2000).texture; this.scene.environmentIntensity = 0.3; pm.dispose();
    this.renderer.toneMappingExposure = this.exposure;
  }

  starte() {
    this.setzeStufe(this.stufe, false); this.resize();
    this.loop = this.loop.bind(this); this.renderer.setAnimationLoop(this.loop);
  }

  setzeStufe(stufe, info = true) {
    this.stufe = stufe; const P = PROFILE[stufe]; const r = this.renderer;
    r.setPixelRatio(Math.min(this.geraet.dpr, P.pr)); if (this.scene.fog) this.scene.fog.density = this.welt === 'valenheim' ? P.nebelStadt : P.nebel; this.camera.far = this.welt === 'valenheim' ? P.sichtStadt : P.sicht; this.camera.updateProjectionMatrix();
    r.shadowMap.enabled = P.schatten > 0; this.sun.castShadow = P.schatten > 0;
    if (P.schatten) { this.sun.shadow.mapSize.set(P.schatten, P.schatten); const S = P.schattenWeite; Object.assign(this.sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 300 }); this.sun.shadow.camera.updateProjectionMatrix(); this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.03; this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }
    this.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
    this.details?.setzeRadius(P.detailRadius, P.schatten > 0 && stufe === 'hoch');
    this.resize(); if (info) this.onStatus?.({ stufe });
  }

  netz() {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    const ws = new WebSocket(url); this.ws = ws; this.onStatus?.({ netz: 'verbinde' });
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hallo', token: getToken(), ...this.raumWunsch }));
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.t === 'willkommen') {
        this.ich = m.du; this.raum = m.raum; this.konto = m.konto; this.onStatus?.({ konto: m.konto });
        // Phase 7: geparktes Auto steht wieder da
        if (m.meinAuto && !this.meinAuto) {
          const a = m.meinAuto; const look = { id: a.id, modell: a.modell, farbe: a.farbe, kennzeichen: a.kennzeichen, tuning: a.tuning };
          this.meinAuto = new Auto(this.scene, RAPIER, this.world, look, { x: a.x, y: a.y - 0.9, z: a.z, h: a.h }, { lokal: true }); this.meinAutoInfo = look;
          this.onStatus?.({ meinAuto: a.id });
        } this.raumWunsch = m.raum.privat ? { code: m.raum.code } : { raum: m.raum.id };
        this.andere.alleWeg(); for (const o of m.andere) this.andere.setze(o);
        // Steht schon jemand genau hier (z. B. am Startpunkt)? Dann ein paar Meter daneben erscheinen.
        const ich = this.body.translation();
        if (m.andere.some((o) => o.pos && Math.hypot(o.pos.x - ich.x, o.pos.z - ich.z) < 1.5)) {
          for (let i = 0; i < 12; i++) {
            const w = Math.random() * Math.PI * 2, d = 2 + Math.random() * 2.5; const x = ich.x + Math.cos(w) * d, z = ich.z + Math.sin(w) * d;
            if (m.andere.every((o) => !o.pos || Math.hypot(o.pos.x - x, o.pos.z - z) > 1.5) && !this.world.castRay(new RAPIER.Ray({ x: ich.x, y: ich.y, z: ich.z }, { x: (x - ich.x) / d, y: 0, z: (z - ich.z) / d }), d + 0.5, true, undefined, undefined, this.collider)) { this.body.setTranslation({ x, y: ich.y, z }, true); break; }
          }
        }
        this.onStatus?.({ netz: 'online', online: m.online, raum: m.raum, spieler: this.spielerListe() });
      }
      if (m.t === 'neu') { this.andere.setze(m); this.onStatus?.({ spieler: this.spielerListe() }); this.onChat?.({ system: true, text: `${m.name} ist da.` }); }
      if (m.t === 'weg') { this.andere.entferne(m.id); this.onStatus?.({ spieler: this.spielerListe() }); this.onChat?.({ system: true, text: `${m.name} hat den Server verlassen.` }); }
      if (m.t === 'look') this.andere.aussehen(m.id, m.look);
      if (m.t === 'emote') this.andere.map.get(m.id)?.fig.zeige(m.art);
      if (m.t === 's') this.andere.snapshot(m.p, this.ich);
      if (m.t === 'chat') this.onChat?.(m);
      if (m.t === 'geld') { this.konto = m.konto; this.onStatus?.({ konto: m.konto }); if (m.text) this.onHinweis?.(m.text); }
      if (m.t === 'job') {
        this.job = m.job; this.jobPunkte?.setzeZiel(m.job?.ziel); this.onStatus?.({ job: m.job });
        if (m.fehler) this.onHinweis?.(m.fehler);
        else if (m.lohn) this.onHinweis?.(`Geliefert in ${m.sekunden} s! +${m.lohn + m.bonus} € ${m.bonus ? '(mit Trinkgeld)' : ''}`);
        else if (m.job) this.onHinweis?.(`${m.job.ware} nach ${m.job.adresse} (${m.job.d} m) – folge der grünen Säule.`);
      }
      if (m.t === 'auto' && m.spieler !== this.ich) this.andere.auto(m.spieler, m.auto, m.f);
      if (m.t === 'abgelehnt') { this.ende = true; this.onAbgelehnt?.(m.grund); }
      if (m.t === 'korrektur') { if (this.faehrt) this.aussteigen(true); this.body.setTranslation(m.pos, true); this.velY = 0; }
      if (m.t === 'doppelt') { this.ende = true; this.onHinweis?.('Du hast dich auf einem anderen Gerät angemeldet.'); }
    };
    ws.onclose = (e) => { if (this.beendet || this.ende || e.code === 4005 || e.code === 4010) return; this.andere.alleWeg(); if (this.faehrt) this.aussteigen(true); this.meinAuto?.entferne(); this.meinAuto = null; this.onStatus?.({ meinAuto: null }); this.onStatus?.({ netz: 'getrennt' }); setTimeout(() => !this.beendet && this.netz(), 3000); };
  }

  // ---------- Fahrzeuge (Phase 6) ----------
  autoHolen(wagen) {
    if (this.faehrt) this.aussteigen(true);
    this.meinAuto?.entferne(); this.meinAuto = null;
    // 5 m vor dem Spieler – wenn dort eine Wand ist, hinter ihm
    const p = this.body.translation(); const fx = Math.sin(this.heading), fzr = Math.cos(this.heading); let d = 5;
    const frei = (s) => !this.world.castRay(new RAPIER.Ray({ x: p.x, y: p.y, z: p.z }, { x: fx * s, y: 0, z: fzr * s }), 7.5, true, undefined, undefined, this.collider);
    const s = frei(1) ? 1 : frei(-1) ? -1 : 0; if (!s) d = 0;
    const pose = { x: p.x + fx * d * (s || 1), y: p.y - KAPSEL.halb - KAPSEL.r, z: p.z + fzr * d * (s || 1), h: this.heading + Math.PI / 2 };
    if (!s) { pose.x += Math.cos(this.heading) * 3; pose.z -= Math.sin(this.heading) * 3; }
    this.meinAuto = new Auto(this.scene, RAPIER, this.world, wagen, pose, { lokal: true }); this.meinAutoInfo = wagen;
    this.ws?.readyState === 1 && this.ws.send(JSON.stringify({ t: 'auto_raus', id: wagen.id, x: +pose.x.toFixed(2), y: +(pose.y + 0.9).toFixed(2), z: +pose.z.toFixed(2), h: +pose.h.toFixed(3) }));
    this.onStatus?.({ meinAuto: wagen.id }); this.onHinweis?.(`${this.meinAuto.M.name} steht bereit – geh hin und drück E.`);
  }
  autoWegbringen() { if (this.faehrt) this.aussteigen(true); this.meinAuto?.entferne(); this.meinAuto = null; this.ws?.readyState === 1 && this.ws.send(JSON.stringify({ t: 'auto_weg' })); this.onStatus?.({ meinAuto: null }); }
  // Nach Tuning: Auto mit neuem Aussehen an derselben Stelle neu aufbauen
  autoAktualisieren(fz) {
    if (!this.meinAuto || this.meinAutoInfo?.id !== fz.id) return; const a = this.meinAuto; const pose = { x: a.pos.x, y: a.pos.y, z: a.pos.z, h: a.heading };
    const fuhr = this.faehrt; a.entferne(); this.meinAuto = new Auto(this.scene, RAPIER, this.world, fz, pose, { lokal: true }); this.meinAutoInfo = fz; if (fuhr) this.meinAuto.speed = 0;
  }
  einsteigen() { this.faehrt = true; this.collider.setEnabled(false); this.figur.root.visible = false; this.yaw = this.meinAuto.heading + Math.PI; this.pitch = 0.2; this.onStatus?.({ faehrt: true }); }
  aussteigen(sofort = false) {
    const a = this.meinAuto; if (!a) return;
    if (!sofort && Math.abs(a.speed) > 3) { this.onHinweis?.('Erst anhalten.'); return; }
    const p = a.ausstieg(); this.body.setTranslation({ x: p.x, y: a.pos.y + KAPSEL.halb + KAPSEL.r + 0.15, z: p.z }, true);
    this.collider.setEnabled(true); this.faehrt = false; a.speed = 0; this.velY = 0; this.heading = a.heading; this.onStatus?.({ faehrt: false, kmh: 0 });
  }
  // Was kann man hier gerade tun? (Hinweis unten in der Mitte, E / Antippen)
  aktionPruefen() {
    const p = this.body.translation(); let a = null;
    if (this.job && Math.hypot(p.x - this.job.ziel.x, p.z - this.job.ziel.z) < 7) a = { art: 'liefern', text: `${this.job.ware} übergeben` };
    else if (this.faehrt) a = { art: 'aussteigen', text: 'Aussteigen' };
    else if (this.meinAuto && this.meinAuto.abstand(p) < this.meinAuto.T.L / 2 + 1.6) a = { art: 'einsteigen', text: `Einsteigen – ${this.meinAuto.M.name}` };
    else for (const z of this.zonen || []) if (Math.hypot(p.x - z.x, p.z - z.z) < z.r) { a = { ...z }; break; }
    if ((a?.text || null) !== (this.aktion?.text || null)) { this.aktion = a; this.onStatus?.({ aktion: a }); }
  }
  aktionAusfuehren() {
    const a = this.aktion; if (!a) return;
    if (a.art === 'einsteigen') this.einsteigen(); else if (a.art === 'aussteigen') this.aussteigen();
    else if (a.art === 'liefern') this.sende({ t: 'job_liefern' });
    else if (a.art === 'job') this.onOeffne?.('job:' + a.firma);
    else this.onOeffne?.(a.art);
  }

  fahren(dt) {
    const inp = this.input; inp.update(); const a = this.meinAuto;
    if (inp.consume('kameraWechsel')) this.wechsleKamera();
    const look = inp.consumeLook(); const emp = 0.0032 * (this.settings.empfindlichkeit || 1);
    if (look.dx || look.dy) this.lookT = this.t;
    this.yaw -= look.dx * emp; this.pitch = THREE.MathUtils.clamp(this.pitch + look.dy * emp * 0.8 * (this.settings.yInvertiert ? -1 : 1), -0.3, 1.0);
    const bremse = inp.keys.has('Space') || inp.bremse;
    a.fahre(dt, { gas: inp.move.y, lenk: inp.move.x, bremse }, this.collider);
    if (a.stoss > 9) this.onHinweis?.('Rums!');
    // Kamera: hinter dem Auto, kehrt nach kurzem Umsehen automatisch zurück
    if (this.t - (this.lookT || -9) > 1.4) {
      let d = (a.heading + Math.PI) - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yaw += d * Math.min(1, dt * 2.5);
      this.pitch += (0.2 - this.pitch) * Math.min(1, dt * 1.5);
    }
    const fuss = a.pos.y;
    if (this.modus === 'ego') {
      const s = a.T.W / 2 - 0.55; const kopf = new THREE.Vector3(a.pos.x - Math.cos(a.heading) * -s + Math.sin(a.heading) * 0.2, fuss + Math.max(...a.T.cabin.map((q) => q[1])) - 0.28, a.pos.z + Math.sin(a.heading) * -s + Math.cos(a.heading) * 0.2);
      this.camera.position.copy(kopf); const yaw = this.yaw + Math.PI;
      this.camera.lookAt(kopf.x + Math.sin(yaw) * 10, kopf.y - Math.sin(this.pitch - 0.2) * 10, kopf.z + Math.cos(yaw) * 10);
    } else {
      const ziel = new THREE.Vector3(a.pos.x, fuss + 1.5, a.pos.z);
      const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
      const weite = 4.2 + a.T.L * 0.55 + Math.min(2, Math.abs(a.speed) * 0.04);
      let dist = weite; const hit = this.world.castRay(new RAPIER.Ray(ziel, dir), weite, true, undefined, undefined, a.collider);
      if (hit) dist = Math.max(1.2, hit.timeOfImpact - 0.3);
      this.camAbstand = this.camAbstand === undefined ? dist : (dist < this.camAbstand ? dist : this.camAbstand + (dist - this.camAbstand) * Math.min(1, dt * 3));
      this.camera.position.copy(ziel).addScaledVector(dir, this.camAbstand); this.camera.lookAt(ziel);
    }
    // Spielerkörper reist (deaktiviert) mit
    this.body.setNextKinematicTranslation({ x: a.pos.x, y: fuss + KAPSEL.halb + KAPSEL.r, z: a.pos.z }); this.heading = a.heading;
    this.kmhT = (this.kmhT || 0) + dt; if (this.kmhT > 0.1) { this.kmhT = 0; this.onStatus?.({ kmh: Math.round(a.kmh()) }); }
  }

  emote(art) { if (this.faehrt) return; this.figur.zeige(art); this.sende({ t: 'emote', art }); }
  sende(m) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m)); }
  // Daten für die Minikarte
  karte() {
    const p = this.faehrt && this.meinAuto ? this.meinAuto.pos : this.body.translation();
    return { x: p.x, z: p.z, yaw: this.yaw, heading: this.heading, andere: [...this.andere.map.values()].map((o) => ({ x: o.fig.root.position.x, z: o.fig.root.position.z, f: o.f })),
      auto: this.meinAuto && !this.faehrt ? { x: this.meinAuto.pos.x, z: this.meinAuto.pos.z } : null, ziel: this.job?.ziel || null, zonen: this.zonen, verkehr: this.verkehr?.karte() || [] };
  }

  spielerListe() { return [{ id: this.ich, name: this.name, du: true }, ...this.andere.namen()]; }
  chat(text) { if (this.ws?.readyState === 1 && text.trim()) this.ws.send(JSON.stringify({ t: 'chat', text: text.slice(0, 140) })); }

  resize() {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.fov = w / h < 0.8 ? 72 : 62; this.camera.updateProjectionMatrix();
  }

  wechsleKamera() {
    this.modus = this.modus === 'ego' ? 'verfolger' : 'ego'; this.settings.kamera = this.modus;
    this.onStatus?.({ kamera: this.modus }); return this.modus;
  }

  loop() {
    if (this.beendet) return;
    this.timer.update(); const dt = Math.min(0.05, this.timer.getDelta()); this.t += dt;
    if (this.faehrt && this.meinAuto) this.fahren(dt); else this.spieler(dt);
    if (this.input.consume('interact')) this.aktionAusfuehren();
    if (this.input.consume('handy')) this.onOeffne?.('handy');
    const em = this.input.consume('emoteWahl'); if (em) this.emote(em);
    this.aktionT = (this.aktionT || 0) + dt; if (this.aktionT > 0.15) { this.aktionT = 0; this.aktionPruefen(); }
    this.andere.update(dt, this.camera);
    if (this.verkehr) {
      const p = this.body.translation(); const h = [{ x: p.x, z: p.z }]; if (this.meinAuto) h.push({ x: this.meinAuto.pos.x, z: this.meinAuto.pos.z });
      for (const o of this.andere.map.values()) { h.push({ x: o.fig.root.position.x, z: o.fig.root.position.z }); if (o.wagen) h.push({ x: o.wagen.pos.x, z: o.wagen.pos.z }); }
      this.verkehr.update(dt, h, this.camera); this.passanten.update(dt, this.camera);
    }
    this.world.timestep = dt; this.world.step();
    this.gelaende.update(this.t, this.camera); this.jobPunkte?.update(this.t);
    this.details?.update(dt, this.camera.position);
    if (this.tageszeit) {
      const uhr = this.tageszeit.update(); this.ampeln.update(); setAutoNacht(this.tageszeit.nacht || 0); this.scene.environmentIntensity = 0.06 + 0.34 * (1 - (this.tageszeit.nacht || 0));
      this.wetter.update(dt, this.camera.position, this.welt === 'valenheim' ? PROFILE[this.stufe].nebelStadt : PROFILE[this.stufe].nebel, this.tageszeit.nacht);
      this.uhrT = (this.uhrT || 0) + dt; if (this.uhrT > 1) { this.uhrT = 0; this.onStatus?.({ uhr, wetter: WETTER_NAME[this.wetter.art] }); }
    }
    // Schatten folgen dem Spieler
    const pos = this.body.translation();
    if (this.welt === 'test') { const f = new THREE.Vector3(pos.x, 0, pos.z); this.sun.position.copy(f).addScaledVector(this.sunDir, 120); this.sun.target.position.copy(f); this.sun.target.updateMatrixWorld(); }
    else this.sun.target.updateMatrixWorld();
    this.renderer.render(this.scene, this.camera);
    this.waechter.tick(dt); this.frames++; this.fpsT += dt; if (this.fpsT >= 0.5) { this.fps = Math.round(this.frames / this.fpsT); this.frames = 0; this.fpsT = 0; this.onStatus?.({ fps: this.fps }); }
    // Position senden
    this.sendT += dt; if (this.sendT > 0.1 && this.ws?.readyState === 1) { this.sendT = 0; const a = this.faehrt ? this.meinAuto : null; const q = a ? { x: a.pos.x, y: a.pos.y + 0.9, z: a.pos.z } : pos;
      this.ws.send(JSON.stringify({ t: 'pos', x: +q.x.toFixed(2), y: +q.y.toFixed(2), z: +q.z.toFixed(2), h: +this.heading.toFixed(3), ...(a ? { f: 1 } : {}) })); }
  }

  spieler(dt) {
    const inp = this.input; inp.update();
    if (inp.consume('kameraWechsel')) this.wechsleKamera();
    const look = inp.consumeLook(); const emp = 0.0032 * (this.settings.empfindlichkeit || 1);
    this.yaw -= look.dx * emp; this.pitch = THREE.MathUtils.clamp(this.pitch + look.dy * emp * 0.8 * (this.settings.yInvertiert ? -1 : 1), this.modus === 'ego' ? -1.35 : -0.35, this.modus === 'ego' ? 1.35 : 1.2);
    const z = inp.consume('zoom'); if (z) this.abstand = THREE.MathUtils.clamp(this.abstand + z * 0.6, 2.2, 10);

    // Wunschbewegung relativ zur Blickrichtung
    const mx = inp.move.x, my = inp.move.y; const stark = Math.min(1, Math.hypot(mx, my)); const v = (inp.run ? RENNEN : GEHEN) * stark;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw); let dx = (fx * my - fz * mx), dz = (fz * my + fx * mx); const l = Math.hypot(dx, dz);
    if (l > 0.01) { dx /= l; dz /= l; const ziel = Math.atan2(dx, dz); let d = ziel - this.heading; d = Math.atan2(Math.sin(d), Math.cos(d)); this.heading += d * Math.min(1, dt * 12); }
    if (this.modus === 'ego') this.heading = this.yaw + Math.PI;
    if (inp.consume('jump') && this.boden) { this.velY = SPRUNG; this.boden = false; }
    this.velY = this.boden && this.velY < 0 ? -1 : this.velY - SCHWERKRAFT * dt;
    const wunsch = { x: dx * v * dt, y: this.velY * dt, z: dz * v * dt };
    this.ctrl.computeColliderMovement(this.collider, wunsch);
    const mv = this.ctrl.computedMovement(); const t = this.body.translation();
    const neu = { x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z }; this.body.setNextKinematicTranslation(neu);
    this.boden = this.ctrl.computedGrounded(); if (this.boden && this.velY < 0) this.velY = 0;
    if (neu.y < -30) { this.body.setTranslation(this.spawn, true); this.velY = 0; this.onHinweis?.('Zurück zum Startpunkt.'); }

    // Figur
    const fuss = neu.y - KAPSEL.halb - KAPSEL.r; this.figur.root.position.set(neu.x, fuss, neu.z); this.figur.root.rotation.y = this.heading;
    this.figur.animate(dt, l > 0.01 ? v : 0, !this.boden);

    // Kamera
    const kopf = new THREE.Vector3(neu.x, fuss + AUGEN, neu.z);
    if (this.modus === 'ego') {
      this.figur.root.visible = false; this.camera.position.copy(kopf);
      const dir = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), -Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
      this.camera.lookAt(kopf.clone().add(dir));
    } else {
      const ziel = new THREE.Vector3(neu.x, fuss + 1.55, neu.z);
      const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
      let dist = this.abstand; const hit = this.world.castRay(new RAPIER.Ray(ziel, dir), this.abstand, true, undefined, undefined, this.collider);
      if (hit) dist = Math.max(0.6, hit.timeOfImpact - 0.25);
      this.camAbstand = this.camAbstand === undefined ? dist : (dist < this.camAbstand ? dist : this.camAbstand + (dist - this.camAbstand) * Math.min(1, dt * 4));
      this.camera.position.copy(ziel).addScaledVector(dir, this.camAbstand); this.camera.lookAt(ziel);
      this.figur.root.visible = this.camAbstand > 1.1;
    }
  }

  beenden() {
    this.beendet = true; this.renderer.setAnimationLoop(null); this.wetter?.dispose(); if (this.weckTon) { removeEventListener('pointerdown', this.weckTon); removeEventListener('keydown', this.weckTon); } removeEventListener('resize', this.resize); this.input.dispose();
    try { this.ws?.close(); } catch { /* egal */ }
    this.scene.traverse((o) => { o.geometry?.dispose(); [].concat(o.material || []).forEach((m) => { m.map?.dispose(); m.dispose(); }); });
    this.meinAuto?.entferne(); this.andere.alleWeg(); this.renderer.dispose(); this.world.free();
  }
}
