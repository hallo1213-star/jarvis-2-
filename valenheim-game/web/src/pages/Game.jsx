import { useEffect, useRef, useState } from 'react';
import { Engine, QUALITY, defaultQuality } from '../game/engine.js';
import Minimap from '../ui/Minimap.jsx';
import { Emblem } from '../ui/Logo.jsx';
import { Net, EMOTE_TEXT } from '../game/net.js';
import { MissionClient } from '../game/missions.js';
import { Atmosphere } from '../game/atmosphere.js';

const TYP = { erkundung: ['🧭', 'Erkundung'], versorgung: ['📦', 'Versorgung'], medizin: ['🩺', 'Medizinische Hilfe'], evakuierung: ['🚸', 'Evakuierung'], verwaltung: ['📋', 'Stadtverwaltung'] };

const TIPPS = [
  'Halte Shift (PC) oder schiebe den Joystick ganz nach außen, um zu rennen.',
  'Mit Leertaste springst du – zum Beispiel auf den Bordstein.',
  'Das Militärgelände im Norden ist Sperrgebiet.',
  'Am Bahnhof im Westen fahren die Züge nach Valenheim.',
  'Missionen findest du an den Missionstafeln mit dem goldenen Ring.',
  'Am Rathausplatz stehen Autos – mit E steigst du ein.',
  'Den Rettungswagen findest du an der Rettungsstation im Osten.',
  'Hilfst du anderen Spielern in der Nähe, bekommst du einen Teamwork-Bonus.',
];

export default function Game({ profil, onExit }) {
  const canvas = useRef(null);
  const [engine, setEngine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tipp] = useState(() => TIPPS[Math.floor(Math.random() * TIPPS.length)]);
  const [district, setDistrict] = useState(null);
  const [toast, setToast] = useState(null);
  const [menu, setMenu] = useState(false);
  const [fps, setFps] = useState(0);
  const [quality, setQuality] = useState(defaultQuality());
  const [joy, setJoy] = useState(null);
  const [run, setRun] = useState(false);
  const [carPrompt, setCarPrompt] = useState(null);
  const [inCar, setInCar] = useState(null);
  const [kmh, setKmh] = useState(0);
  const [net, setNet] = useState({ status: 'verbinde', room: '', online: 0 });
  const [feed, setFeed] = useState([]);
  const [emotes, setEmotes] = useState(false);
  const netRef = useRef(null);
  const msRef = useRef(null);
  const [me, setMe] = useState(profil);
  const [mList, setMList] = useState(null);
  const [mission, setMission] = useState(null);
  const [prompt, setPrompt] = useState(null);
  const [dist, setDist] = useState(null);
  const [info, setInfo] = useState(null);
  const [done, setDone] = useState(null);
  const [now, setNow] = useState(Date.now());
  const atmoRef = useRef(null);
  const [meldung, setMeldung] = useState(null);
  const [radio, setRadio] = useState(null);
  const [welt, setWelt] = useState(null);
  const [ton, setTon] = useState(() => { try { return localStorage.getItem('vh_ton') !== 'aus'; } catch { return true; } });
  const isTouch = typeof window !== 'undefined' && (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window);

  useEffect(() => {
    let eng; let alive = true; const t0 = performance.now();
    // Kurz warten, damit der Ladebildschirm sichtbar ist, dann Stadt aufbauen
    const id = setTimeout(() => {
      eng = new Engine(canvas.current, {
        mode: 'play', quality, player: profil,
        onDistrict: (d, info) => { setDistrict(info); setToast({ ...info, k: Date.now() }); },
        onStats: (s) => { setFps(s.fps); },
      });
      setEngine(eng);
      eng.onCarPrompt = setCarPrompt; eng.onVehicle = (v) => setInCar(v ? { type: v.type } : null);
      atmoRef.current = new Atmosphere(eng);
      const onEvent = (ev) => {
        atmoRef.current.event(ev);
        const bis = Date.now() + (ev.rest ?? ev.dauer) * 1000;
        if (ev.typ === 'meldung') setMeldung({ titel: 'VALENHEIM – OFFIZIELLE MELDUNG', text: ev.text, bis: Date.now() + Math.min(25, Math.max(10, ev.dauer)) * 1000, k: Date.now() });
        if (ev.typ === 'sirene') setMeldung({ titel: 'WARNUNG – SIRENENALARM', text: ev.text || 'Bitte Ruhe bewahren und die Sicherheitshinweise beachten.', bis, alarm: true, k: Date.now() });
        if (ev.typ === 'radio') setRadio({ text: ev.text, bis, k: Date.now() });
      };
      netRef.current = new Net(eng, {
        welt: (w) => { if (w.wetter) onEvent({ typ: w.wetter.typ, rest: w.wetter.rest }); if (w.strom) onEvent({ typ: 'stromausfall', rest: w.strom.rest }); },
        status: (st, room) => setNet((n) => ({ ...n, status: st, room: room || n.room })),
        online: (n) => setNet((x) => ({ ...x, online: n })),
        feed: (text) => setFeed((f) => [...f.slice(-3), { text, k: Date.now() + Math.random() }]),
        message: (m) => {
          if (msRef.current?.handle(m)) return;
          if (m.t === 'event') onEvent(m);
          if (m.t === 'profil') { setMe(m.profil); setInfo({ text: m.text, k: Date.now() }); }
        },
      });
      msRef.current = new MissionClient(eng, netRef.current, {
        list: (list, cooldown) => setMList({ list, cooldown }),
        state: (m) => { setMission(m); if (m) setMList(null); },
        done: (m) => { setMe(m.profil); setDone({ ...m, k: Date.now() }); atmoRef.current?.audio.success(); },
        bonus: (m) => { setMe(m.profil); setInfo({ text: `Teamwork-Bonus +${m.punkte}: du hast ${m.wer} geholfen!`, k: Date.now() }); },
        info: (text, bad) => setInfo({ text, bad, k: Date.now() }),
        prompt: setPrompt,
        distance: setDist,
      });
      setTimeout(() => alive && setLoading(false), Math.max(0, 1400 - (performance.now() - t0)));
    }, 60);
    return () => { alive = false; clearTimeout(id); atmoRef.current?.dispose(); msRef.current?.dispose(); netRef.current?.dispose(); eng?.dispose(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const mListRef = useRef(null); mListRef.current = mList;
  useEffect(() => { if (!info) return; const id = setTimeout(() => setInfo(null), 3400); return () => clearTimeout(id); }, [info]);
  useEffect(() => { if (!done) return; const id = setTimeout(() => setDone(null), 4200); return () => clearTimeout(id); }, [done]);
  useEffect(() => { if (!mission?.deadline) return; const id = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(id); }, [mission]);
  useEffect(() => { if (engine?.input) engine.input.enabled = !menu && !mList; if (mList && document.pointerLockElement) document.exitPointerLock(); }, [mList, menu, engine]);

  // Uhrzeit/Wetter-Anzeige, Meldungen ausblenden, Ton nach erster Berührung starten
  useEffect(() => {
    const sp = setInterval(() => setKmh(window.VH?.speedKmh || 0), 150);
    const id = setInterval(() => { const a = atmoRef.current; if (a?.state) setWelt({ ...a.state }); const n = Date.now(); setMeldung((m) => (m && n > m.bis ? null : m)); setRadio((r) => (r && n > r.bis ? null : r)); }, 1000);
    const wake = () => atmoRef.current?.audio.resume(); addEventListener('pointerdown', wake); addEventListener('keydown', wake);
    return () => { clearInterval(id); clearInterval(sp); removeEventListener('pointerdown', wake); removeEventListener('keydown', wake); };
  }, []);

  // Escape → Menü
  useEffect(() => {
    const k = (e) => {
      if (e.code === 'KeyH' && window.VH?.vehicle?.type === 'rtw') window.VH.vehicle.siren = !window.VH.vehicle.siren;
      if (e.code === 'Escape') { if (mListRef.current) { setMList(null); return; } setMenu((m) => !m); }
      const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].indexOf(e.code);
      if (n >= 0 && e.target.tagName !== 'INPUT') netRef.current?.emote(Object.keys(EMOTE_TEXT)[n]);
    };
    const pl = () => { if (!document.pointerLockElement && !isTouch && engine && !loading) setMenu(true); };
    addEventListener('keydown', k); document.addEventListener('pointerlockchange', pl);
    return () => { removeEventListener('keydown', k); document.removeEventListener('pointerlockchange', pl); };
  }, [engine, loading, isTouch]);
  useEffect(() => { if (engine?.input) { engine.input.enabled = !menu; if (menu && document.pointerLockElement) document.exitPointerLock(); } }, [menu, engine]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 2600); return () => clearTimeout(id); }, [toast]);
  // Joystick-Anzeige
  useEffect(() => { if (!engine?.input || !isTouch) return; let raf; const f = () => { setJoy(engine.input.joystick()); raf = requestAnimationFrame(f); }; f(); return () => cancelAnimationFrame(raf); }, [engine, isTouch]);
  useEffect(() => { if (engine?.input) engine.input.runToggle = run; }, [run, engine]);

  return (
    <div className="game">
      <canvas ref={canvas} className="game__canvas" />

      {!loading && (
        <>
          <div className="hud hud--tl">
            <div className="pcard">
              <Emblem size={34} />
              <div>
                <div className="pcard__name">{profil.name}</div>
                <div className="pcard__meta">Level {me.level} · {me.points} Punkte</div>
              </div>
            </div>
            {district && <div className="chip" style={{ '--c': district.farbe }}>{district.name}</div>}
          </div>
          <div className="hud hud--tr">
            <Minimap engine={engine} />
            {welt && <div className="chip chip--clock">{String(Math.floor(welt.uhr)).padStart(2, '0')}:{String(Math.floor((welt.uhr % 1) * 60)).padStart(2, '0')} {welt.nacht ? '🌙' : '☀️'}{welt.regen ? ' 🌧️' : ''}{welt.nebel ? ' 🌫️' : ''}{!welt.strom ? ' ⚡ Stromausfall' : ''}</div>}
            <div className={`chip ${net.status === 'online' ? '' : 'chip--warn'}`} style={{ '--c': net.status === 'online' ? '#3cff8f' : '#e05a5a' }}>
              {net.status === 'online' ? `${net.online} online · ${net.room}` : net.status === 'doppelt' ? 'Auf anderem Gerät angemeldet' : net.status === 'gesperrt' ? 'Konto gesperrt' : 'Verbinde mit Server …'}
            </div>
          </div>
          {mission && (
            <div className="mcard">
              <div className="mcard__top"><span>{TYP[mission.typ]?.[0]} {TYP[mission.typ]?.[1].toUpperCase()}</span><b>+{mission.punkte}</b></div>
              <div className="mcard__title">{mission.titel}</div>
              <div className="mcard__text">{mission.text}</div>
              <div className="mcard__meta">
                {dist != null && mission.ziel && <span>📍 {dist} m</span>}
                {mission.deadline && <span className={mission.deadline - now < 30000 ? 'is-red' : ''}>⏱ {Math.max(0, Math.ceil((mission.deadline - now) / 1000))} s</span>}
                <button className="link" onClick={() => msRef.current?.abort()}>Abbrechen</button>
              </div>
            </div>
          )}
          {!mission && <div className="mcard mcard--idle">Gehe zu einer <b>Missionstafel</b> (goldener Ring), um eine Mission anzunehmen.</div>}
          {inCar && <div className="speedo"><b>{kmh}</b><small>km/h</small></div>}
          {!inCar && carPrompt && !prompt && (isTouch ? <button className="tbtn tbtn--act" onClick={() => engine?.toggleVehicle()}>{carPrompt}</button> : <div className="prompt"><kbd>E</kbd> {carPrompt}</div>)}
          {inCar && !isTouch && <div className="hint-bar">W Gas · S Bremse/Rückwärts · A/D Lenken · Leertaste Handbremse{inCar.type === 'rtw' ? ' · H Blaulicht' : ''} · E Aussteigen</div>}
          {!inCar && prompt && (isTouch ? <button className="tbtn tbtn--act" onClick={() => msRef.current?.interact()}>{prompt}</button> : <div className="prompt"><kbd>E</kbd> {prompt}</div>)}
          {info && <div key={info.k} className={`info ${info.bad ? 'info--bad' : ''}`}>{info.text}</div>}
          {done && <div key={done.k} className="done"><small>MISSION ERFÜLLT</small><div>{done.titel}</div><b>+{done.punkte} PUNKTE</b></div>}
          <div className="feed">{feed.map((f) => <div key={f.k} className="feed__item">{f.text}</div>)}</div>
          {emotes && (
            <div className="emotes">
              {Object.entries(EMOTE_TEXT).map(([k, t], i) => <button key={k} onClick={() => { netRef.current?.emote(k); setEmotes(false); }}>{!isTouch && <kbd>{i + 1}</kbd>}{t}</button>)}
            </div>
          )}
          <button className="tbtn tbtn--emote" onClick={() => setEmotes(!emotes)} aria-label="Schnellnachrichten">💬</button>
          {meldung && <div key={meldung.k} className={`meldung ${meldung.alarm ? 'meldung--alarm' : ''}`}><Emblem size={30} /><div><small>{meldung.titel}</small><p>{meldung.text}</p></div></div>}
          {welt?.sirene && <div className="alarm-vignette" />}
          {radio && <div className="radio"><b>📻 RADIO VALENHEIM</b><div className="radio__track"><span key={radio.k}>{radio.text} · {radio.text}</span></div></div>}
          {toast && <div key={toast.k} className="toast" style={{ '--c': toast.farbe }}><small>DU BETRITTST</small>{toast.name}</div>}
          {!isTouch && !menu && !inCar && <div className="hint-bar">Klicken zum Umsehen · WASD laufen · Shift rennen · Leertaste springen · E Interagieren · 1–6 Nachrichten · Esc Menü</div>}
          {isTouch && (
            <>
              {joy && <div className="joy" style={{ left: joy.ox, top: joy.oy }}><div className="joy__knob" style={{ transform: `translate(${joy.kx}px, ${joy.ky}px)` }} /></div>}
              {!joy && <div className="joy-hint">Links ziehen zum Laufen · rechts wischen zum Umsehen</div>}
              {inCar ? (
                <>
                  <button className="tbtn tbtn--run" onClick={() => engine?.toggleVehicle()}>AUS&shy;STEIGEN</button>
                  <button className="tbtn tbtn--jump" onTouchStart={(e) => { e.preventDefault(); if (engine?.input) engine.input.handTouch = true; }} onTouchEnd={() => { if (engine?.input) engine.input.handTouch = false; }}>BREMSE</button>
                  {inCar.type === 'rtw' && <button className="tbtn tbtn--siren" onClick={() => { if (engine?.vehicle) engine.vehicle.siren = !engine.vehicle.siren; }}>🚨</button>}
                </>
              ) : (
                <>
                  <button className={`tbtn tbtn--run ${run ? 'is-on' : ''}`} onClick={() => setRun(!run)}>RENNEN</button>
                  <button className="tbtn tbtn--jump" onTouchStart={(e) => { e.preventDefault(); if (engine?.input) engine.input.jump = true; }}>SPRUNG</button>
                </>
              )}
              <button className="tbtn tbtn--menu" onClick={() => setMenu(true)} aria-label="Menü">☰</button>
            </>
          )}
          <div className="fps">{fps} FPS</div>
        </>
      )}

      {mList && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setMList(null)}>
          <div className="card mlist">
            <div className="eyebrow">MISSIONSTAFEL</div>
            <h2>Wobei hilfst du Valenheim?</h2>
            {mList.cooldown > 0 && <div className="error">Kurze Pause – neue Mission in {Math.ceil(mList.cooldown / 1000)} s.</div>}
            <div className="mlist__items">
              {mList.list.map((m) => (
                <button key={m.id} className="mitem" onClick={() => msRef.current?.accept(m.id)}>
                  <span className="mitem__icon">{TYP[m.typ]?.[0]}</span>
                  <span className="mitem__body"><b>{m.titel}</b><small>{m.beschreibung}{m.zeit ? ` · Zeitlimit ${Math.round(m.zeit / 60)} min` : ''}</small></span>
                  <span className="mitem__pts">+{m.punkte}</span>
                </button>
              ))}
            </div>
            <button className="btn btn--ghost" onClick={() => setMList(null)}>Schließen</button>
          </div>
        </div>
      )}

      {menu && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setMenu(false)}>
          <div className="card menu">
            <div className="eyebrow">MENÜ</div>
            <button className="btn btn--gold" onClick={() => setMenu(false)}>WEITERSPIELEN</button>
            <div className="menu__row">
              <span>Grafik</span>
              <div className="seg">
                {Object.keys(QUALITY).map((q) => <button key={q} className={q === quality ? 'is-on' : ''} onClick={() => { setQuality(q); engine?.setQuality(q); }}>{q[0].toUpperCase() + q.slice(1)}</button>)}
              </div>
            </div>
            <div className="menu__row"><span>Ton</span><div className="seg"><button className={ton ? 'is-on' : ''} onClick={() => { setTon(true); atmoRef.current?.audio.setEnabled(true); }}>An</button><button className={!ton ? 'is-on' : ''} onClick={() => { setTon(false); atmoRef.current?.audio.setEnabled(false); }}>Aus</button></div></div>
            <a className="btn btn--ghost" href="#/rangliste">Rangliste</a>
            <a className="btn btn--ghost" href="#/profil">Mein Profil</a>
            <button className="btn btn--ghost" onClick={onExit}>Stadt verlassen</button>
          </div>
        </div>
      )}

      {loading && (
        <div className="loader">
          <Emblem size={120} />
          <div className="loader__title">VALENHEIM WIRD GELADEN</div>
          <div className="loader__bar"><div /></div>
          <div className="loader__tip">{tipp}</div>
        </div>
      )}
    </div>
  );
}
