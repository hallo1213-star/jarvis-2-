// Orchestrator: lädt Timeline + Serienstatus, baut die Welt und rendert jeden Frame deterministisch zu Zeit t.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildWorld, ANKER, BAUPLAETZE, P, SLAB, U } from './world.js';
import { Figure, holoMaterial, einwohnerLook, crowdPath, makeSpawnFx, makeSelectionRing } from './figure.js';
import { buildBuilding, makeBlueprint } from './catalog.js';
import { prepareShot, evalShot } from './camera.js';
import { HUD, W, H } from './hud.js';
import { clamp, smooth, ease, makeRng } from './rng.js';

const params = new URLSearchParams(location.search);
const FOLGE = String(params.get('folge') || '1').padStart(2, '0');
const SCALE = Number(params.get('scale') || 1); // 0.5 = schnelle Vorschau

async function loadJSON(url) { const r = await fetch(url); if (!r.ok) throw new Error('Fehlt: ' + url); return r.json(); }

async function init() {
  const fonts = [['Oxanium', 500, 'oxanium-latin-500-normal'], ['Oxanium', 600, 'oxanium-latin-600-normal'], ['Oxanium', 700, 'oxanium-latin-700-normal'],
    ['Montserrat', 600, 'montserrat-latin-600-normal'], ['Montserrat', 700, 'montserrat-latin-700-normal'], ['Montserrat', 800, 'montserrat-latin-800-normal'], ['Montserrat', 900, 'montserrat-latin-900-normal']];
  for (const [fam, w, file] of fonts) {
    const pkg = fam.toLowerCase();
    const f = new FontFace(fam, `url(/node_modules/@fontsource/${pkg}/files/${file}.woff2)`, { weight: String(w) });
    document.fonts.add(await f.load());
  }

  const TL = await loadJSON(`/build/folge-${FOLGE}/timeline.json`);
  const STATUS = await loadJSON(`/build/folge-${FOLGE}/status_vorher.json`).catch(() => loadJSON('/serie/stadt-status.json'));

  // ---------------- Renderer
  const RW = Math.round(W * SCALE), RH = Math.round(H * SCALE);
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1); renderer.setSize(RW, RH);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 6000);

  const world = buildWorld(scene, { seed: STATUS.welt_seed || 7071, licht: TL.licht || 'standard' });
  renderer.toneMappingExposure = world.exposure || 1.2;

  // Profilbilder (Kommentare, neue Follower, benannte Einwohner)
  const bilder = {};
  const bildUrls = new Set();
  for (const sz of TL.szenen) for (const e of sz.effekte || []) {
    if (e.avatar) bildUrls.add(e.avatar);
    for (const c of e.liste || []) if (c.avatar) bildUrls.add(c.avatar);
  }
  for (const b of STATUS.bewohner || []) if (b.avatar) bildUrls.add(b.avatar);
  await Promise.all([...bildUrls].map((u) => new Promise((res) => { const im = new Image(); im.onload = () => { bilder[u] = im; res(); }; im.onerror = () => res(); im.src = '/' + u.replace(/^\//, ''); })));

  // ---------------- Spielfigur
  const player = new Figure(); player.root.position.set(...ANKER.figur); player.root.rotation.y = Math.PI; scene.add(player.root);
  if (TL.licht === 'abend') player.setFill(0.18);
  const ring = makeSelectionRing(); ring.position.set(ANKER.figur[0], SLAB + 0.03, ANKER.figur[2]); scene.add(ring);

  // ---------------- Bereits gebaute Gebäude (Serienstand)
  for (const [i, b] of (STATUS.gebaeude || []).entries()) {
    if (!BAUPLAETZE[b.platz]) continue;
    const [bi, bj] = BAUPLAETZE[b.platz];
    const grp = buildBuilding(b.typ, { status: b.status || 'fertig', name: b.name, seed: i + 1, fortschritt: b.fortschritt ?? 0.5 });
    grp.position.set(bi * P, SLAB, bj * P);
    grp.rotation.y = Math.atan2(-bi, -bj) + Math.PI; // Front zum Platz
    scene.add(grp);
    world.setLotFree(b.platz, false);
  }

  // ---------------- Einwohner aus dem Serienstand (max. 60 sichtbar)
  const crowd = [];
  const TL_events = TL.szenen.flatMap((sz) => sz.effekte || []);
  const ankunft = TL_events.filter((e) => e.typ === 'einwohner_ankunft');
  const neuGesamt = ankunft.reduce((a, e) => a + (e.anzahl || 0), 0);
  const benanntVorher = (STATUS.bewohner || []).length;
  const vorher = Math.max(0, (STATUS.einwohner || 0) - benanntVorher);
  const MAXF = 60;
  const nCrowd = Math.min(MAXF, vorher + neuGesamt);
  const sichtbarVorher = Math.min(MAXF, vorher);
  // Ankunftszeiten der neuen (sichtbaren) Figuren
  const arrival = [];
  { let idx = sichtbarVorher; for (const e of ankunft) { const nVis = Math.min(MAXF - idx, Math.max(1, Math.round((e.anzahl || 0) * (MAXF - sichtbarVorher) / Math.max(1, neuGesamt)))); for (let k = 0; k < nVis && idx < nCrowd; k++, idx++) arrival[idx] = e.t + (k / Math.max(1, nVis)) * (e.dauer || 3); } }
  for (let i = 0; i < nCrowd; i++) {
    const f = new Figure(einwohnerLook(i), { seed: i + 3, scale: 0.94 + (i % 5) * 0.025 }); scene.add(f.root);
    f.arrive = arrival[i] ?? null; if (f.arrive !== null) f.holoMat = holoMaterial();
    crowd.push(f);
  }
  // Benannte Einwohner (z. B. Follower mit Namen): bleiben dauerhaft an ihrem Platz stehen
  const benannt = [];
  const mkBewohner = (b, arrive) => {
    const look = { ...einwohnerLook(200 + benannt.length), ...(b.look || {}) };
    for (const k of Object.keys(look)) if (typeof look[k] === 'string' && /^#|^0x/.test(look[k])) look[k] = parseInt(look[k].replace('#', '0x'));
    const f = new Figure(look, { seed: 70 + benannt.length });
    if (TL.licht === 'abend') f.setFill(0.22);
    f.root.position.set(b.pos[0], SLAB, b.pos[1]); f.root.rotation.y = THREE.MathUtils.degToRad(b.richtung ?? 0); scene.add(f.root);
    const o = { b, f, arrive, aktion: b.aktion || 'idle' };
    if (arrive !== null) { o.mat = holoMaterial(); o.fx = makeSpawnFx(); o.fx.g.position.set(b.pos[0], SLAB, b.pos[1]); scene.add(o.fx.g); }
    benannt.push(o);
  };
  for (const b of STATUS.bewohner || []) mkBewohner(b, null);
  for (const sz of TL.szenen) for (const e of sz.effekte || []) if (e.typ === 'bewohner') mkBewohner(e, e.t);

  // Bau-Ereignisse: Gebäude wachsen auf ihrem Bauplatz
  const bauten = TL_events.filter((e) => e.typ === 'bau').map((e, i) => {
    const [bi, bj] = BAUPLAETZE[e.platz];
    const grp = buildBuilding(e.gebaeude, { status: 'fertig', name: e.name, seed: 50 + i });
    grp.position.set(bi * P, SLAB, bj * P); grp.rotation.y = Math.atan2(-bi, -bj) + Math.PI; grp.visible = false; scene.add(grp);
    const bp = makeBlueprint(e.form || 'turm'); bp.g.position.set(bi * P, SLAB, bj * P); scene.add(bp.g);
    const fx = makeSpawnFx(); fx.g.position.set(bi * P, SLAB, bj * P); fx.g.scale.set(12, 1, 12); scene.add(fx.g);
    return { e, grp, bp, fx };
  });

  // ---------------- Szenen / Shots / Ereignisse vorbereiten
  const anchors = { ...ANKER };
  const shots = []; const events = []; const figActs = [];
  for (const sz of TL.szenen) {
    for (const s of sz.shots || []) shots.push({ ...prepareShot(s, anchors), szene: sz.id });
    for (const e of sz.effekte || []) events.push({ ...e, szene: sz.id });
    for (const a of sz.figur || []) figActs.push(a);
  }
  shots.sort((a, b) => a.t0 - b.t0);
  const cuts = []; // Übergänge an Szenengrenzen
  for (const sz of TL.szenen) if (sz.uebergang) cuts.push({ t: sz.start, typ: sz.uebergang });

  // Hologramm-Einwohner & Baupläne
  const holos = events.filter((e) => e.typ === 'einwohner_holo').map((e, i) => {
    const f = new Figure(einwohnerLook(100 + i), { seed: 40 + i }); const mat = holoMaterial(); f.setHolo(mat);
    f.root.position.set(...e.pos); f.root.rotation.y = Math.atan2(ANKER.figur[0] - e.pos[0], ANKER.figur[2] - e.pos[2]) + (i - 1) * 0.5;
    scene.add(f.root); const fx = makeSpawnFx(); fx.g.position.set(...e.pos); scene.add(fx.g);
    return { e, f, mat, fx };
  });
  const blueprints = events.filter((e) => e.typ === 'bauplan').map((e) => {
    const bp = makeBlueprint(e.form); const [bi, bj] = BAUPLAETZE[e.platz]; bp.g.position.set(bi * P, SLAB, bj * P); scene.add(bp.g); return { e, bp };
  });
  const holoOff = events.find((e) => e.typ === 'hologramme_aus');

  // ---------------- Post-Processing
  const rt = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(RW, RH), 0.5, 0.55, 0.9); composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // ---------------- 2D-Ausgabe (3D + HUD + Effekte)
  const out = document.createElement('canvas'); out.width = W; out.height = H; document.body.appendChild(out);
  const g = out.getContext('2d');
  const hud = new HUD();
  const { blockTypeExport } = await import('./world.js').then((m) => ({ blockTypeExport: m.blockTypeOf }));
  hud.buildMinimap(blockTypeExport, P);
  // Vignette + Filmkorn vorberechnen
  const vig = document.createElement('canvas'); vig.width = W; vig.height = H; { const v = vig.getContext('2d'); const gr = v.createRadialGradient(W / 2, H * 0.47, H * 0.22, W / 2, H / 2, H * 0.72); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.62)'); v.fillStyle = gr; v.fillRect(0, 0, W, H); }
  const grains = []; for (let k = 0; k < 6; k++) { const c = document.createElement('canvas'); c.width = 540; c.height = 960; const x = c.getContext('2d'); const id = x.createImageData(540, 960); const r = makeRng(k + 11); for (let i = 0; i < id.data.length; i += 4) { const v = r() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; } x.putImageData(id, 0, 0); grains.push(c); }

  const subs = TL.untertitel;
  const project = (p) => {
    const v = new THREE.Vector3(...p).project(camera);
    return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H, visible: v.z < 1 && v.z > -1 && Math.abs(v.x) < 1.15 && Math.abs(v.y) < 1.1 };
  };
  const hudEv = events.find((e) => e.typ === 'hud_einblenden');
  const cdEv = events.find((e) => e.typ === 'countdown_start');

  // Startwerte aus dem Serienstand
  const base = { tag: STATUS.tag, verbleibend: STATUS.verbleibende_tage, einwohner: STATUS.einwohner, kasse: STATUS.stadtkasse, gebaeude: (STATUS.gebaeude || []).filter((b) => (b.status || 'fertig') === 'fertig').length,
    entwicklung: STATUS.entwicklung_prozent, stufe: STATUS.entwicklung_stufe, waehrung: STATUS.waehrung || '€' };
  // HUD von Anfang an sichtbar, wenn die Folge kein hud_einblenden hat (ab Folge 2)
  const hudOn = hudEv ? hudEv.t : 0.0;

  function state(t) {
    const S = { ...base, stadt: STATUS.stadt, hudOn, callouts: [], plusOnes: [], project };
    S.verbleibend = base.verbleibend;
    // Einwohner-Zähler (Simulation in Folge 1)
    let ew = base.einwohner, sim = false, pulse = 0;
    for (const e of events) {
      if (e.typ === 'einwohner_holo' && t >= e.t + 0.5) { ew = e.zaehler; sim = true; pulse = Math.max(pulse, 1 - clamp((t - e.t - 0.5) / 0.6)); }
      if (e.typ === 'zaehler_reset' && t >= e.t) { ew = base.einwohner; sim = false; }
    }
    for (const e of events) if (e.typ === 'einwohner_ankunft' && t >= e.t) { const k = clamp((t - e.t) / (e.dauer || 3)); ew += Math.round((e.anzahl || 0) * ease.inOutSine(k)); if (k < 1) pulse = Math.max(pulse, 0.6 + 0.4 * Math.sin(t * 12)); }
    for (const e of events) if (e.typ === 'bewohner' && t >= e.t + 0.6) { ew += 1; pulse = Math.max(pulse, 1 - clamp((t - e.t - 0.6) / 0.7)); }
    S.einwohner = ew; S.einwohnerSim = sim; S.einwohnerPulse = pulse;
    // Geld-Einblendungen an der Stadtkasse
    S.geld = events.filter((e) => e.typ === 'geld' && t >= e.t && t <= e.t + 2.4);
    S.bilder = bilder;
    S.follower = events.find((e) => e.typ === 'follower_karte' && t >= e.t && t <= e.t + (e.dauer || 3)) || null;
    // Namensschilder benannter Einwohner
    S.namen = benannt.filter((o) => o.arrive === null || t >= o.arrive + 0.5).map((o) => ({ name: o.b.name, avatar: o.b.avatar, nr: o.b.nr, pos: [o.b.pos[0], SLAB + 2.15, o.b.pos[1]], t0: o.arrive ?? -9, feet: [o.b.pos[0], SLAB, o.b.pos[1]] }));
    // 'werte': HUD-Werte zählen animiert auf neue Werte (z. B. Stadtkasse, Gebäude, Entwicklung, Tag)
    for (const e of events) if (e.typ === 'werte' && t >= e.t) {
      const k = ease.outCubic(clamp((t - e.t) / (e.dauer || 1.2)));
      const map = { stadtkasse: 'kasse', gebaeude: 'gebaeude', entwicklung_prozent: 'entwicklung', tag: 'tag', verbleibende_tage: 'verbleibend', einwohner: 'einwohner' };
      for (const [k2, sk] of Object.entries(map)) if (e[k2] !== undefined) S[sk] = (k2 === 'tag' || k2 === 'verbleibende_tage') ? (k > 0.5 ? e[k2] : S[sk]) : S[sk] + (e[k2] - S[sk]) * k;
      if (e.entwicklung_stufe && k > 0.5) S.stufe = e.entwicklung_stufe;
    }
    // Countdown bis Kriegsbeginn: verbleibende Tage, zählt in Echtzeit herunter; beim Einblenden rollt er hoch
    const total = Math.max(0, S.verbleibend * 86400 - (cdEv ? Math.max(0, t - cdEv.t) : t));
    const roll = cdEv ? ease.outCubic(clamp((t - cdEv.t) / 0.9)) : 1;
    const secs = Math.floor(total * roll);
    S.countdown = { d: Math.floor(secs / 86400), h: Math.floor(secs / 3600) % 24, m: Math.floor(secs / 60) % 60, s: secs % 60 };
    for (const e of events) if (e.typ === 'kommentare' && t >= e.t && t <= e.t + (e.dauer || 4)) S.kommentare = e;
    for (const e of events) {
      if (e.typ === 'callout' && t >= e.t && t <= e.t + e.dauer) S.callouts.push(e);
      if (e.typ === 'einwohner_holo' && t >= e.t + 0.3 && (!holoOff || t < holoOff.t)) S.plusOnes.push({ t: e.t + 0.35, pos: [e.pos[0], 2.3, e.pos[2]] });
      if (e.typ === 'titel' && t >= e.t) S.titel = e;
      if (e.typ === 'alarm' && t >= e.t) S.alarm = e;
      if (e.typ === 'scan' && t >= e.t) S.scan = e;
      if (e.typ === 'hinweis' && t >= e.t) S.hinweis = e;
      if (e.typ === 'frage' && t >= e.t) S.frage = e;
      if (e.typ === 'endkarte' && t >= e.t) S.endkarte = { kasse: e.kasse ? (TL.ergebnis.stadtkasse ?? base.kasse) : null, waehrung: base.waehrung, t: e.t, tag: TL.ergebnis.tag ?? base.tag, einwohner: TL.ergebnis.einwohner ?? base.einwohner, verbleibend: TL.ergebnis.verbleibende_tage ?? base.verbleibend };
      if (e.typ === 'kommentar_cta' && t >= e.t) S.cta = e;
      if (e.typ === 'simulation_label' && t >= e.t) S.simLabel = { ...e, a: holoOff && t > holoOff.t ? 1 - clamp((t - holoOff.t) / 0.4) : 1 };
      if (e.typ === 'spieler_label' && t >= e.t) S.playerLabel = { a: clamp((t - e.t) / 0.3) };
    }
    S.subtitle = subs.find((s) => t >= s.t0 && t < s.t1) || null;
    S.player = { x: ANKER.figur[0], z: ANKER.figur[2] };
    S.playerHead = [ANKER.figur[0], ANKER.figur[1] + 2.1, ANKER.figur[2]];
    S.playerFeet = [ANKER.figur[0], ANKER.figur[1] + 0.05, ANKER.figur[2]];
    const d = new THREE.Vector3(); camera.getWorldDirection(d);
    S.camPos = camera.position.clone();
    S.cam = { x: camera.position.x, z: camera.position.z, dx: d.x, dz: d.z };
    return S;
  }

  function renderFrame(t) {
    // Kamera
    let shot = shots[0];
    for (const s of shots) if (t >= s.t0) shot = s;
    evalShot(shot, t, camera);
    // Figur
    let act = 'idle', at = 0, yaw = 180, prevYaw = 180; for (const a of figActs) if (t >= a.t) { act = a.aktion; at = a.t; prevYaw = yaw; if (a.richtung !== undefined) yaw = a.richtung; }
    player.pose(t, act, at);
    player.root.rotation.y = THREE.MathUtils.degToRad(prevYaw + (yaw - prevYaw) * ease.inOutSine(clamp((t - at) / 0.01)));
    ring.material.uniforms.uTime.value = t;
    // Einwohner
    crowd.forEach((f, i) => {
      const p = crowdPath(i, t); f.root.position.set(p.x, SLAB, p.z); f.root.rotation.y = p.ry; f.pose(t, p.walk ? 'laufen' : 'idle');
      if (f.arrive !== null) {
        const lt = t - f.arrive; f.root.visible = lt > 0;
        if (lt > 0 && lt < 1.1) { if (!f.holo) f.setHolo(f.holoMat); f.holoMat.uniforms.uTime.value = t; f.holoMat.uniforms.uBase.value = SLAB; f.holoMat.uniforms.uProg.value = clamp(lt / 0.9); f.holoMat.uniforms.uFade.value = 1; }
        else if (lt >= 1.1 && f.holo) f.setNormal();
      }
    });
    for (const o of benannt) {
      o.f.pose(t, o.aktion, o.arrive ?? 0);
      if (o.arrive !== null) {
        const lt = t - o.arrive; o.fx.update(lt, t); o.f.root.visible = lt > 0.1;
        if (lt > 0.1 && lt < 1.2) { if (!o.f.holo) o.f.setHolo(o.mat); o.mat.uniforms.uTime.value = t; o.mat.uniforms.uBase.value = SLAB; o.mat.uniforms.uProg.value = clamp((lt - 0.1) / 0.9); o.mat.uniforms.uFade.value = 1; }
        else if (lt >= 1.2 && o.f.holo) o.f.setNormal();
      }
    }
    for (const b of bauten) {
      const lt = t - b.e.t, d = b.e.dauer || 4;
      b.fx.update(lt, t);
      b.bp.update(lt, lt < d * 0.5 ? 1 : 1 - clamp((lt - d * 0.5) / (d * 0.3)));
      b.grp.visible = lt > d * 0.25;
      const k = ease.outCubic(clamp((lt - d * 0.25) / (d * 0.6)));
      b.grp.scale.set(1, Math.max(0.001, k), 1);
      world.setLotFree(b.e.platz, lt < d * 0.2);
    }
    // Hologramme
    for (const h of holos) {
      const lt = t - h.e.t; h.fx.update(lt, t);
      const off = holoOff && t >= holoOff.t ? clamp((t - holoOff.t) / 0.6) : 0;
      h.f.root.visible = lt > 0.15 && off < 1;
      h.mat.uniforms.uTime.value = t; h.mat.uniforms.uBase.value = SLAB; h.mat.uniforms.uProg.value = clamp((lt - 0.15) / 0.9);
      h.mat.uniforms.uFade.value = (1 - off) * (0.85 + 0.15 * Math.sin(t * 20 + h.e.t));
      if (off > 0) h.fx.g.visible = false;
      h.f.pose(t, 'idle');
    }
    for (const b of blueprints) { const off = holoOff && t >= holoOff.t ? clamp((t - holoOff.t) / 0.6) : 0; b.bp.update(t - b.e.t, 1 - off); }
    // Alarm-Farbstimmung
    const al = events.find((e) => e.typ === 'alarm' && t >= e.t && t <= e.t + e.dauer);
    U.alarm.value = al ? (1 - smooth(al.dauer - 0.5, al.dauer, t - al.t)) * (0.6 + 0.4 * Math.sin((t - al.t) * 10)) : 0;
    world.update(t, camera);
    composer.render();

    // ---- Komposition
    const gl = renderer.domElement;
    g.save();
    g.drawImage(gl, 0, 0, W, H);
    // Glitch
    const gEv = events.find((e) => e.typ === 'glitch' && t >= e.t && t <= e.t + e.dauer);
    const cutG = cuts.find((c) => c.typ === 'glitch' && t >= c.t && t < c.t + 0.3);
    if (gEv || cutG) {
      const r = makeRng(Math.floor(t * 60));
      for (let k = 0; k < 14; k++) { const y = r() * H, h = 10 + r() * 90, dx = (r() - 0.5) * 120; g.drawImage(gl, 0, (y / H) * gl.height, gl.width, (h / H) * gl.height, dx, y, W, h); }
      g.globalCompositeOperation = 'screen'; g.globalAlpha = 0.35; g.drawImage(gl, 0, 0, gl.width, gl.height, 9, 0, W, H); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      g.fillStyle = 'rgba(255,40,60,0.12)'; g.fillRect(0, 0, W, H);
    }
    g.drawImage(vig, 0, 0);
    g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.07; g.drawImage(grains[Math.floor(t * 24) % grains.length], 0, 0, W, H); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    // HUD & Texte
    hud.draw(g, t, state(t));
    // Übergänge
    for (const c of cuts) {
      const d = t - c.t;
      if (c.typ === 'blitz' && d >= -0.04 && d < 0.35) { g.fillStyle = `rgba(255,255,255,${(d < 0 ? 0.6 : 1 - d / 0.35) * 0.85})`; g.fillRect(0, 0, W, H); }
      if (c.typ === 'schwarz' && Math.abs(d) < 0.3) { g.fillStyle = `rgba(0,0,0,${1 - Math.abs(d) / 0.3})`; g.fillRect(0, 0, W, H); }
      if (c.typ === 'schnitt' && d >= 0 && d < 0.12) { g.fillStyle = `rgba(255,255,255,${0.18 * (1 - d / 0.12)})`; g.fillRect(0, 0, W, H); }
    }
    // Ein-/Ausblende Anfang/Ende
    if (t < 0.4) { g.fillStyle = `rgba(0,0,0,${1 - t / 0.4})`; g.fillRect(0, 0, W, H); }
    const endFade = TL.dauer - t; if (endFade < 0.5) { g.fillStyle = `rgba(0,0,0,${1 - Math.max(0, endFade) / 0.5})`; g.fillRect(0, 0, W, H); }
    g.restore();
  }

  window.DEBUG = { scene, camera, THREE };
  window.DAUER = TL.dauer;
  window.renderFrame = (t, q = 0.92) => { renderFrame(t); return out.toDataURL('image/jpeg', q); };
  window.renderOnly = (t) => { renderFrame(t); return true; };
  window.READY = true;
}

init().catch((e) => { console.error(e); window.FEHLER = String(e.stack || e); });
