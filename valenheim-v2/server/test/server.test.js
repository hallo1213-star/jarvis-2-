// Automatische Tests Phase 1: Anmeldung, Wiederherstellung, Einstellungen, Positions-Speicherung, Schummelschutz.
// Startet den echten Server mit PGlite (echte Postgres-Engine im Speicher).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const PORT = 2690 + Math.floor(Math.random() * 100); const BASE = `http://localhost:${PORT}`;
const dir = path.dirname(fileURLToPath(import.meta.url));
let proc;
const api = async (method, url, body, token) => { const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json() }; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function wsConnect(token) {
  return new Promise((ok) => { const ws = new WebSocket(`ws://localhost:${PORT}/ws`); const msgs = []; ws.on('message', (m) => msgs.push(JSON.parse(m))); ws.on('open', () => { ws.send(JSON.stringify({ t: 'hallo', token })); setTimeout(() => ok({ ws, msgs }), 300); }); });
}

before(async () => {
  proc = spawn(process.execPath, [path.join(dir, '../src/index.js')], { env: { ...process.env, PORT: String(PORT), DB_PGLITE: '1', DATABASE_URL: '', REG_LIMIT: '100', ORT_PRUEFUNG: 'aus' }, stdio: ['ignore', 'pipe', 'pipe'] });
  for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/api/status'); return; } catch { await sleep(200); } }
  throw new Error('Server startet nicht');
});
after(() => proc?.kill());

test('Registrieren, Name eindeutig, schwaches Passwort abgelehnt', async () => {
  const a = await api('POST', '/api/auth/register', { name: 'Mohammed', passwort: 'sicher123' });
  assert.equal(a.status, 201); assert.match(a.data.wiederherstellungscode, /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/);
  assert.equal((await api('POST', '/api/auth/register', { name: 'mohammed', passwort: 'sicher123' })).status, 409);
  assert.equal((await api('POST', '/api/auth/register', { name: 'Dean', passwort: 'kurz' })).status, 400);
});

test('Login (falsches/richtiges Passwort) und /api/me', async () => {
  assert.equal((await api('POST', '/api/auth/login', { name: 'Mohammed', passwort: 'falsch123' })).status, 401);
  const l = await api('POST', '/api/auth/login', { name: 'MOHAMMED', passwort: 'sicher123' }); assert.equal(l.status, 200);
  const me = await api('GET', '/api/me', null, l.data.token); assert.equal(me.data.profil.name, 'Mohammed'); assert.equal(me.data.spielstand.settings.grafik, 'auto');
});

test('Einstellungen werden geprüft und gespeichert', async () => {
  const { data } = await api('POST', '/api/auth/login', { name: 'Mohammed', passwort: 'sicher123' });
  const s = await api('PUT', '/api/settings', { grafik: 'hoch', kamera: 'ego', empfindlichkeit: 99, hack: 1 }, data.token);
  assert.deepEqual([s.data.settings.grafik, s.data.settings.kamera, s.data.settings.empfindlichkeit, s.data.settings.hack], ['hoch', 'ego', 3, undefined]);
});

test('Wiederherstellungscode setzt Passwort zurück und beendet alte Sitzungen', async () => {
  const r = await api('POST', '/api/auth/register', { name: 'Lina', passwort: 'passwort1' });
  const alt = r.data.token;
  assert.equal((await api('POST', '/api/auth/recover', { name: 'Lina', code: 'AAAA-AAAA-AAAA-AAAA', passwort: 'neuespasswort' })).status, 401);
  const ok = await api('POST', '/api/auth/recover', { name: 'lina', code: r.data.wiederherstellungscode.toLowerCase(), passwort: 'neuespasswort' });
  assert.equal(ok.status, 200); assert.notEqual(ok.data.wiederherstellungscode, r.data.wiederherstellungscode);
  assert.equal((await api('GET', '/api/me', null, alt)).status, 401);
  assert.equal((await api('POST', '/api/auth/login', { name: 'Lina', passwort: 'neuespasswort' })).status, 200);
});

test('Position: Teleport wird korrigiert, normale Bewegung wird beim Trennen gespeichert', async () => {
  const { data } = await api('POST', '/api/auth/login', { name: 'Mohammed', passwort: 'sicher123' });
  const { ws, msgs } = await wsConnect(data.token);
  assert.equal(msgs[0].t, 'willkommen');
  ws.send(JSON.stringify({ t: 'pos', x: 900, y: 1, z: 900, h: 0 })); await sleep(200);
  assert.ok(msgs.some((m) => m.t === 'korrektur'));
  const start = msgs[0].pos; let x = start.x; for (let i = 0; i < 10; i++) { x += 0.4; ws.send(JSON.stringify({ t: 'pos', x, y: start.y, z: start.z, h: 1 })); await sleep(110); }
  ws.close(); await sleep(400);
  const me = await api('GET', '/api/me', null, data.token);
  assert.ok(Math.abs(me.data.spielstand.pos.x - (start.x + 4)) < 0.01, 'Position gespeichert: ' + JSON.stringify(me.data.spielstand.pos));
});

test('Charakter wird geprüft und gespeichert', async () => {
  const { data } = await api('POST', '/api/auth/login', { name: 'Mohammed', passwort: 'sicher123' });
  const r = await api('PUT', '/api/charakter', { aussehen: { koerper: 'w', frisur: 'zopf', haut: 3, nase: 7, hack: 'x', oberteil: 'raumanzug' }, outfits: [{ name: 'Party<script>', oberteil: 'anzug', haut: 1 }] }, data.token);
  assert.equal(r.status, 200); assert.deepEqual([r.data.charakter.aussehen.koerper, r.data.charakter.aussehen.frisur, r.data.charakter.aussehen.nase, r.data.charakter.aussehen.oberteil, r.data.charakter.aussehen.hack], ['w', 'zopf', 1, undefined, undefined]);
  assert.equal(r.data.charakter.outfits[0].name, 'Partyscript'); assert.equal(r.data.charakter.outfits[0].haut, undefined);
  const me = await api('GET', '/api/me', null, data.token); assert.equal(me.data.spielstand.charakter.aussehen.frisur, 'zopf');
});

test('Phase 4: Server-Liste, gemeinsamer Raum, Positionen anderer, Chat-Filter, Spamschutz', async () => {
  const a = await api('POST', '/api/auth/register', { name: 'Anna4', passwort: 'passwort1' });
  const b = await api('POST', '/api/auth/register', { name: 'Ben4', passwort: 'passwort1' });
  const liste = await api('GET', '/api/server'); assert.equal(liste.data.max, 12); assert.ok(liste.data.server.find((s) => s.id === 'v1'));
  const A = await wsConnect(a.data.token); const B = await wsConnect(b.data.token);
  const wa = A.msgs.find((m) => m.t === 'willkommen'), wb = B.msgs.find((m) => m.t === 'willkommen');
  assert.equal(wa.raum.id, wb.raum.id); assert.ok(wb.andere.some((o) => o.name === 'Anna4'));
  assert.ok(A.msgs.some((m) => m.t === 'neu' && m.name === 'Ben4'));
  B.ws.send(JSON.stringify({ t: 'pos', x: wb.pos.x + 1, y: wb.pos.y, z: wb.pos.z, h: 1 })); await sleep(300);
  assert.ok(A.msgs.some((m) => m.t === 's' && m.p.some((p) => p[0] === wb.andere.find((o) => o.name === 'Anna4') ? true : p[1] === +(wb.pos.x + 1).toFixed(2))));
  B.ws.send(JSON.stringify({ t: 'chat', text: 'Hallo du f1ck www.betrug.de' })); await sleep(250);
  const ch = A.msgs.find((m) => m.t === 'chat'); assert.equal(ch.von, 'Ben4'); assert.equal(ch.text, 'Hallo du **** [Link entfernt]');
  B.ws.send(JSON.stringify({ t: 'chat', text: 'zweite' })); await sleep(150);
  assert.ok(B.msgs.some((m) => m.t === 'chat' && m.system));
  B.ws.close(); await sleep(300); assert.ok(A.msgs.some((m) => m.t === 'weg' && m.name === 'Ben4')); A.ws.close();
});

test('Phase 4: privater Server mit Code, falscher Code abgelehnt', async () => {
  const a = await api('POST', '/api/auth/register', { name: 'Chef4', passwort: 'passwort1' });
  const b = await api('POST', '/api/auth/register', { name: 'Gast4', passwort: 'passwort1' });
  const p = await api('POST', '/api/server/privat', { name: 'Meine Villa' }, a.data.token); assert.match(p.data.code, /^[A-Z2-9]{6}$/);
  assert.equal((await api('GET', '/api/server')).data.server.some((s) => s.name === 'Meine Villa'), false);
  const falsch = await new Promise((ok) => { const ws = new WebSocket(`ws://localhost:${PORT}/ws`); const msgs = []; ws.on('message', (m) => msgs.push(JSON.parse(m))); ws.on('open', () => ws.send(JSON.stringify({ t: 'hallo', token: b.data.token, code: 'ZZZZZZ' }))); ws.on('close', (code) => ok({ code, msgs })); });
  assert.equal(falsch.code, 4010); assert.equal(falsch.msgs[0].t, 'abgelehnt');
  const A = await new Promise((ok) => { const ws = new WebSocket(`ws://localhost:${PORT}/ws`); const msgs = []; ws.on('message', (m) => msgs.push(JSON.parse(m))); ws.on('open', () => { ws.send(JSON.stringify({ t: 'hallo', token: a.data.token, code: p.data.code })); setTimeout(() => ok({ ws, msgs }), 300); }); });
  const B = await new Promise((ok) => { const ws = new WebSocket(`ws://localhost:${PORT}/ws`); const msgs = []; ws.on('message', (m) => msgs.push(JSON.parse(m))); ws.on('open', () => { ws.send(JSON.stringify({ t: 'hallo', token: b.data.token, code: p.data.code.toLowerCase() })); setTimeout(() => ok({ ws, msgs }), 300); }); });
  const w = B.msgs.find((m) => m.t === 'willkommen'); assert.equal(w.raum.privat, true); assert.equal(w.raum.name, 'Meine Villa'); assert.equal(w.andere[0].name, 'Chef4');
  A.ws.close(); B.ws.close();
});

test('Phase 5: Startguthaben, Einzahlen/Abheben ohne Minus, Überweisung an anderen Spieler', async () => {
  const a = (await api('POST', '/api/auth/register', { name: 'Geld5', passwort: 'passwort1' })).data.token;
  await api('POST', '/api/auth/register', { name: 'Ziel5', passwort: 'passwort1' });
  const g = await api('GET', '/api/geld', null, a); assert.deepEqual(g.data.konto, { bargeld: 1500, bank: 25000 });
  assert.equal((await api('POST', '/api/geld/einzahlen', { betrag: 2000 }, a)).status, 400);
  assert.deepEqual((await api('POST', '/api/geld/einzahlen', { betrag: 500 }, a)).data, { bargeld: 1000, bank: 25500 });
  assert.equal((await api('POST', '/api/geld/abheben', { betrag: -5 }, a)).status, 400);
  assert.equal((await api('POST', '/api/geld/abheben', { betrag: 99999 }, a)).status, 400);
  assert.equal((await api('POST', '/api/geld/ueberweisen', { an: 'gibtsnicht', betrag: 10 }, a)).status, 400);
  assert.equal((await api('POST', '/api/geld/ueberweisen', { an: 'Geld5', betrag: 10 }, a)).status, 400);
  const u = await api('POST', '/api/geld/ueberweisen', { an: 'ziel5', betrag: 5500, text: 'Miete' }, a); assert.equal(u.data.bank, 20000);
  const z = await api('POST', '/api/auth/login', { name: 'Ziel5', passwort: 'passwort1' });
  const gz = await api('GET', '/api/geld', null, z.data.token); assert.equal(gz.data.konto.bank, 30500); assert.match(gz.data.verlauf[0].text, /Von Geld5: Miete/);
  // Gleichzeitige Abbuchungen dürfen nie ins Minus führen
  const r = await Promise.all(Array.from({ length: 8 }, () => api('POST', '/api/geld/abheben', { betrag: 5000 }, a)));
  assert.equal(r.filter((x) => x.status === 200).length, 4); assert.equal((await api('GET', '/api/geld', null, a)).data.konto.bank, 0);
});

test('Phase 6: Auto kaufen (Geld geprüft), Kennzeichen, Tuning nur gegen Bezahlung', async () => {
  const t = (await api('POST', '/api/auth/register', { name: 'Fahrer6', passwort: 'passwort1' })).data.token;
  assert.equal((await api('POST', '/api/fahrzeuge/kaufen', { modell: 'super', farbe: 0 }, t)).status, 400);
  assert.equal((await api('POST', '/api/fahrzeuge/kaufen', { modell: 'rakete', farbe: 0 }, t)).status, 400);
  const k = await api('POST', '/api/fahrzeuge/kaufen', { modell: 'kompakt', farbe: 3 }, t); assert.equal(k.status, 200);
  assert.equal(k.data.konto.bank, 7000); assert.match(k.data.fahrzeug.kennzeichen, /^VH-[A-Z]{2} \d{3,4}$/);
  const id = k.data.fahrzeug.id;
  assert.equal((await api('POST', '/api/fahrzeuge/kennzeichen', { id, kennzeichen: 'VH-SS 88' }, t)).status, 400);
  assert.equal((await api('POST', '/api/fahrzeuge/kennzeichen', { id, kennzeichen: 'BLA' }, t)).status, 400);
  const kz = await api('POST', '/api/fahrzeuge/kennzeichen', { id, kennzeichen: 'vh-mo 7' }, t); assert.equal(kz.data.fahrzeug.kennzeichen, 'VH-MO 7'); assert.equal(kz.data.konto.bank, 4500);
  const t2 = (await api('POST', '/api/auth/register', { name: 'Fahrer7', passwort: 'passwort1' })).data.token;
  const k2 = await api('POST', '/api/fahrzeuge/kaufen', { modell: 'kompakt', farbe: 1 }, t2);
  assert.equal((await api('POST', '/api/fahrzeuge/kennzeichen', { id: k2.data.fahrzeug.id, kennzeichen: 'VH-MO 7' }, t2)).status, 400);
  assert.equal((await api('POST', '/api/fahrzeuge/tuning', { id, tuning: { motor: 3 } }, t)).status, 400); // zu teuer
  const tu = await api('POST', '/api/fahrzeuge/tuning', { id, tuning: { felgen: 1, tiefer: 1, motor: 0 } }, t);
  assert.equal(tu.data.summe, 3500); assert.equal(tu.data.konto.bank, 1000); assert.deepEqual(tu.data.fahrzeug.tuning, { felgen: 1, tiefer: 1 });
  assert.equal((await api('POST', '/api/fahrzeuge/tuning', { id: k2.data.fahrzeug.id, tuning: { felgen: 1 } }, t)).status, 400); // fremdes Auto
  assert.equal((await api('GET', '/api/fahrzeuge', null, t)).data.fahrzeuge.length, 1);
});

test('Phase 6: Auto ausparken, schnell fahren nur im eigenen Auto', async () => {
  const t = (await api('POST', '/api/auth/register', { name: 'Raser6', passwort: 'passwort1' })).data.token;
  const fz = (await api('POST', '/api/fahrzeuge/kaufen', { modell: 'kompakt', farbe: 0 }, t)).data.fahrzeug;
  const { ws, msgs } = await wsConnect(t); const w = msgs.find((m) => m.t === 'willkommen'); assert.deepEqual(w.konto, { bargeld: 1500, bank: 7000 });
  const p = w.pos;
  ws.send(JSON.stringify({ t: 'pos', x: p.x + 8, y: p.y, z: p.z, h: 0 })); await sleep(150); // zu Fuß zu schnell
  assert.ok(msgs.some((m) => m.t === 'korrektur'));
  ws.send(JSON.stringify({ t: 'auto_raus', id: fz.id, x: p.x + 3, y: p.y, z: p.z, h: 0 })); await sleep(200);
  assert.ok(msgs.some((m) => m.t === 'auto' && m.auto?.id === fz.id));
  const n = msgs.filter((m) => m.t === 'korrektur').length;
  ws.send(JSON.stringify({ t: 'pos', x: p.x + 3, y: p.y, z: p.z, h: 0, f: 1 })); await sleep(150);
  ws.send(JSON.stringify({ t: 'pos', x: p.x + 9, y: p.y, z: p.z, h: 0, f: 1 })); await sleep(150);
  assert.equal(msgs.filter((m) => m.t === 'korrektur').length, n); ws.close();
});

test('Phase 8: Lieferjob nur an der Firma, Lohn nur am Ziel, Blitz-Lieferung wird abgelehnt', async () => {
  const t = (await api('POST', '/api/auth/register', { name: 'Liefer8', passwort: 'passwort1' })).data.token;
  const { ws, msgs } = await wsConnect(t); const warte = () => sleep(200); const letzte = () => msgs.filter((m) => m.t === 'job').at(-1);
  ws.send(JSON.stringify({ t: 'job_start', firma: 'doener' })); await warte(); assert.match(letzte().fehler, /Michelles Döner/);
  // zur Firma laufen (in kleinen, erlaubten Schritten)
  const { firmaPos } = await import('../../shared/jobs.js'); const K = JSON.parse((await import('node:fs')).readFileSync(new URL('../../shared/katalog.json', import.meta.url)));
  const fp = firmaPos(K.jobs, 'doener'); let p = { ...msgs.find((m) => m.t === 'willkommen').pos };
  const geh = async (zx, zz) => { while (Math.hypot(zx - p.x, zz - p.z) > 0.5) { const d = Math.hypot(zx - p.x, zz - p.z), s = Math.min(1.2, d); p.x += (zx - p.x) / d * s; p.z += (zz - p.z) / d * s; ws.send(JSON.stringify({ t: 'pos', x: p.x, y: p.y, z: p.z, h: 0 })); await sleep(110); } };
  await geh(fp.x, fp.z);
  ws.send(JSON.stringify({ t: 'job_start', firma: 'doener' })); await warte(); const job = letzte().job; assert.ok(job && job.lohn > 120 && job.d > 150, JSON.stringify(letzte()));
  ws.send(JSON.stringify({ t: 'job_liefern' })); await warte(); assert.match(letzte().fehler, /noch nicht/);
  assert.equal(msgs.filter((m) => m.t === 'korrektur').length, 0); ws.close();
});

test('Phase 7: geparktes Auto steht nach dem Neu-Anmelden noch da', async () => {
  const t = (await api('POST', '/api/auth/register', { name: 'Parker7', passwort: 'passwort1' })).data.token;
  const fz = (await api('POST', '/api/fahrzeuge/kaufen', { modell: 'kompakt', farbe: 5 }, t)).data.fahrzeug;
  const A = await wsConnect(t); const p = A.msgs.find((m) => m.t === 'willkommen').pos; assert.equal(A.msgs[0].meinAuto, null);
  A.ws.send(JSON.stringify({ t: 'auto_raus', id: fz.id, x: p.x + 4, y: p.y, z: p.z, h: 1 })); await sleep(200); A.ws.close(); await sleep(400);
  const B = await wsConnect(t); const w = B.msgs.find((m) => m.t === 'willkommen');
  assert.equal(w.meinAuto.id, fz.id); assert.equal(w.meinAuto.x, +(p.x + 4).toFixed(2)); assert.equal(w.meinAuto.kennzeichen, fz.kennzeichen);
  B.ws.send(JSON.stringify({ t: 'auto_weg' })); await sleep(150); B.ws.close(); await sleep(400);
  const C = await wsConnect(t); assert.equal(C.msgs.find((m) => m.t === 'willkommen').meinAuto, null); C.ws.close();
});

test('Phase 8: komplette Lieferung mit dem Auto wird bezahlt (bar)', { timeout: 90_000 }, async () => {
  const t = (await api('POST', '/api/auth/register', { name: 'Kurier8', passwort: 'passwort1' })).data.token;
  const fz = (await api('POST', '/api/fahrzeuge/kaufen', { modell: 'kompakt', farbe: 1 }, t)).data.fahrzeug;
  const { ws, msgs } = await wsConnect(t); const letzte = () => msgs.filter((m) => m.t === 'job').at(-1);
  const { firmaPos } = await import('../../shared/jobs.js'); const K = JSON.parse((await import('node:fs')).readFileSync(new URL('../../shared/katalog.json', import.meta.url)));
  let p = { ...msgs.find((m) => m.t === 'willkommen').pos }; let f = 0;
  const fahr = async (zx, zz, schritt) => { while (Math.hypot(zx - p.x, zz - p.z) > 0.5) { const d = Math.hypot(zx - p.x, zz - p.z), s = Math.min(schritt, d); p.x += (zx - p.x) / d * s; p.z += (zz - p.z) / d * s; ws.send(JSON.stringify({ t: 'pos', x: p.x, y: p.y, z: p.z, h: 0, ...(f ? { f: 1 } : {}) })); await sleep(105); } };
  const fp = firmaPos(K.jobs, 'burger'); await fahr(fp.x, fp.z, 1.2);
  ws.send(JSON.stringify({ t: 'job_start', firma: 'burger' })); await sleep(200); const job = letzte().job; assert.ok(job, JSON.stringify(letzte()));
  ws.send(JSON.stringify({ t: 'auto_raus', id: fz.id, x: p.x + 2, y: p.y, z: p.z, h: 0 })); await sleep(200);
  await fahr(p.x + 2, p.z, 1); f = 1; await fahr(job.ziel.x, job.ziel.z, 3);
  ws.send(JSON.stringify({ t: 'job_liefern' })); await sleep(300);
  const r = letzte(); assert.equal(r.lohn, job.lohn, JSON.stringify(r)); assert.equal(r.job, null);
  const geld = msgs.filter((m) => m.t === 'geld').at(-1); assert.equal(geld.konto.bargeld, 1500 + r.lohn + r.bonus);
  assert.equal(msgs.filter((m) => m.t === 'korrektur').length, 0); ws.close();
});
