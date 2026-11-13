// DEMO-MODUS (Einzelspieler ohne Server): ersetzt API und WebSocket durch eine lokale Nachbildung.
// Wird nur im Demo-Build verwendet (vite build --mode demo). Punkte zählen hier nur lokal.
export const DEMO = import.meta.env.MODE === 'demo';

const PLACES = {
  tafel_rathaus: { name: 'Missionstafel Rathausplatz', x: -9, z: 13 },
  tafel_bahnhof: { name: 'Missionstafel Bahnhof', x: -214, z: -14 },
  tafel_krankenhaus: { name: 'Missionstafel Krankenhaus', x: 188, z: -49 },
  rathaus: { name: 'Rathaus', x: 0, z: -5 }, brunnen: { name: 'Brunnen am Rathausplatz', x: 0, z: 16 },
  krankenhaus: { name: 'Krankenhaus – Haupteingang', x: 157, z: -60 }, notaufnahme: { name: 'Krankenhaus – Notaufnahme', x: 140, z: -49 },
  rettung: { name: 'Rettungsstation', x: 228, z: -64 }, bahnhof: { name: 'Hauptbahnhof – Vorplatz', x: -224, z: 0 },
  bahnsteig: { name: 'Bahnsteig Gleis 1/2', x: -302, z: 4 }, lager: { name: 'Versorgungslager', x: -174, z: 159 },
  park: { name: 'Stadtpark', x: 80, z: 160 }, teich: { name: 'Teich im Stadtpark', x: 96, z: 133 },
  militaer_tor: { name: 'Tor zum Militärgelände', x: -40, z: -194 }, industrie: { name: 'Industriegebiet – Tanklager', x: -158, z: 262 },
};
const BOARDS = ['tafel_rathaus', 'tafel_bahnhof', 'tafel_krankenhaus'];
const EVAC_SPAWNS = [[120, 232], [200, 170], [40, 250], [-40, 238], [160, 200], [280, 248], [120, 172], [200, 120]];
const MISSIONS = [
  ['erk_rundgang', 'erkundung', 'Stadtrundgang', 'Besuche drei Orte in Valenheim und melde, dass dort alles in Ordnung ist.', 75, { anzahl: 3 }],
  ['vers_rathaus', 'versorgung', 'Lebensmittel für die Ausgabestelle', 'Hole eine Kiste Lebensmittel im Versorgungslager und bringe sie zum Rathaus.', 100, { von: 'lager', nach: 'rathaus' }],
  ['vers_krankenhaus', 'versorgung', 'Hilfsgüter fürs Krankenhaus', 'Bringe Hilfsgüter aus dem Versorgungslager zum Krankenhaus.', 100, { von: 'lager', nach: 'krankenhaus' }],
  ['verw_aushang', 'verwaltung', 'Offizielle Aushänge verteilen', 'Hole die neuen Sicherheitshinweise im Rathaus ab und hänge sie an drei Orten aus.', 100, { anzahl: 3 }],
  ['med_bahnhof', 'medizin', 'Medikamente vom Bahnhof', 'Eine Lieferung Medikamente ist am Bahnsteig angekommen. Bringe sie schnell in die Notaufnahme.', 150, { von: 'bahnsteig', nach: 'notaufnahme', zeit: 300 }],
  ['med_rettung', 'medizin', 'Verbandsmaterial für den Rettungsdienst', 'Hole Verbandsmaterial im Krankenhaus und bringe es zur Rettungsstation.', 150, { von: 'krankenhaus', nach: 'rettung', zeit: 180 }],
  ['evak_wohnviertel', 'evakuierung', 'Evakuierung im Wohnviertel', 'Drei Einwohner brauchen Hilfe. Führe sie sicher zur nächsten Sammelstelle.', 200, { anzahl: 3 }],
].map(([id, typ, titel, beschreibung, punkte, params]) => ({ id, typ, titel, beschreibung, punkte, params }));

// ---------- Lokales Profil ----------
let mem = null;
const load = () => { if (mem) return mem; try { mem = JSON.parse(localStorage.getItem('vh_demo') || 'null'); } catch { mem = null; } return mem; };
const save = () => { try { localStorage.setItem('vh_demo', JSON.stringify(mem)); } catch { /* Speicher nicht verfügbar */ } };
const levelFor = (p) => { let l = 1; while (p >= 125 * (l + 1) * l) l++; return l; };
const ERFOLGE = [['erster', '🎖️', 'Erster Einsatz', 'Die erste Mission erledigt', (p) => p.missions >= 1], ['helfer', '🤝', 'Helfer', '10 Missionen erledigt', (p) => p.missions >= 10],
  ['erkunder', '🧭', 'Erkunder', '5 Erkundungen', (p) => (p.typen.erkundung || 0) >= 5], ['versorger', '📦', 'Versorger', '5 Versorgungsmissionen', (p) => (p.typen.versorgung || 0) >= 5],
  ['sanitaeter', '🩺', 'Sanitäter', '5 medizinische Hilfsmissionen', (p) => (p.typen.medizin || 0) >= 5], ['retter', '🚸', 'Lebensretter', '5 Evakuierungen', (p) => (p.typen.evakuierung || 0) >= 5]];
function profil() {
  const p = load(); if (!p) return null;
  return { id: 'demo', name: p.name, points: p.points, level: levelFor(p.points), missions: p.missions, playtime_s: Math.round(p.playtime_s), created_at: p.created_at, look: p.look, rang: 1, gesperrt: false, eigenes: true,
    erfolge: ERFOLGE.map(([id, icon, titel, text, f]) => ({ id, icon, titel, text, erreicht: f(p) })), letzte: p.letzte.slice(0, 10), typen: p.typen };
}

// ---------- Lokale API ----------
export async function localApi(method, url, body) {
  const err = (status, fehler) => { const e = new Error(fehler); e.status = status; throw e; };
  if (url === '/api/status') return { ok: true, buerger: load() ? 1 : 0, online: 0, demo: true };
  if (url === '/api/register') {
    const name = String(body?.name || '').trim();
    if (name.length < 3 || name.length > 16 || !/^[A-Za-z0-9ÄÖÜäöüß_.\-]+$/.test(name)) err(400, 'Name: 3–16 Zeichen, Buchstaben/Ziffern/_ . -');
    mem = { name, look: body.look || {}, points: 0, missions: 0, playtime_s: 0, created_at: Date.now(), typen: {}, letzte: [] }; save();
    return { token: 'demo', profil: profil() };
  }
  if (url === '/api/me' || url.startsWith('/api/profil')) { const p = profil(); if (!p) err(401, 'Nicht angemeldet.'); return { profil: p }; }
  if (url === '/api/rangliste') { const p = profil(); return { liste: p ? [{ platz: 1, name: p.name, points: p.points, level: p.level, missions: p.missions }] : [], buerger: p ? 1 : 0, stand: Date.now() }; }
  if (url.startsWith('/api/admin/status')) return { eingerichtet: false };
  err(503, 'In der Demo-Version nicht verfügbar – das Bürgermeister-Dashboard gibt es in der Online-Version.');
}

// ---------- Lokaler „Server“ für Multiplayer-Nachrichten und Missionen ----------
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const pick = (arr, n) => [...arr].sort(() => Math.random() - 0.5).slice(0, n);

export class LocalSocket {
  constructor() {
    this.readyState = 0; this.c = { x: 0, z: 21, trail: [], mission: null, cooldown: 0 }; this.joined = Date.now();
    setTimeout(() => { this.readyState = 1; this.onopen?.(); }, 50);
    this.tick = setInterval(() => this.update(), 200);
  }
  emit(m) { setTimeout(() => this.onmessage?.({ data: JSON.stringify(m) }), 0); }
  close() { clearInterval(this.tick); this.readyState = 3; const p = load(); if (p) { p.playtime_s += (Date.now() - this.joined) / 1000; save(); } }
  send(raw) {
    const m = JSON.parse(raw); const c = this.c; const now = Date.now();
    if (m.t === 'hello') { this.emit({ t: 'welcome', welt: {}, you: 'demo', room: 'Valenheim (Demo)', players: [], online: 1 }); this.emit({ t: 'world', places: PLACES, boards: BOARDS }); return; }
    if (m.t === 'ping') return this.emit({ t: 'pong', ts: m.ts, now });
    if (m.t === 'emote') return this.emit({ t: 'emote', id: 'demo', k: m.k });
    if (m.t === 'in') {
      const d = Math.hypot(m.x - c.x, m.z - c.z); c.x = m.x; c.z = m.z;
      const last = c.trail[c.trail.length - 1]; if (!last || Math.hypot(c.x - last.x, c.z - last.z) > 0.8) { c.trail.push({ x: c.x, z: c.z }); if (c.trail.length > 60) c.trail.shift(); }
      const t = c.mission?.targets[c.mission.idx];
      if (t?.mode === 'visit' && dist(PLACES[t.key], c) <= 7) { c.mission.idx++; if (c.mission.idx >= c.mission.targets.length) return this.finish(); this.emit({ t: 'm_info', text: `${PLACES[t.key].name}: alles in Ordnung ✓` }); this.state(); }
      return d;
    }
    const nearBoard = BOARDS.some((k) => dist(PLACES[k], c) <= 5.5);
    if (m.t === 'm_list' || (m.t === 'act' && !c.mission)) { if (!nearBoard) return; return this.emit({ t: 'm_list', list: MISSIONS.map((x) => ({ ...x, zeit: x.params.zeit || null })), cooldown: Math.max(0, c.cooldown - now) }); }
    if (m.t === 'm_abort') { c.mission = null; return this.emit({ t: 'm_state', m: null }); }
    if (m.t === 'm_accept') {
      if (c.mission || !nearBoard) return; if (now < c.cooldown) return this.emit({ t: 'm_info', text: `Kurze Pause: neue Mission in ${Math.ceil((c.cooldown - now) / 1000)} s.` });
      const def = MISSIONS.find((x) => x.id === m.id); if (!def) return; c.mission = this.start(def); c.trail = [{ x: c.x, z: c.z }]; return this.state();
    }
    if (m.t === 'act' && c.mission) {
      const ms = c.mission; const t = ms.targets[ms.idx]; if (!t || !['pickup', 'deliver', 'notice'].includes(t.mode)) return;
      if (dist(PLACES[t.key], c) > 4.5) return this.emit({ t: 'm_info', text: 'Du bist noch nicht am Ziel.' });
      if (t.mode === 'pickup') { ms.carrying = true; this.emit({ t: 'm_info', text: ms.def.typ === 'verwaltung' ? 'Aushänge eingepackt.' : 'Aufgenommen! Mit Ladung kannst du nur gehen.' }); }
      if (t.mode === 'notice') this.emit({ t: 'm_info', text: `Aushang hängt (${ms.idx}/${ms.targets.length - 1}).` });
      if (t.mode === 'deliver') ms.carrying = false;
      ms.idx++; if (ms.idx >= ms.targets.length) return this.finish(); this.state();
    }
  }
  start(def) {
    const p = def.params; const ms = { def, idx: 0, startedAt: Date.now(), carrying: false, saved: 0, npcs: [], deadline: p.zeit ? Date.now() + p.zeit * 1000 : null };
    const c = this.c;
    if (def.typ === 'erkundung') { ms.targets = pick(['rathaus', 'brunnen', 'krankenhaus', 'rettung', 'bahnhof', 'bahnsteig', 'park', 'teich', 'militaer_tor', 'lager', 'industrie'].filter((k) => dist(PLACES[k], c) > 25), p.anzahl).map((key) => ({ key, mode: 'visit' })); ms.text = () => `Gehe zu: ${PLACES[ms.targets[ms.idx].key].name}`; }
    else if (def.typ === 'versorgung' || def.typ === 'medizin') { ms.targets = [{ key: p.von, mode: 'pickup' }, { key: p.nach, mode: 'deliver' }]; const w = def.typ === 'medizin' ? 'die Medikamente' : 'die Kiste'; ms.text = () => (ms.idx === 0 ? `Hole ${w}: ${PLACES[p.von].name}` : `Bringe ${w} zu: ${PLACES[p.nach].name}`); }
    else if (def.typ === 'verwaltung') { ms.targets = [{ key: 'rathaus', mode: 'pickup' }, ...pick(['bahnhof', 'krankenhaus', 'park', 'rettung', 'brunnen', 'lager'], p.anzahl).map((key) => ({ key, mode: 'notice' }))]; ms.text = () => (ms.idx === 0 ? 'Hole die Aushänge im Rathaus ab' : `Hänge den Aushang aus: ${PLACES[ms.targets[ms.idx].key].name}`); }
    else {
      const [sx, sz] = EVAC_SPAWNS[Math.floor(Math.random() * EVAC_SPAWNS.length)]; const goal = Math.hypot(80 - sx, 160 - sz) < Math.hypot(-224 - sx, sz) ? 'park' : 'bahnhof';
      for (let i = 0; i < p.anzahl; i++) ms.npcs.push({ id: 'n' + i + Date.now(), x: sx + (i - 1) * 1.6, z: sz + (i % 2) * 1.2, h: 0, v: 0, state: 'wartet', slot: i, look: { jacke: (i * 5 + 3) % 12, hose: (i * 3) % 12, haut: i % 6, haare: (i * 2) % 8 } });
      ms.targets = [{ key: '_evac', mode: 'evac' }, { key: goal, mode: 'evac_goal' }]; ms.spawn = { x: sx, z: sz };
      ms.text = () => (ms.idx === 0 ? 'Finde die Einwohner im Wohnviertel (Markierung)' : `Führe die Einwohner zur Sammelstelle: ${PLACES[goal].name} (${ms.saved}/${ms.npcs.length} in Sicherheit)`);
    }
    return ms;
  }
  state() {
    const ms = this.c.mission; const t = ms.targets[ms.idx]; let ziel = t && PLACES[t.key] ? { key: t.key, name: PLACES[t.key].name, x: PLACES[t.key].x, z: PLACES[t.key].z } : null;
    if (ms.def.typ === 'evakuierung' && ms.idx === 0) ziel = { key: '_evac', name: 'Einwohner in Not', x: ms.spawn.x, z: ms.spawn.z };
    this.emit({ t: 'm_state', m: { id: ms.def.id, typ: ms.def.typ, titel: ms.def.titel, punkte: ms.def.punkte, text: ms.text(), ziel, schritt: ms.idx + 1, schritte: ms.targets.length, tragen: ms.carrying, gerettet: ms.saved, deadline: ms.deadline } });
  }
  finish() {
    const ms = this.c.mission; this.c.mission = null; this.c.cooldown = Date.now() + 10000;
    const p = load(); p.points += ms.def.punkte; p.missions += 1; p.typen[ms.def.typ] = (p.typen[ms.def.typ] || 0) + 1; p.letzte.unshift({ titel: ms.def.titel, punkte: ms.def.punkte, at: Date.now() }); p.letzte = p.letzte.slice(0, 20); save();
    this.emit({ t: 'm_done', titel: ms.def.titel, punkte: ms.def.punkte, profil: profil() });
    this.emit({ t: 'npc', l: [] });
  }
  update() {
    const c = this.c; const ms = c.mission; if (!ms) return;
    if (ms.deadline && Date.now() > ms.deadline) { c.mission = null; return this.emit({ t: 'm_fail', grund: 'Die Zeit ist abgelaufen.' }); }
    if (ms.def.typ !== 'evakuierung') return;
    const goal = PLACES[ms.targets[1].key];
    for (const n of ms.npcs) {
      if (n.state === 'sicher') continue;
      if (n.state === 'wartet' && dist(n, c) < 5) { n.state = 'folgt'; if (ms.idx === 0) { ms.idx = 1; this.emit({ t: 'm_info', text: 'Die Einwohner folgen dir. Führe sie zur Sammelstelle!' }); this.state(); } }
      if (n.state === 'folgt') {
        const tr = c.trail; const tg = tr[Math.max(0, tr.length - 3 - n.slot * 2)] || c; const dx = tg.x - n.x, dz = tg.z - n.z, d = Math.hypot(dx, dz);
        const sp = Math.min(8, d * 2.2); n.v = d > 0.3 ? sp : 0; if (d > 0.3) { n.x += (dx / d) * sp * 0.2; n.z += (dz / d) * sp * 0.2; n.h = Math.atan2(dx, dz); }
        if (dist(n, c) > 30) { n.state = 'wartet'; this.emit({ t: 'm_info', text: 'Ein Einwohner hat dich verloren – gehe zurück!' }); }
        if (dist(n, goal) < 8) { n.state = 'sicher'; ms.saved++; this.emit({ t: 'm_info', text: `Einwohner in Sicherheit (${ms.saved}/${ms.npcs.length})` }); this.state(); }
      }
    }
    if (ms.saved >= ms.npcs.length) return this.finish();
    this.emit({ t: 'npc', l: ms.npcs.filter((n) => n.state !== 'sicher').map((n) => [n.id, n.x, n.z, n.h, n.v, n.look]) });
  }
}
