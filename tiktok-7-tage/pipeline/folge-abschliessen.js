#!/usr/bin/env node
// Nach Veröffentlichung einer Folge: Ergebnis der Folge in den Serienstand übernehmen.
//   node pipeline/folge-abschliessen.js 1 [--einwohner 1234]
// --einwohner überschreibt die Einwohnerzahl mit der echten Follower-Zunahme (1 Follower = 1 Einwohner).
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const nr = parseInt(args[0], 10); if (!nr) { console.error('Folgennummer fehlt'); process.exit(1); }
const opt = (k) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : undefined; };
const pad = String(nr).padStart(2, '0');
const statusPath = path.join(ROOT, 'serie', 'stadt-status.json');
const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
const ep = JSON.parse(fs.readFileSync(path.join(ROOT, 'folgen', `folge-${pad}.json`), 'utf8'));
if (status.letzte_folge >= nr) { console.error(`Folge ${nr} ist bereits abgeschlossen (letzte_folge = ${status.letzte_folge}).`); process.exit(1); }
const e = ep.ergebnis || {};
for (const k of ['tag', 'verbleibende_tage', 'einwohner', 'stadtkasse', 'entwicklung_prozent', 'entwicklung_stufe']) if (e[k] !== undefined) status[k] = e[k];
if (opt('einwohner') !== undefined) status.einwohner = parseInt(opt('einwohner'), 10);
for (const b of e.neue_gebaeude || []) {
  status.gebaeude = status.gebaeude.filter((x) => x.platz !== b.platz);
  status.gebaeude.push({ status: 'fertig', ...b, seit_folge: nr });
}
status.bewohner = status.bewohner || [];
for (const b of e.neue_bewohner || []) { status.bewohner = status.bewohner.filter((x) => x.name !== b.name); status.bewohner.push({ ...b, seit_folge: nr }); }
if (e.ziel !== undefined) status.ziel = e.ziel;
for (const k of ['follower', 'supermarkt_offen', 'republik', 'regierung', 'bauliste']) if (e[k] !== undefined) status[k] = e[k];
if (e.schild !== undefined) status.schild = e.schild;
status.objekte = status.objekte || [];
for (const o of e.neue_objekte || []) status.objekte.push({ ...o, seit_folge: nr });
status.letzte_folge = nr;
status.verlauf.push({ folge: nr, titel: ep.titel, abgeschlossen: new Date().toISOString().slice(0, 10), tag: status.tag, einwohner: status.einwohner, gebaeude: status.gebaeude.length });
fs.writeFileSync(statusPath, JSON.stringify(status, null, 2) + '\n');
console.log(`Serienstand aktualisiert: Tag ${status.tag}, ${status.einwohner} Einwohner, ${status.gebaeude.length} Gebäude, letzte Folge ${nr}.`);
console.log(`Nächster Schritt: node pipeline/neue-folge.js ${nr + 1}`);
