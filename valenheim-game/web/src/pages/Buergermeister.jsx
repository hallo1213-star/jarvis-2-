import { useCallback, useEffect, useState } from 'react';
import Logo from '../ui/Logo.jsx';
import { api, getAdmin, setAdmin } from '../lib/api.js';

const TYPNAME = { erkundung: 'Erkundung', versorgung: 'Versorgung', medizin: 'Medizinische Hilfe', evakuierung: 'Evakuierung', verwaltung: 'Stadtverwaltung' };
const zeit = (t) => new Date(t).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

// Geschützter Verwaltungsbereich. Jede Aktion prüft der Server mit der Bürgermeister-Sitzung.
export default function Buergermeister() {
  const [token, setTok] = useState(getAdmin());
  const [tab, setTab] = useState('uebersicht');
  const logout = async () => { try { await api.admin.logout(); } catch { /* egal */ } setAdmin(null); setTok(null); };
  const onAuthError = useCallback((e) => { if (e.status === 401) { setAdmin(null); setTok(null); } }, []);
  if (!token) return <Login onOk={(t) => { setAdmin(t); setTok(t); }} />;
  return (
    <div className="page page--admin">
      <div className="page__head"><Logo small /><div className="admin__title">BÜRGERMEISTER-DASHBOARD</div><button className="btn btn--ghost btn--inline" onClick={logout}>Abmelden</button></div>
      <div className="tabs">
        {[['uebersicht', 'Übersicht'], ['buerger', 'Bürger'], ['missionen', 'Missionen'], ['ereignisse', 'Ereignisse']].map(([k, l]) => <button key={k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      <div className="wrap wrap--wide">
        {tab === 'uebersicht' && <Uebersicht onAuthError={onAuthError} />}
        {tab === 'buerger' && <Buerger onAuthError={onAuthError} />}
        {tab === 'missionen' && <Missionen onAuthError={onAuthError} />}
        {tab === 'ereignisse' && <Ereignisse onAuthError={onAuthError} />}
      </div>
    </div>
  );
}

function Login({ onOk }) {
  const [pw, setPw] = useState(''); const [fehler, setFehler] = useState(''); const [busy, setBusy] = useState(false); const [eingerichtet, setE] = useState(true);
  useEffect(() => { api.admin.status().then((d) => setE(d.eingerichtet)).catch(() => {}); }, []);
  return (
    <div className="page page--center">
      <Logo small />
      <form className="card login" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setFehler(''); try { const d = await api.admin.login(pw); onOk(d.token); } catch (err) { setFehler(err.message); } finally { setBusy(false); } }}>
        <div className="eyebrow">GESCHÜTZTER BEREICH</div>
        <h1 className="h1 h1--tight">Bürgermeister</h1>
        {!eingerichtet && <div className="error">Noch kein Passwort eingerichtet. Auf dem Server einmal <code>npm run admin:passwort</code> ausführen.</div>}
        <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Passwort" autoComplete="current-password" />
        {fehler && <div className="error">{fehler}</div>}
        <button className="btn btn--gold" disabled={busy || !pw}>ANMELDEN</button>
        <a className="link" href="#/">Zur Startseite</a>
      </form>
    </div>
  );
}

function useLoad(fn, deps, onAuthError, every = 0) {
  const [data, setData] = useState(null); const [fehler, setFehler] = useState('');
  const load = useCallback(() => fn().then((d) => { setData(d); setFehler(''); }).catch((e) => { setFehler(e.message); onAuthError(e); }), deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); if (every) { const id = setInterval(load, every); return () => clearInterval(id); } }, [load, every]);
  return [data, fehler, load];
}

function Uebersicht({ onAuthError }) {
  const [d, fehler] = useLoad(() => api.admin.uebersicht(), [], onAuthError, 10000);
  if (fehler) return <div className="error">{fehler}</div>;
  if (!d) return <div className="spinner" />;
  const s = d.stats; const max = Math.max(1, ...s.pro_tag.map((x) => x.n));
  return (
    <>
      <div className="stats stats--admin">
        {[['REGISTRIERTE BÜRGER', s.buerger], ['JETZT ONLINE', d.online.length], ['AKTIV (24 H)', s.aktiv_24h], ['NEU (24 H)', s.neu_24h], ['MISSIONEN GESAMT', s.missionen_gesamt], ['MISSIONEN (24 H)', s.missionen_24h], ['PUNKTE GESAMT', s.punkte_gesamt.toLocaleString('de-DE')], ['SPIELZEIT GESAMT', `${s.spielzeit_h} h`]].map(([l, v]) => <div key={l} className="stat"><small>{l}</small><b>{v}</b></div>)}
      </div>
      <div className="grid2">
        <div className="card"><div className="eyebrow">MISSIONEN PRO TAG (14 TAGE)</div>
          {s.pro_tag.length === 0 ? <p className="sub">Noch keine Daten.</p> : <div className="bars">{s.pro_tag.map((x) => <div key={x.tag} className="bars__col" title={`${x.tag}: ${x.n}`}><div style={{ height: `${(x.n / max) * 100}%` }} /><small>{x.tag.slice(8)}.</small></div>)}</div>}
        </div>
        <div className="card"><div className="eyebrow">BELIEBTESTE MISSIONEN</div>
          {s.beliebt.length === 0 ? <p className="sub">Noch keine Daten.</p> : <div className="list">{s.beliebt.map((m) => <div key={m.id} className="list__row"><span>{m.titel || m.id}</span><b>{m.n}×</b></div>)}</div>}
        </div>
        <div className="card"><div className="eyebrow">ONLINE ({d.online.length})</div>
          {d.online.length === 0 ? <p className="sub">Gerade niemand online.</p> : <div className="list">{d.online.map((o) => <div key={o.id} className="list__row"><span>{o.name}</span><span className="sub">{o.mission || '—'}</span><span className="sub">{o.raum}</span></div>)}</div>}
        </div>
        <div className="card"><div className="eyebrow">PROTOKOLL</div>
          <div className="list">{d.log.map((l) => <div key={l.id} className="list__row"><span className="sub">{zeit(l.at)}</span><span>{l.aktion}</span><span className="sub">{l.ziel}</span></div>)}</div>
        </div>
      </div>
    </>
  );
}

function Buerger({ onAuthError }) {
  const [q, setQ] = useState(''); const [seite, setSeite] = useState(0); const [sel, setSel] = useState(null);
  const [d, fehler, reload] = useLoad(() => api.admin.buerger(q, seite), [q, seite], onAuthError);
  return (
    <>
      <input className="input" value={q} onChange={(e) => { setQ(e.target.value); setSeite(0); }} placeholder="Bürger suchen …" />
      {fehler && <div className="error">{fehler}</div>}
      {d && (
        <div className="table table--admin">
          <div className="table__row table__row--head"><span>Name</span><span>Level</span><span>Missionen</span><span>Punkte</span><span>Status</span></div>
          {d.liste.map((p) => <button key={p.id} className="table__row" onClick={() => setSel(p.id)}><span className="table__name">{p.name}</span><span>{p.level}</span><span>{p.missions}</span><b>{p.points.toLocaleString('de-DE')}</b><span className={p.banned ? 'is-red' : 'sub'}>{p.banned ? 'gesperrt' : 'aktiv'}</span></button>)}
          <div className="row-between"><span className="sub">{d.gesamt} Bürger</span><span><button className="link" disabled={seite === 0} onClick={() => setSeite(seite - 1)}>← zurück</button> <button className="link" disabled={(seite + 1) * 50 >= d.gesamt} onClick={() => setSeite(seite + 1)}>weiter →</button></span></div>
        </div>
      )}
      {sel && <BuergerDetail id={sel} onClose={() => { setSel(null); reload(); }} onAuthError={onAuthError} />}
    </>
  );
}

function BuergerDetail({ id, onClose, onAuthError }) {
  const [d, fehler, reload] = useLoad(() => api.admin.buergerDetail(id), [id], onAuthError);
  const [delta, setDelta] = useState(''); const [grund, setGrund] = useState(''); const [msg, setMsg] = useState('');
  const act = async (f) => { setMsg(''); try { await f(); setMsg('Gespeichert.'); reload(); } catch (e) { setMsg(e.message); onAuthError(e); } };
  const p = d?.profil;
  return (
    <div className="overlay overlay--page" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card modal">
        {fehler && <div className="error">{fehler}</div>}
        {!p ? <div className="spinner" /> : (
          <>
            <div className="row-between"><div><div className="eyebrow">BÜRGER {p.online ? '· ONLINE' : ''}</div><h2 className="h1 h1--tight">{p.name}</h2></div><button className="link" onClick={onClose}>Schließen</button></div>
            <div className="stats"><div className="stat"><small>RANG</small><b>{p.rang ? `#${p.rang}` : '–'}</b></div><div className="stat"><small>PUNKTE</small><b>{p.points}</b></div><div className="stat"><small>LEVEL</small><b>{p.level}</b></div><div className="stat"><small>MISSIONEN</small><b>{p.missions}</b></div></div>
            <div className="eyebrow">PUNKTE KORRIGIEREN</div>
            <div className="formrow"><input className="input" type="number" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="z. B. -100 oder 50" /><input className="input" value={grund} onChange={(e) => setGrund(e.target.value)} placeholder="Grund (Pflicht)" /></div>
            <button className="btn btn--gold" disabled={!delta || grund.trim().length < 3} onClick={() => act(() => api.admin.punkte(id, +delta, grund))}>PUNKTE ÄNDERN</button>
            <button className={`btn ${p.gesperrt ? 'btn--ghost' : 'btn--danger'}`} onClick={() => { if (p.gesperrt || confirm(`${p.name} wirklich sperren? Die Person wird sofort aus dem Spiel entfernt.`)) act(() => api.admin.sperre(id, !p.gesperrt, grund)); }}>{p.gesperrt ? 'ENTSPERREN' : 'SPERREN'}</button>
            {msg && <p className="sub">{msg}</p>}
            <div className="eyebrow" style={{ marginTop: 18 }}>LETZTE MISSIONEN</div>
            <div className="list">{p.letzte.length === 0 ? <span className="sub">Keine.</span> : p.letzte.map((m, i) => <div key={i} className="list__row"><span>{m.titel || m.mission_id}</span><span className="sub">{zeit(m.at)} · {m.dauer_s} s</span><b>+{m.punkte}</b></div>)}</div>
          </>
        )}
      </div>
    </div>
  );
}

const LEER = { typ: 'versorgung', titel: '', beschreibung: '', punkte: 100, von: 'lager', nach: 'rathaus', zeit: '', anzahl: 3, aktiv: true };
function Missionen({ onAuthError }) {
  const [d, fehler, reload] = useLoad(() => api.admin.missionen(), [], onAuthError);
  const [edit, setEdit] = useState(null); const [msg, setMsg] = useState('');
  const save = async () => { setMsg(''); try { await api.admin.missionSpeichern({ ...edit, punkte: +edit.punkte, zeit: edit.zeit ? +edit.zeit : null }); setEdit(null); reload(); } catch (e) { setMsg(e.message); onAuthError(e); } };
  if (fehler) return <div className="error">{fehler}</div>;
  if (!d) return <div className="spinner" />;
  const transport = edit && ['versorgung', 'medizin'].includes(edit.typ);
  return (
    <>
      <button className="btn btn--gold btn--inline" onClick={() => setEdit({ ...LEER })}>+ NEUE MISSION</button>
      <div className="table table--admin">
        <div className="table__row table__row--head"><span>Titel</span><span>Typ</span><span>Punkte</span><span>Status</span><span /></div>
        {d.liste.map((m) => (
          <div key={m.id} className="table__row">
            <span className="table__name">{m.titel}</span><span className="sub">{TYPNAME[m.typ]}</span><b>{m.punkte}</b>
            <button className={`pill ${m.aktiv ? 'pill--on' : ''}`} onClick={async () => { try { await api.admin.missionAktiv(m.id, !m.aktiv); reload(); } catch (e) { onAuthError(e); } }}>{m.aktiv ? 'aktiv' : 'deaktiviert'}</button>
            <button className="link" onClick={() => setEdit({ ...LEER, ...m, ...m.params, zeit: m.params.zeit || '' })}>Bearbeiten</button>
          </div>
        ))}
      </div>
      {edit && (
        <div className="overlay overlay--page" onClick={(e) => e.target === e.currentTarget && setEdit(null)}>
          <div className="card modal">
            <div className="eyebrow">{edit.id ? 'MISSION BEARBEITEN' : 'NEUE MISSION'}</div>
            <label className="lbl">Typ<select className="input" value={edit.typ} onChange={(e) => setEdit({ ...edit, typ: e.target.value })}>{d.typen.map((t) => <option key={t} value={t}>{TYPNAME[t]}</option>)}</select></label>
            <label className="lbl">Titel<input className="input" value={edit.titel} onChange={(e) => setEdit({ ...edit, titel: e.target.value })} maxLength={60} /></label>
            <label className="lbl">Beschreibung<textarea className="input" rows={3} value={edit.beschreibung} onChange={(e) => setEdit({ ...edit, beschreibung: e.target.value })} maxLength={300} /></label>
            <label className="lbl">Punkte<input className="input" type="number" value={edit.punkte} onChange={(e) => setEdit({ ...edit, punkte: e.target.value })} /></label>
            {transport ? (
              <div className="formrow">
                <label className="lbl">Abholen bei<select className="input" value={edit.von} onChange={(e) => setEdit({ ...edit, von: e.target.value })}>{d.orte.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}</select></label>
                <label className="lbl">Bringen zu<select className="input" value={edit.nach} onChange={(e) => setEdit({ ...edit, nach: e.target.value })}>{d.orte.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}</select></label>
                <label className="lbl">Zeitlimit (s, optional)<input className="input" type="number" value={edit.zeit} onChange={(e) => setEdit({ ...edit, zeit: e.target.value })} /></label>
              </div>
            ) : (
              <label className="lbl">{edit.typ === 'evakuierung' ? 'Anzahl Einwohner' : edit.typ === 'erkundung' ? 'Anzahl Orte' : 'Anzahl Aushänge'}<input className="input" type="number" min={1} max={6} value={edit.anzahl} onChange={(e) => setEdit({ ...edit, anzahl: e.target.value })} /></label>
            )}
            {msg && <div className="error">{msg}</div>}
            <button className="btn btn--gold" onClick={save}>SPEICHERN</button>
            <button className="btn btn--ghost" onClick={() => setEdit(null)}>Abbrechen</button>
          </div>
        </div>
      )}
    </>
  );
}

const EREIGNISSE = [
  ['sirene', '🚨', 'Sirenen auslösen', 'Sirenen in der ganzen Stadt + Warnhinweis'],
  ['stromausfall', '💡', 'Stromausfall', 'Stadt wird dunkel, Laternen flackern'],
  ['regen', '🌧️', 'Regen', 'Regen und dunkler Himmel'],
  ['nebel', '🌫️', 'Nebel', 'Dichter Nebel, kurze Sichtweite'],
  ['klar', '☀️', 'Wetter klar', 'Wetter zurücksetzen'],
];
function Ereignisse({ onAuthError }) {
  const [text, setText] = useState('Die Bevölkerung wird gebeten, Ruhe zu bewahren und die aktuellen Sicherheitshinweise zu beachten.');
  const [radio, setRadio] = useState(''); const [dauer, setDauer] = useState(60); const [msg, setMsg] = useState('');
  const send = async (typ, t) => { setMsg(''); try { const d = await api.admin.ereignis(typ, t, dauer); setMsg(`Gesendet an ${d.empfaenger} Spieler.`); } catch (e) { setMsg(e.message); onAuthError(e); } };
  return (
    <div className="grid2">
      <div className="card">
        <div className="eyebrow">OFFIZIELLE MELDUNG</div>
        <textarea className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={240} />
        <button className="btn btn--gold" onClick={() => send('meldung', text)}>MELDUNG VERÖFFENTLICHEN</button>
        <div className="eyebrow" style={{ marginTop: 18 }}>RADIO VALENHEIM (LAUFTEXT)</div>
        <input className="input" value={radio} onChange={(e) => setRadio(e.target.value)} maxLength={240} placeholder="z. B. Die Ausgabestelle am Rathaus ist geöffnet." />
        <button className="btn btn--ghost" onClick={() => send('radio', radio)}>IM RADIO SENDEN</button>
      </div>
      <div className="card">
        <div className="eyebrow">STADT-EREIGNISSE</div>
        <label className="lbl">Dauer (Sekunden)<input className="input" type="number" min={5} max={600} value={dauer} onChange={(e) => setDauer(+e.target.value)} /></label>
        <div className="events">{EREIGNISSE.map(([k, i, t, s]) => <button key={k} className="event" onClick={() => send(k, '')}><span>{i}</span><b>{t}</b><small>{s}</small></button>)}</div>
        {msg && <p className="sub">{msg}</p>}
      </div>
    </div>
  );
}
