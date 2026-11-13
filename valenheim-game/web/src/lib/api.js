// Kommunikation mit dem Spielserver. Das Konto-Token liegt nur auf diesem Gerät.
import { DEMO, localApi } from '../demo/local.js';

const KEY = 'vh_token';
export const getToken = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
export const setToken = (t) => { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { /* privat */ } };

const AKEY = 'vh_admin';
export const getAdmin = () => { try { return sessionStorage.getItem(AKEY); } catch { return null; } };
export const setAdmin = (t) => { try { t ? sessionStorage.setItem(AKEY, t) : sessionStorage.removeItem(AKEY); } catch { /* privat */ } };

async function call(method, url, body) {
  if (DEMO) return localApi(method, url, body);
  const headers = { 'Content-Type': 'application/json' }; const t = getToken(); if (t) headers.Authorization = `Bearer ${t}`;
  const a = getAdmin(); if (a && url.startsWith('/api/admin')) headers['X-Admin-Token'] = a;
  let res;
  try { res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined }); }
  catch { throw new Error('Server nicht erreichbar. Bitte versuche es gleich noch einmal.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.fehler || `Fehler ${res.status}`); e.status = res.status; throw e; }
  return data;
}
export const api = {
  status: () => call('GET', '/api/status'),
  register: (name, look) => call('POST', '/api/register', { name, look }),
  me: () => call('GET', '/api/me'),
  rangliste: () => call('GET', '/api/rangliste'),
  profil: (name) => call('GET', `/api/profil/${encodeURIComponent(name)}`),
  admin: {
    status: () => call('GET', '/api/admin/status'),
    login: (passwort) => call('POST', '/api/admin/login', { passwort }),
    logout: () => call('POST', '/api/admin/logout'),
    uebersicht: () => call('GET', '/api/admin/uebersicht'),
    buerger: (q = '', seite = 0) => call('GET', `/api/admin/buerger?q=${encodeURIComponent(q)}&seite=${seite}`),
    buergerDetail: (id) => call('GET', `/api/admin/buerger/${id}`),
    punkte: (id, delta, grund) => call('POST', `/api/admin/buerger/${id}/punkte`, { delta, grund }),
    sperre: (id, gesperrt, grund) => call('POST', `/api/admin/buerger/${id}/sperre`, { gesperrt, grund }),
    missionen: () => call('GET', '/api/admin/missionen'),
    missionSpeichern: (m) => call('POST', '/api/admin/missionen', m),
    missionAktiv: (id, aktiv) => call('POST', `/api/admin/missionen/${id}/aktiv`, { aktiv }),
    ereignis: (typ, text, dauer) => call('POST', '/api/admin/ereignis', { typ, text, dauer }),
  },
};
