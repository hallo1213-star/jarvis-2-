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
  proc = spawn(process.execPath, [path.join(dir, '../src/index.js')], { env: { ...process.env, PORT: String(PORT), DB_PGLITE: '1', DATABASE_URL: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
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
