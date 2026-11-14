// Gemeinsame Job-Geometrie (Server + Client): wo die Firmen sind und welche Lieferadressen es gibt.
export function firmaPos(J, key) {
  const [i, j] = J.firmen[key].platz; const l = Math.hypot(i, j) || 1;
  return { x: i * J.raster - (i / l) * (J.halbblock - 1.5), z: j * J.raster - (j / l) * (J.halbblock - 1.5) };
}
// Zufällige Adresse: Gehweg-Mitte an einer Blockseite (nicht der Stadtplatz), rnd() liefert 0..1
export function zufallsAdresse(J, rnd) {
  for (;;) {
    const i = Math.floor(rnd() * (2 * J.bereich + 1)) - J.bereich, j = Math.floor(rnd() * (2 * J.bereich + 1)) - J.bereich;
    if (i === 0 && j === 0) continue;
    const seite = Math.floor(rnd() * 4), off = (rnd() - 0.5) * 30, a = J.halbblock - 1.8;
    const x = i * J.raster + (seite === 0 ? a : seite === 1 ? -a : off), z = j * J.raster + (seite === 2 ? a : seite === 3 ? -a : off);
    return { x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, block: [i, j] };
  }
}
export const STRASSEN = ['Hauptstraße', 'Republikallee', 'Rathausweg', 'Lindenstraße', 'Bahnhofstraße', 'Am Stadtplatz', 'Goldener Ring', 'Bürgerstraße', 'Präsidentenweg', 'Marktgasse', 'Hafenstraße', 'Schulstraße'];
export const adresseName = (a) => `${STRASSEN[Math.abs(a.block[0] * 7 + a.block[1] * 3) % STRASSEN.length]} ${1 + (Math.abs(Math.round(a.x + a.z)) % 120)}`;
