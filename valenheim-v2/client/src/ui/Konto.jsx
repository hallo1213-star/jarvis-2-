import { useState } from 'react';
import Logo from './Logo.jsx';
import { api, setToken } from '../lib/api.js';

// Anmelden · Registrieren · Passwort vergessen (mit Wiederherstellungscode)
export default function Konto({ onFertig }) {
  const [modus, setModus] = useState('anmelden');
  const [name, setName] = useState(''); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [code, setCode] = useState('');
  const [fehler, setFehler] = useState(''); const [busy, setBusy] = useState(false);
  const [neuerCode, setNeuerCode] = useState(null); const [notiert, setNotiert] = useState(false); const [kopiert, setKopiert] = useState(false);

  async function los(e) {
    e.preventDefault(); setFehler('');
    if ((modus === 'registrieren' || modus === 'vergessen') && pw !== pw2) return setFehler('Die beiden Passwörter stimmen nicht überein.');
    setBusy(true);
    try {
      const r = modus === 'anmelden' ? await api.anmelden(name, pw) : modus === 'registrieren' ? await api.registrieren(name, pw) : await api.wiederherstellen(name, code, pw);
      setToken(r.token);
      if (r.wiederherstellungscode) setNeuerCode(r.wiederherstellungscode); else onFertig();
    } catch (err) { setFehler(err.message); } finally { setBusy(false); }
  }

  if (neuerCode) return (
    <div className="seite"><div className="inhalt" style={{ maxWidth: 480 }}>
      <Logo small />
      <div className="card stack">
        <div className="eyebrow">Wichtig – nur jetzt sichtbar</div>
        <h1 className="h1">Dein Wiederherstellungscode</h1>
        <p className="sub">Damit bekommst du dein Konto zurück, falls du dein Passwort vergisst. <b style={{ color: '#fff' }}>Schreib ihn auf oder mach einen Screenshot.</b> Niemand – auch nicht der Bürgermeister – kann ihn dir später noch einmal zeigen.</p>
        <div className="codebox">{neuerCode}</div>
        <button className="btn btn--ghost" onClick={async () => { try { await navigator.clipboard.writeText(neuerCode); setKopiert(true); } catch { setKopiert(false); } }}>{kopiert ? 'KOPIERT ✓' : 'CODE KOPIEREN'}</button>
        <label className="check"><input type="checkbox" checked={notiert} onChange={(e) => setNotiert(e.target.checked)} />Ich habe meinen Code sicher aufgeschrieben.</label>
        <button className="btn btn--gold" disabled={!notiert} onClick={() => onFertig(modus === 'registrieren')}>WEITER</button>
      </div>
    </div></div>
  );

  return (
    <div className="seite">
      <div className="seite__kopf"><a className="zurueck" href="#/" aria-label="Zurück">←</a><Logo small /></div>
      <div className="inhalt" style={{ maxWidth: 480 }}>
        <form className="card stack" onSubmit={los}>
          <div className="tabs" role="tablist">
            {[['anmelden', 'Anmelden'], ['registrieren', 'Neues Konto']].map(([k, l]) => <button key={k} type="button" className={modus === k ? 'an' : ''} onClick={() => { setModus(k); setFehler(''); }}>{l}</button>)}
          </div>
          {modus === 'vergessen' && <div><div className="eyebrow">Passwort vergessen</div><p className="sub">Gib deinen Namen, deinen Wiederherstellungscode und ein neues Passwort ein.</p></div>}
          <div className="feld"><label htmlFor="name">Spielername</label><input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={16} autoComplete="username" autoCapitalize="off" spellCheck="false" placeholder="z. B. Mohammed" /></div>
          {modus === 'vergessen' && <div className="feld"><label htmlFor="code">Wiederherstellungscode</label><input id="code" className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX" autoCapitalize="characters" spellCheck="false" /></div>}
          <div className="feld"><label htmlFor="pw">{modus === 'vergessen' ? 'Neues Passwort' : 'Passwort'}</label><input id="pw" type="password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={modus === 'anmelden' ? 'current-password' : 'new-password'} placeholder="mindestens 8 Zeichen" /></div>
          {modus !== 'anmelden' && <div className="feld"><label htmlFor="pw2">Passwort wiederholen</label><input id="pw2" type="password" className="input" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></div>}
          {fehler && <div className="fehler" role="alert">{fehler}</div>}
          <button className="btn btn--gold" disabled={busy || name.trim().length < 3 || pw.length < 8}>{busy ? 'BITTE WARTEN …' : modus === 'anmelden' ? 'ANMELDEN' : modus === 'registrieren' ? 'KONTO ERSTELLEN' : 'PASSWORT ZURÜCKSETZEN'}</button>
          {modus === 'anmelden' && <button type="button" className="link" onClick={() => { setModus('vergessen'); setFehler(''); }}>Passwort vergessen?</button>}
          {modus === 'registrieren' && <p className="hinweis">Dein Spielername ist öffentlich und gehört nur dir. Mit Name und Passwort spielst du auf jedem Gerät mit demselben Spielstand.</p>}
        </form>
      </div>
    </div>
  );
}
