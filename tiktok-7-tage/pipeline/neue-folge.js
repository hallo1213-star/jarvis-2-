#!/usr/bin/env node
// Erzeugt das Drehbuch für die nächste Folge aus dem aktuellen Serienstand.
//
//   node pipeline/neue-folge.js 2 --bau krankenhaus:B1 --neue-einwohner 250 \
//        --kommentar "lena.k|Baut ein Krankenhaus!|412" --kommentar "max_99|Wir brauchen Ärzte|233"
//
// Optionen
//   --bau <typ>:<platz>     Gebäude, das in dieser Folge gebaut wird (Typen: siehe engine/catalog.js, Plätze B1–B8)
//   --name "TEXT"           eigener Schildname für das Gebäude (Standard: Name aus dem Katalog)
//   --neue-einwohner <n>    neue Follower seit der letzten Folge (= neue Einwohner)
//   --kommentar "name|text|likes"   bis zu 4 Zuschauer-Kommentare, die eingeblendet werden
//   --tag <n>               Tag der Geschichte (Standard: letzter Tag + 1)
//   --force                 vorhandene Datei überschreiben
//
// Danach: Sprechertexte in folgen/folge-XX.json nach Wunsch anpassen und `bash pipeline/folge.sh XX` ausführen.
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const nr = parseInt(args[0], 10); if (!nr || nr < 2) { console.error('Nutzung: node pipeline/neue-folge.js <nummer ≥ 2> [Optionen]'); process.exit(1); }
const all = (k) => args.reduce((a, v, i) => (v === '--' + k ? [...a, args[i + 1]] : a), []);
const opt = (k, d) => { const v = all(k); return v.length ? v[v.length - 1] : d; };
const pad = String(nr).padStart(2, '0');
const out = path.join(ROOT, 'folgen', `folge-${pad}.json`);
if (fs.existsSync(out) && !args.includes('--force')) { console.error(`${out} existiert bereits (--force zum Überschreiben).`); process.exit(1); }

const S = JSON.parse(fs.readFileSync(path.join(ROOT, 'serie', 'stadt-status.json'), 'utf8'));
if (S.letzte_folge !== nr - 1) console.warn(`Achtung: Serienstand steht bei Folge ${S.letzte_folge}. Erst 'node pipeline/folge-abschliessen.js ${nr - 1}' ausführen?`);

const KOSTEN = { wohnhaus: 4000, supermarkt: 3500, krankenhaus: 6000, feuerwache: 4500, polizei: 4000, schule: 4000, bunker: 7000, farm: 2500,
  kraftwerk: 5000, wasserwerk: 4500, funkturm: 3000, lager: 3000, rathaus: 5000, park: 1500 };
const NAMEN = { wohnhaus: 'Wohnhaus', supermarkt: 'Supermarkt', krankenhaus: 'Krankenhaus', feuerwache: 'Feuerwache', polizei: 'Polizeiwache', schule: 'Schule',
  bunker: 'Schutzbunker', farm: 'Gewächshaus', kraftwerk: 'Solarkraftwerk', wasserwerk: 'Wasserwerk', funkturm: 'Funkturm', lager: 'Vorratslager', rathaus: 'Rathaus', park: 'Park' };
const ARTIKEL = { wohnhaus: 'ein', supermarkt: 'einen', krankenhaus: 'ein', feuerwache: 'eine', polizei: 'eine', schule: 'eine', bunker: 'einen', farm: 'ein',
  kraftwerk: 'ein', wasserwerk: 'ein', funkturm: 'einen', lager: 'ein', rathaus: 'ein', park: 'einen' };

const [bauTyp, bauPlatz] = (opt('bau', 'wohnhaus:B1')).split(':');
if (!KOSTEN[bauTyp]) { console.error('Unbekannter Gebäudetyp: ' + bauTyp + '\nVerfügbar: ' + Object.keys(KOSTEN).join(', ')); process.exit(1); }
const belegt = new Set(S.gebaeude.map((b) => b.platz));
let platz = bauPlatz || ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8'].find((p) => !belegt.has(p));
if (belegt.has(platz)) { console.error(`Bauplatz ${platz} ist schon belegt.`); process.exit(1); }
const neu = parseInt(opt('neue-einwohner', '0'), 10) || 0;
const tag = parseInt(opt('tag', String(S.tag + 1)), 10);
const rest = Math.max(0, 8 - tag);
const kommentare = all('kommentar').map((k) => { const [name, text, likes] = k.split('|'); return { name, text, likes: likes ? Number(likes) : undefined }; });
if (!kommentare.length) kommentare.push({ name: 'zuschauer1', text: `Baut ${ARTIKEL[bauTyp]} ${NAMEN[bauTyp]}!`, likes: 128 }, { name: 'zuschauer2', text: 'Wir brauchen das unbedingt!', likes: 64 });

const einwohnerNach = S.einwohner + neu;
const gebNach = S.gebaeude.length + 1;
const kasseNach = S.stadtkasse - KOSTEN[bauTyp] + neu * 20;
const entw = Math.min(100, Math.round(gebNach * 9 + Math.sqrt(einwohnerNach) * 1.2));
const stufe = entw < 10 ? 'GEISTERSTADT' : entw < 30 ? 'SIEDLUNG' : entw < 60 ? 'KLEINSTADT' : entw < 90 ? 'STADT' : 'BEREIT';
const [li, lj] = { B1: [-1, 0], B2: [1, 0], B3: [-1, 1], B4: [1, 1], B5: [-2, 0], B6: [2, 0], B7: [0, 2], B8: [-2, 1] }[platz];
const lx = li * 74, lz = lj * 74;
const zahlWort = (n) => n.toLocaleString('de-DE');

const ep = {
  folge: nr,
  titel: `Tag ${tag}: ${NAMEN[bauTyp]}`,
  _hinweis: 'Automatisch erzeugt von neue-folge.js. Sprechertexte, Kommentare und Kamerafahrten dürfen frei angepasst werden. Markup: *gelb*, !rot!, | Pause.',
  stimme: { modell: 'de_DE-thorsten-high', tempo: 1.07, lebendigkeit: 0.72, rhythmus: 0.85, tonhoehe_halbtoene: 1.0 },
  aussprache: { Follower: 'Follohuer' },
  szenen: [
    {
      id: 's1_rueckblick', name: 'Neuer Tag', vorlauf: 0.8, nachlauf: 0.35,
      sprecher: `*Tag* *${tag}* in Valenheim. | Nur noch !${rest}! !Tage! bis zum Krieg.`,
      shots: [{ typ: 'pfad', anteil: 1, fov: [42, 48], wackeln: 0.25, keys: [{ pos: [37, 190, 600], ziel: [37, 0, 220] }, { pos: [40, 118, 270], ziel: [30, 0, -60] }, { pos: [30, 64, 128], ziel: [8, 12, -140] }] }],
      effekte: [{ typ: 'titel', zeit: 0.15, dauer: 2.4, text: `TAG ${tag}`, unter: `FOLGE ${nr} · DIE LETZTEN 7 TAGE` },
        { typ: 'werte', zeit: 0.6, tag, verbleibende_tage: rest }],
      toene: [{ typ: 'boom', zeit: 0.05 }, { typ: 'wind_swell', zeit: 0 }, { typ: 'whoosh', ende: -0.25 }],
    },
    {
      id: 's2_kommentare', name: 'Eure Entscheidung', uebergang: 'blitz', vorlauf: 0.3, nachlauf: 0.4,
      sprecher: `Ihr habt in den *Kommentaren* entschieden. | Und die meisten wollten: | *${NAMEN[bauTyp]}*!`,
      shots: [{ typ: 'orbit', anteil: 1, ziel: 'figur+0,1.3,0', radius: [6.5, 5.2], hoehe: [1.3, 1.0], winkel: [160, 125], fov: [34, 30], wackeln: 0.2 }],
      figur: [{ zeit: 0, aktion: 'umsehen', richtung: 180 }],
      effekte: [{ typ: 'kommentare', zeit: 0.3, dauer: 4.2, liste: kommentare }, { typ: 'spieler_label', zeit: 0, dauer: 99 }],
      toene: [{ typ: 'whoosh_down', zeit: 0 }, { typ: 'blip', zeit: 0.3 }, { typ: 'blip', zeit: 0.65 }, { typ: 'blip', zeit: 1.0 }],
    },
    {
      id: 's3_bau', name: 'Der Bau', uebergang: 'schnitt', vorlauf: 0.3, nachlauf: 0.6,
      sprecher: `Also bauen wir ${ARTIKEL[bauTyp]} *${NAMEN[bauTyp]}*. |0.4| Direkt hier, | auf *Bauplatz* *${platz.slice(1)}*.`,
      shots: [{ typ: 'orbit', anteil: 1, ziel: [lx, 10, lz], radius: [95, 80], hoehe: [45, 30], winkel: [Math.round(Math.atan2(-li, -lj) * 180 / Math.PI) - 25, Math.round(Math.atan2(-li, -lj) * 180 / Math.PI) + 15], fov: [44, 40], wackeln: 0.2 }],
      effekte: [{ typ: 'bau', zeit: 0.4, dauer: 4.5, platz, gebaeude: bauTyp, name: opt('name', undefined) },
        { typ: 'werte', zeit: 3.8, stadtkasse: S.stadtkasse - KOSTEN[bauTyp], gebaeude: gebNach },
        { typ: 'callout', zeit: 2.6, dauer: 2.6, anker: [lx, 14, lz], titel: (opt('name', NAMEN[bauTyp])).toUpperCase(), unter: `KOSTEN: ${zahlWort(KOSTEN[bauTyp])} ${S.waehrung}` }],
      toene: [{ typ: 'build', zeit: 0.4 }, { typ: 'riser', zeit: 0.6, dauer: 1.8 }, { typ: 'boom', zeit: 2.6 }, { typ: 'build', zeit: 2.0 }],
    },
    {
      id: 's4_einwohner', name: 'Neue Einwohner', uebergang: 'schnitt', vorlauf: 0.3, nachlauf: 0.5,
      sprecher: neu > 0 ? `Und dank euch | sind *${zahlWort(neu)}* *neue* *Einwohner* in unsere Stadt gezogen!` : 'Aber noch ist unsere Stadt *leer*. | Wir brauchen *Einwohner*!',
      shots: [{ typ: 'pfad', anteil: 1, fov: [44, 40], wackeln: 0.2, keys: [{ pos: [34, 12, 34], ziel: [0, 1.5, 4] }, { pos: [26, 8, 26], ziel: [0, 1.5, 2] }] }],
      effekte: neu > 0 ? [{ typ: 'einwohner_ankunft', zeit: 0.3, dauer: 3.5, anzahl: neu }] : [],
      toene: neu > 0 ? [{ typ: 'spawn', zeit: 0.3 }, { typ: 'spawn', zeit: 1.4 }, { typ: 'shimmer', zeit: 2.5 }] : [{ typ: 'blip', zeit: 0.4 }],
    },
    {
      id: 's5_ende', name: 'Ende', uebergang: 'schnitt', vorlauf: 0.35, nachlauf: 2.3,
      sprecher: `Was bauen wir als *Nächstes*? |0.4| Schreibt es in die *Kommentare*. |0.35| Und jeder neue *Follower* wird ein neuer *Einwohner*!`,
      shots: [{ typ: 'pfad', anteil: 1, fov: [40, 46], wackeln: 0.12, ease: 'inOutSine', keys: [{ pos: 'figur+-2.6,1.7,-3.6', ziel: 'figur+0,1.4,0' }, { pos: 'figur+-14,12,-18', ziel: 'figur+0,1,0' }, { pos: [-160, 260, -300], ziel: [0, 0, 0] }, { pos: [-260, 620, -470], ziel: [0, 0, 20] }] }],
      figur: [{ zeit: 0, aktion: 'winken', richtung: 180 }],
      effekte: [{ typ: 'werte', zeit: 0.2, stadtkasse: kasseNach, entwicklung_prozent: entw, entwicklung_stufe: stufe }, { typ: 'frage', wort: 'Was', dauer: 2.6, text: 'WAS BAUEN WIR ALS NÄCHSTES?' },
        { typ: 'endkarte', wort: 'Schreibt', offset: -0.2 }, { typ: 'kommentar_cta', wort: 'Kommentare', offset: -0.3 }],
      toene: [{ typ: 'whoosh_up', zeit: 0 }, { typ: 'boom', wort: 'Schreibt', offset: -0.2 }, { typ: 'blip', wort: 'Kommentare' }, { typ: 'shimmer', wort: 'Einwohner', offset: -0.1 }, { typ: 'final_hit', ende: -1.9 }],
    },
  ],
  ergebnis: {
    tag, verbleibende_tage: rest, einwohner: einwohnerNach, stadtkasse: kasseNach, entwicklung_prozent: entw, entwicklung_stufe: stufe,
    neue_gebaeude: [{ typ: bauTyp, platz, name: opt('name', undefined), status: 'fertig' }],
  },
};
fs.writeFileSync(out, JSON.stringify(ep, null, 2) + '\n');
console.log(`Drehbuch erstellt: ${out}`);
console.log(`  Tag ${tag} (noch ${rest} Tage) · Bau: ${NAMEN[bauTyp]} auf ${platz} · +${neu} Einwohner → ${einwohnerNach}`);
console.log(`Weiter: Texte prüfen, dann  bash pipeline/folge.sh ${nr}`);
