import { useCallback, useEffect, useState } from 'react';
import Hauptmenue from './Hauptmenue.jsx';
import Konto from './Konto.jsx';
import Leistungstest from './Leistungstest.jsx';
import Einstellungen from './Einstellungen.jsx';
import Spiel from './Spiel.jsx';
import { api, getToken, setToken } from '../lib/api.js';

// Seiten über den Hash: #/, #/spielen, #/konto, #/leistung, #/einstellungen
const lese = () => location.hash.replace(/^#\/?/, '') || '';
export const geh = (p) => { location.hash = '/' + p; };

export default function App() {
  const [seite, setSeite] = useState(lese());
  const [konto, setKonto] = useState(null); // { profil, spielstand }
  const [laedt, setLaedt] = useState(!!getToken());

  useEffect(() => { const f = () => setSeite(lese()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  const neuLaden = useCallback(async () => {
    if (!getToken()) { setKonto(null); setLaedt(false); return; }
    try { setKonto(await api.ich()); } catch (e) { if (e.status === 401) { setToken(null); setKonto(null); } }
    finally { setLaedt(false); }
  }, []);
  useEffect(() => { neuLaden(); }, [neuLaden]);

  const abmelden = async () => { try { await api.abmelden(); } catch { /* egal */ } setToken(null); setKonto(null); geh(''); };

  if (seite === 'spielen') return konto ? <Spiel konto={konto} onEnde={() => { neuLaden(); geh(''); }} /> : <Konto onFertig={async () => { await neuLaden(); geh('spielen'); }} />;
  if (seite === 'konto') return <Konto onFertig={async () => { await neuLaden(); geh(''); }} />;
  if (seite === 'leistung') return <Leistungstest />;
  if (seite === 'einstellungen') return <Einstellungen konto={konto} onGespeichert={neuLaden} />;
  return <Hauptmenue konto={konto} laedt={laedt} onAbmelden={abmelden} />;
}
