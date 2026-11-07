import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Search, X, Navigation, Settings, Camera, Crosshair, Box, Map as MapIcon, Mic, Send, Loader2,
  Play, Square, Volume2, VolumeX, Clock, Route as RouteIcon, MapPin, Sparkles, KeyRound, Trash2,
} from 'lucide-react'
import MapView from './components/MapView.jsx'
import Radar from './components/Radar.jsx'
import { ManeuverIcon, NovaOrb } from './components/Icons.jsx'
import { searchPlaces, fetchRoutes, fetchSpeedLimit, reverseGeocode } from './lib/services.js'
import { distance, bearing, destination, snapToLine, pointAlong, formatDistance, formatDuration, formatClock } from './lib/geo.js'
import { speak, stopSpeaking, listen, canListen, beep } from './lib/voice.js'
import { NovaAI } from './lib/ai.js'

const CarVision = lazy(() => import('./components/CarVision.jsx'))

// ---------- settings ----------
const DEFAULTS = { apiKey: '', voice: true, aiSpeaks: true, mode3d: true, simSpeed: 50 }
function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('nova-settings') || '{}') } } catch { return DEFAULTS }
}
function saveSettings(s) { try { localStorage.setItem('nova-settings', JSON.stringify(s)) } catch { /* private mode */ } }

const ai = new NovaAI()

export default function App() {
  const mapRef = useRef(null)
  const [settings, setSettingsState] = useState(loadSettings)
  const setSettings = (patch) => setSettingsState((s) => { const n = { ...s, ...patch }; saveSettings(n); return n })

  // ---------- position ----------
  const [pos, setPos] = useState(null) // [lng, lat]
  const [heading, setHeading] = useState(0)
  const [speed, setSpeed] = useState(0) // m/s
  const [gpsState, setGpsState] = useState('wait') // wait | ok | denied | none
  const [sim, setSim] = useState(false)
  const simRef = useRef(false)
  simRef.current = sim
  const lastFix = useRef(null)

  useEffect(() => {
    if (!navigator.geolocation) { setGpsState('none'); return }
    const id = navigator.geolocation.watchPosition((p) => {
      setGpsState('ok')
      if (simRef.current) return
      const c = [p.coords.longitude, p.coords.latitude]
      const prev = lastFix.current
      const spd = p.coords.speed ?? (prev ? distance(prev.c, c) / Math.max(0.5, (p.timestamp - prev.t) / 1000) : 0)
      let hd = p.coords.heading
      if ((hd == null || isNaN(hd)) && prev && distance(prev.c, c) > 3) hd = bearing(prev.c, c)
      lastFix.current = { c, t: p.timestamp }
      setPos(c)
      setSpeed(spd || 0)
      if (hd != null && !isNaN(hd) && (spd || 0) > 1) setHeading(hd)
    }, (e) => setGpsState(e.code === 1 ? 'denied' : 'none'), { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 })
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  // fly to first fix
  const flown = useRef(false)
  useEffect(() => {
    if (pos && !flown.current && mapRef.current) { flown.current = true; mapRef.current.flyTo(pos, 15) }
    mapRef.current?.setUser(pos, heading)
  }, [pos, heading])

  const [street, setStreet] = useState('')
  const lastStreetAt = useRef(null)
  useEffect(() => {
    if (!pos) return
    if (lastStreetAt.current && distance(lastStreetAt.current, pos) < 120) return
    lastStreetAt.current = pos
    reverseGeocode(pos).then((r) => r && setStreet(r.name))
  }, [pos])

  // ---------- speed limit ----------
  const [limit, setLimit] = useState(null)
  const lastLimit = useRef({ at: null, t: 0 })
  useEffect(() => {
    if (!pos) return
    const l = lastLimit.current
    if (l.at && (distance(l.at, pos) < 150 || Date.now() - l.t < 12000)) return
    lastLimit.current = { at: pos, t: Date.now() }
    fetchSpeedLimit(pos).then(setLimit).catch(() => {})
  }, [pos])
  const kmh = Math.round(speed * 3.6)
  const speeding = limit?.value && kmh > limit.value + 3

  // ---------- search ----------
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [recent, setRecent] = useState(() => { try { return JSON.parse(localStorage.getItem('nova-recent') || '[]') } catch { return [] } })
  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try { setResults(await searchPlaces(query, pos || mapRef.current?.center())) } catch { setResults([]) }
      setSearching(false)
    }, 280)
    return () => clearTimeout(t)
  }, [query]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- routing ----------
  const [dest, setDest] = useState(null)
  const [routes, setRoutes] = useState(null)
  const [routeIdx, setRouteIdx] = useState(0)
  const [nav, setNav] = useState(null) // active route
  const [progress, setProgress] = useState(null)
  const [toast, setToast] = useState('')
  const startRef = useRef(null)
  const showToast = (t) => { setToast(t); setTimeout(() => setToast((x) => (x === t ? '' : x)), 3500) }

  const origin = () => pos || mapRef.current?.center()

  const planRoute = useCallback(async (place) => {
    const from = origin()
    setDest(place)
    setSearchOpen(false)
    setQuery('')
    const nextRecent = [place, ...recent.filter((r) => r.id !== place.id)].slice(0, 6)
    setRecent(nextRecent)
    try { localStorage.setItem('nova-recent', JSON.stringify(nextRecent)) } catch { /* ignore */ }
    mapRef.current.setDestination(place.coord)
    const rs = await fetchRoutes(from, place.coord)
    startRef.current = from
    setRoutes(rs)
    setRouteIdx(0)
    return rs
  }, [pos, recent]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!routes || nav) return
    const sel = routes[routeIdx]
    mapRef.current.setRoute(sel.geometry)
    mapRef.current.setAlternatives(routes.filter((_, i) => i !== routeIdx).map((r) => r.geometry))
    mapRef.current.setDone(null)
    mapRef.current.fitRoute(sel.geometry, { top: 140, bottom: 320, left: 40, right: 40 })
  }, [routes, routeIdx, nav])

  const announced = useRef({})
  const startNav = (route, simulate = false, destName = dest?.name) => {
    announced.current = {}
    setNav(route)
    setRoutes(null)
    mapRef.current.setAlternatives(null)
    mapRef.current.setRoute(route.geometry)
    setSim(simulate)
    setFollow(true)
    if (simulate) { simAlong.current = 0; setPos(route.geometry[0]) }
    if (settings.voice) speak(`Los geht's. ${formatDuration(route.duration)} bis ${destName || 'zum Ziel'}. ${route.steps[1]?.text || ''}`)
  }

  const endNav = (msg) => {
    setNav(null)
    setProgress(null)
    setRoutes(null)
    setDest(null)
    setSim(false)
    mapRef.current.setRoute(null)
    mapRef.current.setDone(null)
    mapRef.current.setAlternatives(null)
    mapRef.current.setDestination(null)
    if (msg) showToast(msg)
  }

  // ---------- simulation (demo drive) ----------
  const simAlong = useRef(0)
  useEffect(() => {
    if (!sim || !nav) return
    let last = performance.now()
    const id = setInterval(() => {
      const now = performance.now()
      const dt = (now - last) / 1000
      last = now
      const step = nav.steps.find((s) => s.startAlong > simAlong.current + 1)
      const toTurn = step ? step.startAlong - simAlong.current : Infinity
      const target = settings.simSpeed / 3.6 * (toTurn < 60 ? 0.5 : 1)
      simAlong.current += target * dt
      const { point, heading: h } = pointAlong(nav.geometry, simAlong.current)
      setPos(point)
      setHeading(h)
      setSpeed(target)
    }, 250)
    return () => clearInterval(id)
  }, [sim, nav, settings.simSpeed])

  // ---------- progress, voice guidance, rerouting ----------
  const offCount = useRef(0)
  const rerouting = useRef(false)
  useEffect(() => {
    if (!nav || !pos) return
    const snap = snapToLine(nav.geometry, pos)
    const total = nav.distance
    const remaining = Math.max(0, total - snap.along)
    const nextIdx = nav.steps.findIndex((s) => s.startAlong > snap.along + 3)
    const next = nextIdx >= 0 ? nav.steps[nextIdx] : nav.steps[nav.steps.length - 1]
    const toNext = next ? next.startAlong - snap.along : remaining
    const remainingTime = nav.duration * (remaining / total)
    setProgress({ remaining, remainingTime, eta: new Date(Date.now() + remainingTime * 1000), next, after: nav.steps[nextIdx + 1], toNext, offset: snap.offset })
    mapRef.current.setDone(nav.geometry.slice(0, snap.index + 1).concat([snap.point]))

    if (remaining < 25) {
      if (settings.voice) speak(`Du hast ${dest?.name || 'dein Ziel'} erreicht.`)
      endNav('Ziel erreicht 🎉')
      return
    }
    // voice announcements: far / near / now
    if (settings.voice && next && nextIdx >= 0) {
      const key = nextIdx
      const a = announced.current[key] || (announced.current[key] = {})
      const far = speed > 22 ? 1500 : speed > 14 ? 800 : 400
      if (!a.far && toNext < far && toNext > 250) { a.far = true; speak(`In ${formatDistance(toNext)}: ${next.text}`) }
      else if (!a.near && toNext <= 250 && toNext > 60) { a.near = true; a.far = true; speak(`In ${formatDistance(toNext)} ${next.text}`) }
      else if (!a.now && toNext <= 60) { a.now = a.near = a.far = true; speak(next.text) }
    }
    // off route → recalculate
    if (!sim && snap.offset > 45) {
      offCount.current++
      if (offCount.current >= 3 && !rerouting.current && dest) {
        rerouting.current = true
        offCount.current = 0
        if (settings.voice) speak('Route wird neu berechnet')
        fetchRoutes(pos, dest.coord, { alternatives: false }).then((rs) => {
          announced.current = {}
          setNav(rs[0])
          mapRef.current.setRoute(rs[0].geometry)
        }).catch(() => {}).finally(() => { rerouting.current = false })
      }
    } else offCount.current = 0
  }, [pos, nav]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- camera follow ----------
  const [follow, setFollow] = useState(true)
  useEffect(() => {
    if (!pos || !follow || !nav || !mapRef.current) return
    const h = window.innerHeight
    mapRef.current.follow(pos, heading, speed, settings.mode3d, settings.mode3d ? h * 0.22 : 0)
  }, [pos, heading, follow, nav, settings.mode3d]) // eslint-disable-line react-hooks/exhaustive-deps

  const recenter = () => {
    if (!pos) { showToast(gpsState === 'denied' ? 'Standort-Zugriff ist blockiert' : 'Warte auf GPS …'); return }
    if (nav) setFollow(true)
    else mapRef.current.flyTo(pos, 16)
  }

  // ---------- vehicles ahead (camera) ----------
  const [vision, setVision] = useState(false)
  const [visionFull, setVisionFull] = useState(false)
  const [vehicles, setVehicles] = useState([])
  const posRef = useRef(pos), headingRef = useRef(heading)
  posRef.current = pos; headingRef.current = heading
  const lastBeep = useRef(0)
  const onVehicles = useCallback((list) => {
    setVehicles(list)
    const p = posRef.current
    mapRef.current?.setVehicles(p ? list.filter((v) => v.cls !== 'person').map((v) => ({ level: v.level, coord: destination(p, headingRef.current + v.angle, v.distance) })) : [])
    if (list.some((v) => v.level === 'danger') && Date.now() - lastBeep.current > 1500) { lastBeep.current = Date.now(); beep(980, 120, 3) }
  }, [])
  const lead = useMemo(() => vehicles.filter((v) => v.inLane && v.cls !== 'person').sort((a, b) => a.distance - b.distance)[0], [vehicles])
  const danger = vehicles.some((v) => v.level === 'danger')

  // ---------- NOVA chat ----------
  const [chatOpen, setChatOpen] = useState(false)
  const [chat, setChat] = useState([{ role: 'assistant', text: 'Hey, ich bin NOVA. Sag mir, wohin es geht – oder lass uns einfach quatschen. 😎' }])
  const [input, setInput] = useState('')
  const [aiState, setAiState] = useState('idle') // idle | listening | thinking | speaking
  const [toolNote, setToolNote] = useState('')
  const chatEnd = useRef(null)
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth' }) }, [chat, chatOpen])

  const stateRef = useRef({})
  stateRef.current = { pos, speed, limit, street, nav, progress, dest, vehicles, planRoute, startNav }

  const runTool = async (name, input) => {
    const s = stateRef.current
    if (name === 'search_places') {
      const r = await searchPlaces(input.query, s.pos || mapRef.current.center(), 6)
      return r.map((x) => ({ name: x.name, adresse: x.sub, entfernung: x.dist != null ? formatDistance(x.dist) : null }))
    }
    if (name === 'navigate_to') {
      const r = await searchPlaces(input.destination, s.pos || mapRef.current.center(), 6)
      if (!r.length) return { error: `Nichts gefunden für „${input.destination}“` }
      // prefer a close match when there are several
      const pick = [...r].sort((a, b) => (a.dist ?? 0) - (b.dist ?? 0)).find((x) => (x.dist ?? 0) < 60000) || r[0]
      const rs = await s.planRoute(pick)
      stateRef.current.startNav(rs[0], false, pick.name)
      return { ziel: pick.name, adresse: pick.sub, entfernung: formatDistance(rs[0].distance), fahrzeit: formatDuration(rs[0].duration), status: 'Navigation gestartet' }
    }
    if (name === 'stop_navigation') { endNav('Navigation beendet'); return { status: 'beendet' } }
    if (name === 'get_trip_status') return tripStatus(s)
    return { error: 'unbekanntes Tool' }
  }

  const sendToNova = async (text, viaVoice = false) => {
    if (!text.trim()) return
    setChat((c) => [...c, { role: 'user', text }, { role: 'assistant', text: '', pending: true }])
    setInput('')
    if (!settings.apiKey) {
      setChat((c) => [...c.slice(0, -1), { role: 'assistant', text: 'Damit ich antworten kann, brauche ich einen Claude-API-Schlüssel. Tippe hier oben auf das Zahnrad ⚙️ und trag ihn ein.', error: true }])
      return
    }
    setAiState('thinking')
    try {
      const reply = await ai.send({
        apiKey: settings.apiKey,
        text,
        context: contextLine(stateRef.current),
        runTool,
        onText: (t) => setChat((c) => [...c.slice(0, -1), { role: 'assistant', text: t, pending: true }]),
        onTool: (n) => setToolNote({ navigate_to: 'plane Route …', search_places: 'suche Orte …', get_trip_status: 'checke Fahrtdaten …', stop_navigation: 'beende Navigation …', web_search: 'suche im Web …' }[n] || 'arbeite …'),
      })
      setToolNote('')
      setChat((c) => [...c.slice(0, -1), { role: 'assistant', text: reply || '👍' }])
      if (reply && (viaVoice || settings.aiSpeaks)) { setAiState('speaking'); speak(reply); setTimeout(() => setAiState('idle'), Math.min(12000, reply.length * 70)) } else setAiState('idle')
    } catch (e) {
      setToolNote('')
      setChat((c) => [...c.slice(0, -1), { role: 'assistant', text: e.message, error: true }])
      setAiState('idle')
    }
  }

  const talk = async () => {
    if (aiState === 'listening') { listen.stop?.(); return }
    if (!canListen) { setChatOpen(true); showToast('Spracheingabe gibt es in diesem Browser nicht – tipp einfach'); return }
    stopSpeaking()
    setChatOpen(true)
    setAiState('listening')
    try {
      const text = await listen((partial) => setInput(partial))
      setAiState('idle')
      if (text) sendToNova(text, true)
    } catch (e) { setAiState('idle'); showToast(e.message) }
  }

  const [settingsOpen, setSettingsOpen] = useState(false)
  const selRoute = routes?.[routeIdx]

  return (
    <div className={`app ${danger ? 'alarm' : ''} ${nav ? 'navigating' : ''}`}>
      <MapView ref={mapRef} onUserPan={() => setFollow(false)} onLongPress={(c) => planRoute({ id: `pin${c}`, name: 'Markierter Ort', sub: `${c[1].toFixed(5)}, ${c[0].toFixed(5)}`, coord: c }).catch((e) => showToast(e.message))} />
      <div className="vignette" />

      {/* ---------- top ---------- */}
      {!nav && (
        <div className="top">
          <button className="searchbar glass" onClick={() => setSearchOpen(true)}>
            <Search size={20} />
            <span>{dest ? dest.name : 'Wohin geht’s?'}</span>
          </button>
          <button className="icon-btn glass" onClick={() => setSettingsOpen(true)} aria-label="Einstellungen"><Settings size={20} /></button>
        </div>
      )}

      {nav && progress && (
        <div className="maneuver">
          <div className="maneuver-main glass-strong">
            <div className="maneuver-icon"><ManeuverIcon icon={progress.next?.icon} /></div>
            <div className="maneuver-text">
              <div className="maneuver-dist">{formatDistance(progress.toNext)}</div>
              <div className="maneuver-instr">{progress.next?.text}</div>
            </div>
          </div>
          {progress.after && (
            <div className="maneuver-after glass">
              <span>Danach</span> <ManeuverIcon icon={progress.after.icon} size={20} /> <span className="ellipsis">{progress.after.text}</span>
            </div>
          )}
        </div>
      )}

      {/* ---------- side buttons ---------- */}
      <div className="side">
        <button className={`icon-btn glass ${vision ? 'on' : ''}`} onClick={() => { setVision((v) => !v); setVisionFull(false) }} aria-label="Autos vor dir"><Camera size={20} /></button>
        <button className="icon-btn glass" onClick={() => setSettings({ mode3d: !settings.mode3d })} aria-label="2D/3D">{settings.mode3d ? <Box size={20} /> : <MapIcon size={20} />}</button>
        <button className={`icon-btn glass ${nav && !follow ? 'pulse' : ''}`} onClick={recenter} aria-label="Zentrieren"><Crosshair size={20} /></button>
        {nav && <button className="icon-btn glass" onClick={() => setSettings({ voice: !settings.voice })} aria-label="Ton">{settings.voice ? <Volume2 size={20} /> : <VolumeX size={20} />}</button>}
      </div>

      {/* ---------- camera / vehicles ahead ---------- */}
      {vision && (
        <Suspense fallback={<div className="vision"><div className="vision-msg"><Loader2 className="spin" size={22} /> lade KI …</div></div>}>
          <CarVision speedKmh={kmh} onVehicles={onVehicles} expanded={visionFull} onToggleExpand={() => setVisionFull((v) => !v)} onClose={() => { setVision(false); setVisionFull(false) }}>
            {nav && progress && (
              <div className="ar-hud">
                <ManeuverIcon icon={progress.next?.icon} size={44} />
                <div><b>{formatDistance(progress.toNext)}</b><span>{progress.next?.text}</span></div>
              </div>
            )}
          </CarVision>
        </Suspense>
      )}

      {/* ---------- speed + radar ---------- */}
      {(nav || vision || kmh > 3) && (
        <div className="cluster">
          <div className={`speedo glass-strong ${speeding ? 'over' : ''}`}>
            <b>{kmh}</b><span>km/h</span>
          </div>
          {limit && <div className={`limit ${limit.value ? '' : 'free'}`}>{limit.value ? limit.label : ''}</div>}
          {vision && (
            <div className="lead glass">
              {lead ? (
                <>
                  <div className={`lead-dot ${lead.level}`} />
                  <div><b>{Math.round(lead.distance)} m</b><span>{lead.label} vor dir{lead.ttc ? ` · ${lead.ttc.toFixed(1)} s` : ''}</span></div>
                </>
              ) : <span className="muted">Frei vor dir</span>}
            </div>
          )}
          {vision && <Radar vehicles={vehicles} />}
        </div>
      )}
      {danger && <div className="alarm-banner">ABSTAND! BREMSBEREIT</div>}

      {/* ---------- bottom ---------- */}
      {nav && progress && (
        <div className="tripbar glass-strong">
          <div className="trip-col"><b>{formatClock(progress.eta)}</b><span>Ankunft</span></div>
          <div className="trip-col"><b>{formatDuration(progress.remainingTime)}</b><span>Fahrzeit</span></div>
          <div className="trip-col"><b>{formatDistance(progress.remaining)}</b><span>{street || 'verbleibend'}</span></div>
          <button className="stop-btn" onClick={() => { endNav('Navigation beendet'); stopSpeaking() }} aria-label="Beenden"><X size={22} /></button>
        </div>
      )}

      {routes && selRoute && !nav && (
        <div className="sheet glass-strong preview">
          <div className="sheet-handle" />
          <div className="preview-head">
            <div>
              <h2>{dest?.name}</h2>
              <p className="muted">{dest?.sub}</p>
            </div>
            <button className="icon-btn ghost" onClick={() => endNav()} aria-label="Schließen"><X size={20} /></button>
          </div>
          <div className="alts">
            {routes.map((r, i) => (
              <button key={i} className={`alt ${i === routeIdx ? 'sel' : ''}`} onClick={() => setRouteIdx(i)}>
                <b>{formatDuration(r.duration)}</b>
                <span>{formatDistance(r.distance)}</span>
                <small>{i === 0 ? 'Schnellste' : `über ${r.summary || 'Alternative'}`}</small>
              </button>
            ))}
          </div>
          <div className="preview-actions">
            <button className="btn primary" onClick={() => startNav(selRoute, false)}><Navigation size={18} /> Los geht’s</button>
            <button className="btn" onClick={() => startNav(selRoute, true)}><Play size={18} /> Demo-Fahrt</button>
          </div>
          {!pos && <p className="hint">Kein GPS – Start ist die Kartenmitte.</p>}
        </div>
      )}

      {/* NOVA orb */}
      <button className={`nova-btn ${chatOpen ? 'hidden' : ''}`} onClick={() => setChatOpen(true)} onDoubleClick={talk} aria-label="NOVA öffnen">
        <NovaOrb state={aiState} size={58} />
      </button>

      {/* ---------- chat ---------- */}
      {chatOpen && (
        <div className="sheet glass-strong chat">
          <div className="chat-head">
            <NovaOrb state={aiState} size={34} />
            <div>
              <b>NOVA</b>
              <span className="muted">{aiState === 'listening' ? 'hört zu …' : aiState === 'thinking' ? (toolNote || 'denkt nach …') : aiState === 'speaking' ? 'spricht …' : 'deine KI an Bord'}</span>
            </div>
            <button className="icon-btn ghost" onClick={() => setSettingsOpen(true)} aria-label="Einstellungen"><Settings size={18} /></button>
            <button className="icon-btn ghost" onClick={() => { ai.reset(); setChat((c) => c.slice(0, 1)) }} aria-label="Neuer Chat"><Trash2 size={18} /></button>
            <button className="icon-btn ghost" onClick={() => { setChatOpen(false); stopSpeaking() }} aria-label="Schließen"><X size={20} /></button>
          </div>
          <div className="chat-list">
            {chat.map((m, i) => (
              <div key={i} className={`bubble ${m.role} ${m.error ? 'error' : ''}`}>
                {m.text || (m.pending ? <span className="typing"><i /><i /><i /></span> : '')}
              </div>
            ))}
            {chat.length < 3 && (
              <div className="chips">
                {['Bring mich zur nächsten Tankstelle', 'Erzähl mir einen Witz', 'Wie ist das Wetter heute?', 'Wie weit ist das Auto vor mir?'].map((s) => (
                  <button key={s} className="chip" onClick={() => sendToNova(s)}>{s}</button>
                ))}
              </div>
            )}
            <div ref={chatEnd} />
          </div>
          <form className="chat-input" onSubmit={(e) => { e.preventDefault(); sendToNova(input) }}>
            <button type="button" className={`mic ${aiState === 'listening' ? 'on' : ''}`} onClick={talk} aria-label="Sprechen"><Mic size={20} /></button>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Frag NOVA alles …" enterKeyHint="send" />
            <button type="submit" className="send" disabled={!input.trim() || aiState === 'thinking'} aria-label="Senden">
              {aiState === 'thinking' ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
            </button>
          </form>
        </div>
      )}

      {/* ---------- search ---------- */}
      {searchOpen && (
        <div className="overlay">
          <div className="search-panel glass-strong">
            <div className="search-field">
              <Search size={20} />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Adresse, Ort, Restaurant …" />
              {searching ? <Loader2 size={18} className="spin" /> : <button className="icon-btn ghost sm" onClick={() => { setSearchOpen(false); setQuery('') }} aria-label="Schließen"><X size={18} /></button>}
            </div>
            <div className="results">
              {(query ? results : recent).map((r) => (
                <button key={r.id} className="result" onClick={() => planRoute(r).catch((e) => showToast(e.message))}>
                  <span className="result-ico">{query ? <MapPin size={18} /> : <Clock size={18} />}</span>
                  <span className="result-txt"><b>{r.name}</b><small>{r.sub}</small></span>
                  {r.dist != null && <span className="result-dist">{formatDistance(r.dist)}</span>}
                </button>
              ))}
              {!query && !recent.length && <p className="muted pad">Tipp: Lange auf die Karte drücken (Rechtsklick) setzt ein Ziel. Oder frag NOVA: „Bring mich nach Hause.“</p>}
              {query && !searching && !results.length && <p className="muted pad">Nichts gefunden.</p>}
            </div>
            <button className="ask-nova" onClick={() => { setSearchOpen(false); setChatOpen(true); if (query) sendToNova(`Bring mich zu: ${query}`) }}>
              <Sparkles size={16} /> {query ? `NOVA fragen: „${query}“` : 'NOVA fragen'}
            </button>
          </div>
        </div>
      )}

      {/* ---------- settings ---------- */}
      {settingsOpen && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setSettingsOpen(false)}>
          <div className="sheet glass-strong settings">
            <div className="preview-head"><h2>Einstellungen</h2><button className="icon-btn ghost" onClick={() => setSettingsOpen(false)} aria-label="Schließen"><X size={20} /></button></div>
            <label className="field">
              <span><KeyRound size={16} /> Claude-API-Schlüssel (für NOVA)</span>
              <input type="password" value={settings.apiKey} onChange={(e) => setSettings({ apiKey: e.target.value.trim() })} placeholder="sk-ant-…" autoComplete="off" />
              <small className="muted">Bekommst du unter console.anthropic.com. Wird nur auf diesem Gerät gespeichert und direkt an api.anthropic.com gesendet.</small>
            </label>
            <Toggle label="Sprachansagen bei der Navigation" value={settings.voice} onChange={(v) => setSettings({ voice: v })} />
            <Toggle label="NOVA liest Antworten vor" value={settings.aiSpeaks} onChange={(v) => setSettings({ aiSpeaks: v })} />
            <Toggle label="3D-Fahransicht" value={settings.mode3d} onChange={(v) => setSettings({ mode3d: v })} />
            <label className="field">
              <span><RouteIcon size={16} /> Tempo der Demo-Fahrt: {settings.simSpeed} km/h</span>
              <input type="range" min="20" max="160" step="10" value={settings.simSpeed} onChange={(e) => setSettings({ simSpeed: +e.target.value })} />
            </label>
            <div className="about muted">
              <p><b>Autos vor dir:</b> Kamera-Symbol antippen und das Handy mit der Rückkamera nach vorne in die Halterung. Die Erkennung läuft komplett auf dem Handy, kein Bild verlässt das Gerät. Abstände sind Schätzungen – kein Ersatz für Aufmerksamkeit.</p>
              <p>GPS: {gpsState === 'ok' ? 'aktiv' : gpsState === 'denied' ? 'blockiert' : gpsState === 'none' ? 'nicht verfügbar' : 'wartet …'} · Karten © OpenStreetMap, OpenFreeMap · Routing OSRM · Suche Photon</p>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast glass-strong">{toast}</div>}
      {sim && nav && <div className="sim-tag"><Square size={10} /> DEMO-FAHRT</div>}
    </div>
  )
}

function Toggle({ label, value, onChange }) {
  return (
    <button className="toggle-row" onClick={() => onChange(!value)}>
      <span>{label}</span>
      <span className={`toggle ${value ? 'on' : ''}`}><i /></span>
    </button>
  )
}

function contextLine(s) {
  const parts = [`Zeit ${new Date().toLocaleString('de-DE', { weekday: 'long', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'long' })}`]
  if (s.pos) parts.push(`Position ${s.pos[1].toFixed(4)}, ${s.pos[0].toFixed(4)}${s.street ? ` (${s.street})` : ''}`)
  parts.push(`Tempo ${Math.round(s.speed * 3.6)} km/h`)
  if (s.nav && s.dest) parts.push(`Navigation aktiv nach ${s.dest.name}`)
  return parts.join(' · ')
}

function tripStatus(s) {
  const out = {
    position: s.pos ? { lat: +s.pos[1].toFixed(5), lng: +s.pos[0].toFixed(5), strasse: s.street || null } : 'kein GPS',
    geschwindigkeit_kmh: Math.round(s.speed * 3.6),
    tempolimit: s.limit ? (s.limit.value ? `${s.limit.value} km/h` : 'aufgehoben') : 'unbekannt',
  }
  if (s.nav && s.progress) {
    out.route = {
      ziel: s.dest?.name,
      rest: formatDistance(s.progress.remaining),
      restzeit: formatDuration(s.progress.remainingTime),
      ankunft: formatClock(s.progress.eta),
      naechstes_manoever: `${s.progress.next?.text} in ${formatDistance(s.progress.toNext)}`,
    }
  } else out.route = 'keine aktive Navigation'
  out.fahrzeuge_vorne = s.vehicles.length
    ? s.vehicles.map((v) => ({ typ: v.label, abstand_m: Math.round(v.distance), eigene_spur: v.inLane, annaeherung_m_s: +v.closing.toFixed(1), warnung: v.level }))
    : 'Kamera aus oder nichts erkannt'
  return out
}
