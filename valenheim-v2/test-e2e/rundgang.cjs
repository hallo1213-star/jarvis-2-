// Browser-Rundgang (Phase 12): Konto → Charakter → Spiel → Autohaus → Auto kaufen → fahren → Werkstatt → Lieferjob → Emote → Handy
// Start: Server lokal mit SQLite (DB_PATH=/tmp/vh2.db npm start), dann:  DB_PATH=/tmp/vh2.db node test-e2e/rundgang.cjs
// Benötigt Playwright (Chromium). Bilder landen in test-e2e/bilder/.
const { chromium } = require('playwright');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs'); const path = require('node:path');
const B = process.env.URL || 'http://localhost:2600'; const OUT = path.join(__dirname, 'bilder'); fs.mkdirSync(OUT, { recursive: true });
const klick = (pg, sel) => pg.click(sel, { force: true, timeout: 120000 }); // langsame Testrechner: nicht auf „ruhige“ Animation warten
const ok = (c, t) => { console.log(c ? '✓' : '✗', t); if (!c) process.exitCode = 1; };
(async () => {
  const name = 'Test' + Math.floor(Math.random() * 1e5);
  const r = await (await fetch(B + '/api/auth/register', { method: 'POST', body: JSON.stringify({ name, passwort: 'geheim123' }) })).json(); ok(r.token, 'Konto erstellt');
  const ch = await fetch(B + '/api/charakter', { method: 'PUT', headers: { Authorization: 'Bearer ' + r.token }, body: JSON.stringify({ aussehen: { koerper: 'm' } }) }); ok(ch.ok, 'Charakter gespeichert');
  await fetch(B + '/api/me', { headers: { Authorization: 'Bearer ' + r.token } });
  if (process.env.DB_PATH) { const db = new DatabaseSync(process.env.DB_PATH); const p = db.prepare('SELECT id FROM v2_players WHERE username = ?').get(name); db.prepare('UPDATE v2_saves SET pos = ? WHERE player_id = ?').run(JSON.stringify({ x: 83.5, y: 1.3, z: -74, h: -Math.PI / 2, welt: 'valenheim' }), p.id); db.close(); }
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const c = await b.newContext({ viewport: { width: 1100, height: 680 } });
  await c.addInitScript((t) => { localStorage.setItem('vh2_token', t); localStorage.setItem('vh2_leistung', JSON.stringify({ empfehlung: 'niedrig', t: Date.now() })); }, r.token);
  const pg = await c.newPage(); const fehler = []; pg.on('pageerror', (e) => fehler.push(String(e)));
  await pg.goto(B + '/#/spielen'); await pg.waitForFunction(() => window.VH2?.raum, null, { timeout: 300000 }); ok(true, 'Spiel geladen, Server: ' + await pg.evaluate(() => VH2.raum.name));
  ok(await pg.evaluate(() => VH2.verkehr.autos.length > 0 && VH2.passanten.leute.length > 0), 'Verkehr + Passanten');
  if (process.env.DB_PATH) {
    await pg.evaluate(() => VH2.onOeffne('autohaus')); await pg.waitForSelector('.laden', { timeout: 180000 }); await klick(pg, '.modell:has-text("Valen Spark")'); await klick(pg, 'text=KAUFEN'); await pg.waitForTimeout(1500);
    ok(await pg.evaluate(() => !!VH2.meinAuto && VH2.konto.bank === 7000), 'Auto gekauft (18.000 € abgebucht)');
    await pg.evaluate(() => VH2.einsteigen()); await pg.keyboard.down('KeyW'); await pg.waitForTimeout(2500); await pg.keyboard.up('KeyW');
    ok(await pg.evaluate(() => VH2.faehrt && VH2.meinAuto.kmh() > 5), 'Fahren'); await pg.screenshot({ path: path.join(OUT, 'fahren.png'), timeout: 180000 });
    await pg.keyboard.down('Space'); await pg.waitForTimeout(1500); await pg.keyboard.up('Space'); await pg.keyboard.press('KeyE'); await pg.waitForTimeout(300); ok(await pg.evaluate(() => !VH2.faehrt), 'Aussteigen');
    await pg.evaluate(() => VH2.onOeffne('werkstatt')); await pg.waitForSelector('.laden', { timeout: 180000 }); await klick(pg, '.cfeld:has-text("Unterbodenlicht") button:has-text("Blau")'); await klick(pg, 'text=BEZAHLEN'); await pg.waitForTimeout(800);
    ok((await pg.locator('.laden [role=status]').allInnerTexts()).some((t) => t.includes('bezahlt')), 'Tuning bezahlt'); await pg.keyboard.press('Escape');
  }
  await pg.evaluate(() => VH2.emote('jubeln')); ok(await pg.evaluate(() => VH2.figur.emote?.art === 'jubeln'), 'Emote');
  await pg.keyboard.press('KeyH'); await klick(pg, 'text=Regierung'); ok(await pg.locator('text=Finanzministerium').count() > 0, 'Handy: Regierung'); await pg.screenshot({ path: path.join(OUT, 'handy.png'), timeout: 180000 });
  ok(fehler.length === 0, 'keine JavaScript-Fehler ' + (fehler[0] || ''));
  await b.close();
})();
