// Charakter: Werte werden serverseitig geprüft (gleiche Auswahl wie im Editor, client/src/spieler/mensch.js)
const AUSWAHL = {
  koerper: ['m', 'w'], frisur: ['kurz', 'buzz', 'seitenscheitel', 'locken', 'afro', 'lang', 'zopf', 'dutt', 'glatze'],
  bart: ['kein', 'stoppeln', 'kinnbart', 'vollbart', 'schnurrbart'], brauen: ['normal', 'dick', 'duenn', 'gebogen'],
  oberteil: ['tshirt', 'hoodie', 'jacke', 'hemd', 'anzug', 'pullover', 'tanktop'], hose: ['jeans', 'jogger', 'chino', 'shorts', 'rock', 'cargo'],
  schuhe: ['sneaker', 'boots', 'business', 'slipper'], muetze: ['keine', 'cap', 'beanie', 'hut'], brille: ['keine', 'rund', 'eckig', 'sonne'],
};
const REGLER = { groesse: [0.92, 1.08], statur: [0.85, 1.2], kopfform: [0, 1], kiefer: [0, 1], nase: [0, 1], augenabstand: [0, 1], augengroesse: [0, 1], lippen: [0, 1] };
const INDEX = { haut: 8, augenfarbe: 6, haarfarbe: 12, oberteilFarbe: 16, hoseFarbe: 16, schuheFarbe: 16, muetzeFarbe: 16 };
const BOOL = ['kette', 'uhr'];
const KLEIDUNG = ['oberteil', 'oberteilFarbe', 'hose', 'hoseFarbe', 'schuhe', 'schuheFarbe', 'muetze', 'muetzeFarbe', 'brille', 'kette', 'uhr'];

export function pruefeAussehen(x) {
  if (!x || typeof x !== 'object') return null; const o = {};
  for (const [k, liste] of Object.entries(AUSWAHL)) if (liste.includes(x[k])) o[k] = x[k];
  for (const [k, [a, b]] of Object.entries(REGLER)) { const v = Number(x[k]); if (Number.isFinite(v)) o[k] = Math.min(b, Math.max(a, Math.round(v * 1000) / 1000)); }
  for (const [k, n] of Object.entries(INDEX)) { const v = Number(x[k]); if (Number.isInteger(v) && v >= 0 && v < n) o[k] = v; }
  for (const k of BOOL) if (typeof x[k] === 'boolean') o[k] = x[k];
  return o;
}
// { aussehen, outfits: [ {name, ...Kleidung} ] (max. 3) }
export function pruefeCharakter(x) {
  const aussehen = pruefeAussehen(x?.aussehen) || {};
  const outfits = Array.isArray(x?.outfits) ? x.outfits.slice(0, 3).map((o, i) => {
    const k = pruefeAussehen(o) || {}; const nur = Object.fromEntries(Object.entries(k).filter(([key]) => KLEIDUNG.includes(key)));
    return { name: String(o?.name || `Outfit ${i + 1}`).replace(/[^\p{L}\p{N} _.-]/gu, '').slice(0, 20) || `Outfit ${i + 1}`, ...nur };
  }) : [];
  return { aussehen, outfits };
}
