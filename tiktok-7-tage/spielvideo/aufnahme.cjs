// Spielvideo VALENHEIM 2.0: nimmt eine Einstellung Bild für Bild aus dem echten Spiel auf (feste 24 fps).
// Aufruf: DB_PATH=... node aufnahme.cjs <einstellung>   (Server muss lokal laufen)
const { chromium } = require('playwright');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs'); const path = require('node:path');
const B = process.env.URL || 'http://localhost:2600'; const FPS = 24;
const laengen = JSON.parse(fs.readFileSync(path.join(__dirname, 'build/laengen.json')));
// Dauer je Einstellung = Sprechzeit + Luft
const DAUER = { intro: laengen.intro + 0.9, strasse: laengen.strasse + 0.8, leute: laengen.leute + 0.8, autohaus: laengen.autohaus + 0.9, fahren: 3.6, leben: laengen.leben + 0.8, nacht: laengen.nacht + 1.0, ende: laengen.ende + 1.4 };
const START = { intro: [7, -6], strasse: [-30, 26.5], leute: [30, 25.5], autohaus: [80, -70], fahren: [37.5, -40], leben: [10, 20], nacht: [-33, 26.5], ende: [7, 22] };

const name = process.argv[2]; if (!DAUER[name]) { console.log('Unbekannt:', name); process.exit(1); }
(async () => {
  const user = 'Video' + name.slice(0, 5) + Math.floor(Math.random() * 1e4);
  const r = await (await fetch(B + '/api/auth/register', { method: 'POST', body: JSON.stringify({ name: user, passwort: 'geheim123' }) })).json();
  const H = { Authorization: 'Bearer ' + r.token };
  await fetch(B + '/api/charakter', { method: 'PUT', headers: H, body: JSON.stringify({ aussehen: { koerper: 'm', haut: 3, haarfarbe: 1, oberteil: 'jacke', oberteilFarbe: 0, hose: 'jeans', hoseFarbe: 4, schuhe: 'sneaker', schuheFarbe: 1, groesse: 1 } }) });
  await fetch(B + '/api/settings', { method: 'PUT', headers: H, body: JSON.stringify({ grafik: 'hoch', kamera: 'verfolger' }) });
  await fetch(B + '/api/me', { headers: H }); await fetch(B + '/api/geld', { headers: H });
  const db = new DatabaseSync(process.env.DB_PATH); db.exec('PRAGMA busy_timeout = 20000'); const p = db.prepare('SELECT id FROM v2_players WHERE username = ?').get(user);
  const [sx, sz] = START[name];
  db.prepare('UPDATE v2_saves SET pos = ? WHERE player_id = ?').run(JSON.stringify({ x: sx, y: 1.4, z: sz, h: 0, welt: 'valenheim' }), p.id);
  db.prepare('UPDATE v2_konten SET bank = 900000 WHERE player_id = ?').run(p.id); db.close();

  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const c = await b.newContext({ viewport: { width: 720, height: 1280 } });
  await c.addInitScript((t) => { localStorage.setItem('vh2_token', t); localStorage.setItem('vh2_leistung', JSON.stringify({ empfehlung: 'hoch', t: Date.now() })); }, r.token);
  const pg = await c.newPage(); pg.on('pageerror', (e) => console.log('FEHLER', String(e)));
  await pg.goto(B + '/#/spielen');
  await pg.waitForFunction(() => window.VH2?.raum && window.VH2.passanten && window.VH2.scene.environment, null, { timeout: 600000 });
  // Spiel anhalten – ab jetzt bestimmen wir jeden Schritt (feste Zeit pro Bild)
  await pg.evaluate((fps) => {
    const g = VH2; g.renderer.setAnimationLoop(null); g.timer = { update() {}, getDelta() { return 1 / fps; } };
    window.__hud = (an) => document.querySelectorAll('.hud,.minikarte,.hilfe,.knopf,.chat,.aktion,.tacho,.emotes,.toast,.auftrag').forEach((e) => { e.style.visibility = an ? '' : 'hidden'; });
    window.__hud(false);
  }, FPS);

  // ---------- Einstellungen ----------
  await pg.evaluate((name) => {
    const g = VH2; const T = window; const V = g.verkehr; const PI = Math.PI;
    const lerp = (a, b, k) => a + (b - a) * k; const ease = (k) => k * k * (3 - 2 * k);
    const kam = (x, y, z, lx, ly, lz) => { g.camera.position.set(x, y, z); g.camera.lookAt(lx, ly, lz); };
    const verkehrHier = (liste) => liste.forEach(([i, j, d, t], n) => { const a = V.autos[n]; a.i = i; a.j = j; a.d = d; V.neuesStueck(a, true); a.t = t; a.tempo = 9; });
    const leuteHier = (cx, cz) => g.passanten.leute.forEach((p) => g.passanten.platziere(p, cx, cz, 0));
    g.tageszeit.manuell = 12.2; g.wetter.manuell = 'klar'; g.camera.fov = 58; g.camera.updateProjectionMatrix();
    T.__dauer = 0;
    if (name === 'intro') { // Luftaufnahme: Kreis über dem Stadtplatz, langsam herunter
      g.tageszeit.manuell = 9.8; leuteHier(0, 0);
      g.kameraHook = (gg) => { const k = ease(Math.min(1, gg.t / T.__len)); const a = 0.6 + k * 0.9; const r = lerp(210, 120, k), h = lerp(140, 55, k); kam(Math.cos(a) * r, h, Math.sin(a) * r, 0, 4, 0); };
    }
    if (name === 'strasse') { // Spieler läuft den Gehweg entlang, Kamera fährt seitlich mit
      g.heading = PI / 2; g.input.keys.add('KeyW'); g.yaw = g.heading + PI; leuteHier(-30, 26);
      g.kameraHook = (gg) => { const p = gg.figur.root.position; kam(p.x - 2.6, p.y + 1.25, p.z - 3.4, p.x + 3, p.y + 1.0, p.z + 0.5); };
    }
    if (name === 'leute') { // Straßenecke: Verkehr fährt vorbei, Passanten laufen
      verkehrHier([[0, 0, 0, 0.0], [1, 0, 2, 0.25], [-1, 0, 0, 0.5], [0, -1, 1, 0.1], [0, 1, 3, 0.4]]); leuteHier(37, 0);
      g.figur.root.visible = false; g.kameraHook = (gg) => { gg.figur.root.visible = false; const k = gg.t / T.__len; kam(lerp(26, 30, k), 1.7, 28.5, 50, 1.0, 37); };
    }
    if (name === 'autohaus') { // Showroom: Kamera fährt um den Phantom R
      g.tageszeit.manuell = 15.5; g.heading = -PI / 2;
      g.kameraHook = (gg) => { gg.figur.root.visible = false; const a = gg.autohaus; const z = a?.pos; if (!z) return; const k = gg.t / T.__len; const w = -0.4 + k * 1.6; kam(z.x + Math.sin(w) * 6.5, 1.5 + k * 0.6, z.z + Math.cos(w) * 6.5, z.x, 0.6, z.z); };
    }
    if (name === 'fahren') { // Fahrt auf der Straße, Verfolgerkamera tief
      g.tageszeit.manuell = 17.6; verkehrHier([[0, -1, 1, 0.55], [0, 0, 1, 0.3]]);
      g.kameraHook = (gg) => { const a = gg.meinAuto; if (!a) return; const h = a.heading; kam(a.pos.x - Math.sin(h) * 7.2 + Math.cos(h) * 1.2, a.pos.y + 1.7, a.pos.z - Math.cos(h) * 7.2 - Math.sin(h) * 1.2, a.pos.x + Math.sin(h) * 6, a.pos.y + 0.8, a.pos.z + Math.cos(h) * 6); };
    }
    if (name === 'leben') { // Spieler tanzt, HUD + Minikarte sichtbar, dann Handy
      g.tageszeit.manuell = 13; leuteHier(7, 20); T.__hud(true); g.yaw = g.heading; g.pitch = 0.12; g.abstand = 3.6; g.figur.zeige('tanzen');
    }
    if (name === 'nacht') { // Nacht, Regen, Laternen, Autos mit Licht
      g.tageszeit.manuell = 22.5; g.wetter.manuell = 'gewitter'; verkehrHier([[-1, 0, 1, 0.2], [-1, 0, 3, 0.5]]); leuteHier(-33, 26);
      g.kameraHook = (gg) => { gg.figur.root.visible = false; const k = gg.t / T.__len; kam(-33 + k * 6, 2.2, 14, -37, 2, 60); };
    }
    if (name === 'ende') { // Abendlicht, Kamera steigt über die Stadt
      g.tageszeit.manuell = 19.3; leuteHier(7, 22);
      g.kameraHook = (gg) => { const k = ease(Math.min(1, gg.t / T.__len)); kam(lerp(18, 60, k), lerp(4, 120, k), lerp(40, 160, k), 0, lerp(3, 10, k), lerp(10, -60, k)); };
    }
  }, name);
  await pg.evaluate((d) => { window.__len = d; VH2.t = 0; }, DAUER[name]);

  // Autohaus / Fahren: Phantom R kaufen und bereitstellen
  if (name === 'autohaus' || name === 'fahren') {
    await pg.evaluate(async () => {
      const g = VH2; const tok = localStorage.getItem('vh2_token');
      const r = await (await fetch('/api/fahrzeuge/kaufen', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ modell: 'super', farbe: 3 }) })).json();
      if (!r.fahrzeug) throw new Error('Kauf: ' + JSON.stringify(r));
      g.autoHolen({ ...r.fahrzeug, tuning: { felgen: 3, tiefer: 1, toenung: 1 } }); g.autohaus = g.meinAuto;
    });
    if (name === 'fahren') await pg.evaluate(() => { const g = VH2, a = g.meinAuto; a.body.setTranslation({ x: 37.5 - 2.6, y: 1.0, z: -40 }, true); a.pos.set(37.5 - 2.6, 0.22, -40); a.heading = 0; a.setzeDrehung(); g.einsteigen(); g.input.keys.add('KeyW'); });
  }
  // kurz einschwingen (Texturen, Licht) ohne Aufnahme
  for (let i = 0; i < 12; i++) await pg.evaluate(() => VH2.loop());
  await pg.evaluate(() => { VH2.t = 0; });
  const out = path.join(__dirname, 'build', 'bilder', name); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  const N = Math.round(DAUER[name] * FPS); const t0 = Date.now();
  for (let f = 0; f < N; f++) {
    await pg.evaluate((f) => {
      const g = VH2;
      if (window.__hud && g.kameraHook) window.__hud(false);
      if (f === Math.round(window.__len * 24 * 0.55) && !g.kameraHook && g.figur.emote) { g.onOeffne?.('handy'); }
      g.loop();
    }, f);
    await pg.screenshot({ path: path.join(out, String(f).padStart(4, '0') + '.jpg'), type: 'jpeg', quality: 92, timeout: 300000 });
    if (f % 24 === 0) console.log(name, f, '/', N, Math.round((Date.now() - t0) / 1000) + 's');
  }
  console.log('FERTIG', name, N); await b.close();
})().catch((e) => { console.error('ABBRUCH', name, e.message); process.exit(1); });
