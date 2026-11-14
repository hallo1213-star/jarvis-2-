// Verbindung zum Server. Das Anmelde-Token liegt nur auf diesem Gerät; Konto + Spielstand liegen auf dem Server.
const KEY = 'vh2_token';
export const getToken = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
export const setToken = (t) => { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { /* privat */ } };

async function call(method, url, body) {
  const headers = { 'Content-Type': 'application/json' }; const t = getToken(); if (t) headers.Authorization = `Bearer ${t}`;
  let res; try { res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined }); }
  catch { throw new Error('Server nicht erreichbar. Beim ersten Aufruf kann der Start bis zu einer Minute dauern.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.fehler || `Fehler ${res.status}`); e.status = res.status; throw e; }
  return data;
}
export const api = {
  status: () => call('GET', '/api/status'),
  registrieren: (name, passwort) => call('POST', '/api/auth/register', { name, passwort }),
  anmelden: (name, passwort) => call('POST', '/api/auth/login', { name, passwort }),
  wiederherstellen: (name, code, passwort) => call('POST', '/api/auth/recover', { name, code, passwort }),
  abmelden: () => call('POST', '/api/auth/logout'),
  ich: () => call('GET', '/api/me'),
  einstellungen: (s) => call('PUT', '/api/settings', s),
  charakter: (c) => call('PUT', '/api/charakter', c),
  server: () => call('GET', '/api/server'),
  geld: () => call('GET', '/api/geld'),
  einzahlen: (betrag) => call('POST', '/api/geld/einzahlen', { betrag }),
  abheben: (betrag) => call('POST', '/api/geld/abheben', { betrag }),
  ueberweisen: (an, betrag, text) => call('POST', '/api/geld/ueberweisen', { an, betrag, text }),
  fahrzeuge: () => call('GET', '/api/fahrzeuge'),
  kaufen: (modell, farbe) => call('POST', '/api/fahrzeuge/kaufen', { modell, farbe }),
  kennzeichen: (id, kennzeichen) => call('POST', '/api/fahrzeuge/kennzeichen', { id, kennzeichen }),
  tuning: (id, tuning) => call('POST', '/api/fahrzeuge/tuning', { id, tuning }),
  privatServer: (name) => call('POST', '/api/server/privat', { name }),
};

// Gewünschter Server für die nächste Runde (nur in diesem Tab)
export const raumWahl = {
  hole: () => { try { return JSON.parse(sessionStorage.getItem('vh2_raum') || '{}'); } catch { return {}; } },
  setze: (w) => { try { sessionStorage.setItem('vh2_raum', JSON.stringify(w || {})); } catch { /* egal */ } },
};
