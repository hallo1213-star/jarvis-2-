import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { KATALOG } from '../fahrzeuge/modelle.js';
import AutoVorschau from './AutoVorschau.jsx';
import STAND from '../../../shared/serienstand.json';

export const euro = (n) => `${Math.round(n).toLocaleString('de-DE')} €`;
const Farbwahl = ({ wert, onWahl }) => <div className="farben">{KATALOG.farben.map((c, i) => <button key={c} className={`farbe ${wert === i ? 'an' : ''}`} style={{ background: c }} onClick={() => onWahl(i)} aria-label={`Farbe ${i + 1}`} />)}</div>;

// Janniks Autohaus: Modell + Farbe wählen, kaufen (Server bucht vom Bankkonto ab)
export function Autohaus({ konto, onZu, onGekauft }) {
  const liste = Object.entries(KATALOG.modelle); const [wahl, setWahl] = useState(liste[0][0]); const [farbe, setFarbe] = useState(2);
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false); const M = KATALOG.modelle[wahl];
  const kaufen = async () => { setBusy(true); setMsg(''); try { const r = await api.kaufen(wahl, farbe); onGekauft(r.fahrzeug); } catch (e) { setMsg(e.message); } finally { setBusy(false); } };
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onZu()}>
      <div className="card laden">
        <div className="laden__kopf"><div><div className="eyebrow">Janniks Autohaus</div><h2 className="h2">{M.name}</h2></div><button className="x" onClick={onZu} aria-label="Schließen">✕</button></div>
        <AutoVorschau look={{ modell: wahl, farbe, kennzeichen: 'VH-JA 2026', tuning: {} }} />
        <div className="modelle">{liste.map(([k, m]) => <button key={k} className={`modell ${wahl === k ? 'an' : ''}`} onClick={() => setWahl(k)}><b>{m.name}</b><small>{euro(m.preis)}</small></button>)}</div>
        <div className="werte"><span>Spitze <b>{M.kmh} km/h</b></span><span>Beschleunigung <b>{'★'.repeat(Math.round(M.beschleunigung / 4))}</b></span><span>Sitze <b>{M.plaetze}</b></span></div>
        <div className="cfeld"><span>Farbe</span><Farbwahl wert={farbe} onWahl={setFarbe} /></div>
        {msg && <div className="fehler" role="alert">{msg}</div>}
        <div className="row" style={{ alignItems: 'center' }}><small className="sub" style={{ flex: 1 }}>Kontostand: <b style={{ color: '#fff' }}>{euro(konto?.bank || 0)}</b></small>
          <button className="btn btn--gold" style={{ width: 'auto' }} disabled={busy || (konto && konto.bank < M.preis)} onClick={kaufen}>{konto && konto.bank < M.preis ? 'ZU TEUER' : `KAUFEN · ${euro(M.preis)}`}</button></div>
        <p className="hinweis">Bezahlt wird vom Bankkonto. Dein Auto bekommt ein zufälliges Kennzeichen – ein Wunschkennzeichen gibt es in der Werkstatt.</p>
      </div>
    </div>
  );
}

// Werkstatt: Tuning, Lack, Wunschkennzeichen – Preise vom Katalog, Abrechnung durch den Server
export function Werkstatt({ konto, aktuell, onZu, onGetunt }) {
  const [autos, setAutos] = useState(null); const [id, setId] = useState(aktuell || null); const [wunsch, setWunsch] = useState({}); const [kz, setKz] = useState('');
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { api.fahrzeuge().then((d) => { setAutos(d.fahrzeuge); if (!id && d.fahrzeuge[0]) setId(d.fahrzeuge[0].id); }).catch((e) => setMsg(e.message)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const fz = autos?.find((a) => a.id === id); const T = KATALOG.tuning;
  if (autos && !autos.length) return <div className="overlay" onClick={onZu}><div className="card stack" style={{ maxWidth: 420 }}><div className="eyebrow">Werkstatt</div><p className="sub">Du hast noch kein Auto. Kauf dir eins drinnen bei Janniks Autohaus!</p><button className="btn btn--gold" onClick={onZu}>OK</button></div></div>;
  if (!fz) return <div className="overlay"><div className="spinner" /></div>;
  const neu = { ...fz.tuning, ...Object.fromEntries(Object.entries(wunsch).filter(([k]) => k !== 'farbe')) }; const farbe = wunsch.farbe ?? fz.farbe;
  let summe = 0; for (const [k, v] of Object.entries(wunsch)) { if (k === 'farbe') { if (v !== fz.farbe) summe += T.farbe.preis; } else if ((fz.tuning[k] || 0) !== v) summe += T[k].preise[v]; }
  const setze = (k, v) => setWunsch((w) => ({ ...w, [k]: v }));
  const bezahlen = async () => { setBusy(true); setMsg(''); try { const r = await api.tuning(fz.id, wunsch); setAutos(autos.map((a) => (a.id === fz.id ? r.fahrzeug : a))); setWunsch({}); setMsg(`Fertig! ${euro(r.summe)} bezahlt.`); onGetunt(r.fahrzeug); } catch (e) { setMsg(e.message); } finally { setBusy(false); } };
  const schild = async () => { setBusy(true); setMsg(''); try { const r = await api.kennzeichen(fz.id, kz); setAutos(autos.map((a) => (a.id === fz.id ? r.fahrzeug : a))); setKz(''); setMsg(`Neues Kennzeichen: ${r.fahrzeug.kennzeichen}`); onGetunt(r.fahrzeug); } catch (e) { setMsg(e.message); } finally { setBusy(false); } };
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onZu()}>
      <div className="card laden">
        <div className="laden__kopf"><div><div className="eyebrow">Werkstatt · Janniks Autohaus</div><h2 className="h2">{KATALOG.modelle[fz.modell].name}</h2></div><button className="x" onClick={onZu} aria-label="Schließen">✕</button></div>
        {autos.length > 1 && <div className="seg">{autos.map((a) => <button key={a.id} className={a.id === id ? 'an' : ''} onClick={() => { setId(a.id); setWunsch({}); }}>{a.kennzeichen}</button>)}</div>}
        <AutoVorschau look={{ modell: fz.modell, farbe, kennzeichen: fz.kennzeichen, tuning: neu }} />
        <div className="laden__felder">
          <div className="cfeld"><span>{T.farbe.name} <small>({euro(T.farbe.preis)})</small></span><Farbwahl wert={farbe} onWahl={(i) => setze('farbe', i)} /></div>
          {['felgen', 'tiefer', 'spoiler', 'neon', 'toenung', 'motor'].map((k) => (
            <div key={k} className="cfeld"><span>{T[k].name}</span><div className="seg">{T[k].stufen.map((n, i) => <button key={n} className={(neu[k] || 0) === i ? 'an' : ''} onClick={() => setze(k, i)}>{n}{i > 0 && (fz.tuning[k] || 0) !== i ? <small> {euro(T[k].preise[i])}</small> : null}</button>)}</div></div>
          ))}
        </div>
        <div className="row" style={{ alignItems: 'center' }}><small className="sub" style={{ flex: 1 }}>Konto: <b style={{ color: '#fff' }}>{euro(konto?.bank || 0)}</b></small>
          <button className="btn btn--gold" style={{ width: 'auto' }} disabled={busy || !Object.keys(wunsch).length} onClick={bezahlen}>{summe ? `BEZAHLEN · ${euro(summe)}` : 'ÜBERNEHMEN'}</button></div>
        <div className="cfeld"><span>Wunschkennzeichen <small>({euro(KATALOG.kennzeichen.preis)}) · jetzt: <b className="code">{fz.kennzeichen}</b></small></span>
          <div className="row"><input className="input code" value={kz} maxLength={10} onChange={(e) => setKz(e.target.value.toUpperCase())} placeholder="VH-AB 123" spellCheck="false" /><button className="btn btn--ghost" style={{ width: 'auto' }} disabled={busy || kz.length < 6} onClick={schild}>PRÄGEN</button></div></div>
        {msg && <p className="sub" role="status">{msg}</p>}
      </div>
    </div>
  );
}

// Handy: Bank + Garage
export function Handy({ konto, aktuell, onZu, onHolen, onWeg }) {
  const [app, setApp] = useState(null); const [d, setD] = useState(null); const [autos, setAutos] = useState(null);
  const [betrag, setBetrag] = useState(''); const [an, setAn] = useState(''); const [zweck, setZweck] = useState(''); const [msg, setMsg] = useState('');
  const laden = () => api.geld().then(setD).catch((e) => setMsg(e.message));
  useEffect(() => { if (app === 'bank') laden(); if (app === 'garage') api.fahrzeuge().then((x) => setAutos(x.fahrzeuge)).catch((e) => setMsg(e.message)); setMsg(''); }, [app]);
  const tu = async (fn) => { setMsg(''); try { await fn(); setBetrag(''); await laden(); setMsg('Erledigt ✓'); } catch (e) { setMsg(e.message); } };
  const k = d?.konto || konto; const uhr = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="overlay overlay--handy" onClick={(e) => e.target === e.currentTarget && onZu()}>
      <div className="handy" role="dialog" aria-label="Handy">
        <div className="handy__status"><span>{uhr}</span><span>VH-Net 5G ▮▮▮</span></div>
        {!app ? (<div className="handy__home">
          <div className="handy__saldo"><small>Konto</small><b>{euro(k?.bank || 0)}</b><small>Bargeld {euro(k?.bargeld || 0)}</small></div>
          <div className="handy__apps">
            <button onClick={() => setApp('bank')}><span style={{ background: '#0a3a9e' }}>🏦</span>Josuas Bank</button>
            <button onClick={() => setApp('garage')}><span style={{ background: '#b56a1d' }}>🚗</span>Garage</button>
            <button onClick={() => setApp('info')}><span style={{ background: '#2f4b33' }}>🗺️</span>Orte</button>
            <button onClick={() => setApp('regierung')}><span style={{ background: '#7a1f2b' }}>🏛️</span>Regierung</button>
            <button onClick={onZu}><span style={{ background: '#5d2a6e' }}>✕</span>Schließen</button>
          </div></div>) : (
          <div className="handy__app">
            <button className="link" onClick={() => setApp(null)}>‹ Zurück</button>
            {app === 'bank' && <div className="stack">
              <div className="handy__saldo"><small>Kontostand</small><b>{euro(k?.bank || 0)}</b><small>Bargeld {euro(k?.bargeld || 0)}</small></div>
              <input className="input" inputMode="numeric" value={betrag} onChange={(e) => setBetrag(e.target.value.replace(/\D/g, ''))} placeholder="Betrag in €" />
              <div className="row"><button className="btn btn--ghost" disabled={!betrag} onClick={() => tu(() => api.einzahlen(+betrag))}>EINZAHLEN</button><button className="btn btn--ghost" disabled={!betrag} onClick={() => tu(() => api.abheben(+betrag))}>ABHEBEN</button></div>
              <input className="input" value={an} onChange={(e) => setAn(e.target.value)} placeholder="Überweisen an (Spielername)" maxLength={16} />
              <input className="input" value={zweck} onChange={(e) => setZweck(e.target.value)} placeholder="Verwendungszweck (optional)" maxLength={40} />
              <button className="btn btn--gold" disabled={!betrag || an.length < 3} onClick={() => tu(() => api.ueberweisen(an, +betrag, zweck))}>ÜBERWEISEN</button>
              {msg && <small role="status">{msg}</small>}
              <div className="eyebrow">Umsätze</div>
              <div className="umsaetze">{(d?.verlauf || []).map((b, i) => <div key={i} className="umsatz"><span>{b.text}<small>{new Date(b.zeit).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</small></span><b style={{ color: b.betrag < 0 ? '#ff8a8a' : '#6dff9e' }}>{b.betrag > 0 ? '+' : ''}{euro(b.betrag)}</b></div>)}</div>
              <small className="hinweis">Alle {KATALOG.gehalt.minuten} Minuten im Spiel: +{euro(KATALOG.gehalt.betrag)} Bürgergeld.</small>
            </div>}
            {app === 'garage' && <div className="stack">
              {autos === null ? <div className="spinner" /> : !autos.length ? <p className="sub">Noch kein Auto. Janniks Autohaus findest du an der goldenen Lichtsäule, ca. 100 m vom Stadtplatz.</p> :
                autos.map((a) => <div key={a.id} className="umsatz"><span><b>{KATALOG.modelle[a.modell].name}</b><small className="code">{a.kennzeichen}</small></span>
                  {aktuell === a.id ? <button className="btn btn--ghost" style={{ width: 'auto' }} onClick={() => { onWeg(); onZu(); }}>WEGBRINGEN</button> : <button className="btn btn--gold" style={{ width: 'auto' }} onClick={() => { onHolen(a); onZu(); }}>HERBRINGEN</button>}</div>)}
              {msg && <small role="status">{msg}</small>}
            </div>}
            {app === 'regierung' && <Regierung />}
            {app === 'info' && <div className="stack">
              <div className="umsatz"><span><b>Janniks Autohaus</b><small>Autos kaufen · Werkstatt · Kennzeichen</small></span><small>Goldene Lichtsäule</small></div>
              <div className="umsatz"><span><b>Stadtplatz</b><small>Rathaus · Startpunkt</small></span></div>
              <div className="umsatz"><span><b>Präsidentenvilla</b><small>Villenviertel am Stadtrand</small></span></div>
              <p className="hinweis">Tipp: Die Karte mit Navi kommt in einer der nächsten Phasen.</p>
            </div>}
          </div>)}
      </div>
    </div>
  );
}

// Phase 10: Regierung der Republik Valenheim – Stand aus der TikTok-Serie (shared/serienstand.json)
const AEMTER = [['praesident', 'Präsident'], ['regierungschef', 'Regierungschef'], ['inneres', 'Innenministerium'], ['finanzen', 'Finanzministerium'], ['gesundheit', 'Gesundheitsministerium'], ['verkehr', 'Verkehrsministerium'], ['aussen', 'Außenministerium'], ['bildung', 'Bildungsministerium']];
function Regierung() {
  const R = STAND.regierung || {}; const name = (k) => (k === 'praesident' ? 'Der Gründer der Republik' : R[k] || 'offen');
  return (
    <div className="stack">
      <div className="handy__saldo"><small>Republik {STAND.stadt?.[0]}{STAND.stadt?.slice(1).toLowerCase()} · Stand Folge {STAND.letzte_folge}</small><b>{euro(STAND.stadtkasse || 0)}</b><small>Staatskasse · {STAND.einwohner} Einwohner · Entwicklung {STAND.entwicklung_prozent} %</small></div>
      <div className="eyebrow">Regierung</div>
      <div className="umsaetze">{AEMTER.map(([k, l]) => <div key={k} className="umsatz"><span><b>{l}</b><small>{name(k)}</small></span>{String(R[k] || '').startsWith('offen') && k !== 'praesident' ? <small style={{ color: '#ffb347' }}>frei</small> : <small style={{ color: '#6dff9e' }}>besetzt</small>}</div>)}</div>
      <div className="eyebrow">Im Bau / neu</div>
      <div className="umsaetze">{(STAND.bauliste || []).map((b, i) => <div key={i} className="umsatz"><span><b>{b.was}</b><small>gewünscht von {b.wer}</small></span>{/autohaus/i.test(b.was) ? <small style={{ color: '#6dff9e' }}>im Spiel offen</small> : <small>geplant</small>}</div>)}</div>
      {STAND.ziel?.text && <p className="hinweis">Nächstes Ziel der Community: {STAND.ziel.text}</p>}
      <p className="hinweis">Ämter werden in den TikTok-Folgen vergeben. Kommentiere, wenn du ein freies Ministerium willst!</p>
    </div>
  );
}
