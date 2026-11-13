// Kommunikation mit dem Spielserver. Das Konto-Token liegt nur auf diesem Gerät.
const KEY = 'vh_token';
export const getToken = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
export const setToken = (t) => { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { /* privat */ } };

async function call(method, url, body) {
  const headers = { 'Content-Type': 'application/json' }; const t = getToken(); if (t) headers.Authorization = `Bearer ${t}`;
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
};
