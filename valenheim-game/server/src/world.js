// Feste Orte der Stadt (müssen zur 3D-Stadt in web/src/game/city.js passen).
export const PLACES = {
  tafel_rathaus: { name: 'Missionstafel Rathausplatz', x: -9, z: 13 },
  tafel_bahnhof: { name: 'Missionstafel Bahnhof', x: -214, z: -14 },
  tafel_krankenhaus: { name: 'Missionstafel Krankenhaus', x: 188, z: -49 },

  rathaus: { name: 'Rathaus', x: 0, z: -5 },
  brunnen: { name: 'Brunnen am Rathausplatz', x: 0, z: 16 },
  krankenhaus: { name: 'Krankenhaus – Haupteingang', x: 157, z: -60 },
  notaufnahme: { name: 'Krankenhaus – Notaufnahme', x: 140, z: -49 },
  rettung: { name: 'Rettungsstation', x: 228, z: -64 },
  bahnhof: { name: 'Hauptbahnhof – Vorplatz', x: -224, z: 0 },
  bahnsteig: { name: 'Bahnsteig Gleis 1/2', x: -302, z: 4 },
  lager: { name: 'Versorgungslager', x: -174, z: 159 },
  park: { name: 'Stadtpark', x: 80, z: 160 },
  teich: { name: 'Teich im Stadtpark', x: 96, z: 133 },
  militaer_tor: { name: 'Tor zum Militärgelände', x: -40, z: -194 },
  industrie: { name: 'Industriegebiet – Tanklager', x: -158, z: 262 },
};
export const BOARDS = ['tafel_rathaus', 'tafel_bahnhof', 'tafel_krankenhaus'];

// Startpunkte für Einwohner, die evakuiert werden (auf Straßen im Wohnviertel)
export const EVAC_SPAWNS = [[120, 232], [200, 170], [40, 250], [-40, 238], [160, 200], [280, 248], [120, 172], [200, 120]];
export const EVAC_POINTS = ['park', 'bahnhof'];
