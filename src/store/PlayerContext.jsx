import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { trackById } from '../data/catalog.js'
import { useLibrary } from './LibraryContext.jsx'
import { load, save } from './storage.js'
import { toast } from './toast.js'

const PlayerContext = createContext(null)
const ProgressContext = createContext({ currentTime: 0, duration: 0, buffered: 0 })

const shuffleArray = (arr) => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// iOS ignores HTMLMediaElement.volume (always 1). Detect it once.
const detectVolumeSupport = () => {
  try {
    const a = document.createElement('audio')
    a.volume = 0.5
    return Math.abs(a.volume - 0.5) < 0.01
  } catch {
    return false
  }
}

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function PlayerProvider({ children }) {
  const { markPlayed } = useLibrary()
  const saved = useMemo(() => load('session', null), [])

  const audioRef = useRef(null)
  if (!audioRef.current && typeof Audio !== 'undefined') {
    const a = new Audio()
    a.preload = 'auto'
    a.setAttribute('playsinline', '')
    a.setAttribute('webkit-playsinline', '')
    audioRef.current = a
  }

  const validIds = (ids) => (Array.isArray(ids) ? ids.filter((id) => trackById[id]) : [])

  const [queue, setQueue] = useState(() => validIds(saved?.queue))
  const [original, setOriginal] = useState(() => validIds(saved?.original))
  const [index, setIndex] = useState(() => Math.min(saved?.index ?? 0, Math.max(0, validIds(saved?.queue).length - 1)))
  const [context, setContext] = useState(() => saved?.context || null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [buffering, setBuffering] = useState(false)
  const [shuffle, setShuffle] = useState(() => Boolean(saved?.shuffle))
  const [repeat, setRepeat] = useState(() => (['off', 'all', 'one'].includes(saved?.repeat) ? saved.repeat : 'off'))
  const [volume, setVolumeState] = useState(() => (typeof saved?.volume === 'number' ? saved.volume : 1))
  const [muted, setMuted] = useState(false)
  const [fullOpen, setFullOpen] = useState(false)
  const [progress, setProgress] = useState({ currentTime: saved?.time || 0, duration: 0, buffered: 0 })
  const [volumeSupported] = useState(detectVolumeSupport)
  const [webAudioActive, setWebAudioActive] = useState(false)

  const current = queue[index] ? trackById[queue[index]] : null

  // ---- refs mirror state for event handlers ---------------------------------
  const st = useRef({})
  st.current = { queue, original, index, shuffle, repeat, volume, muted, current, isPlaying, context }

  // ---- output level (volume × fade) ----------------------------------------
  const graph = useRef({ ctx: null, gain: null })
  const fade = useRef({ level: 1, raf: 0 })

  const applyLevel = useCallback(() => {
    const a = audioRef.current
    const { volume: v, muted: m } = st.current
    const out = m ? 0 : Math.max(0, Math.min(1, v * fade.current.level))
    if (graph.current.gain) {
      graph.current.gain.gain.value = out
      a.volume = 1
    } else if (volumeSupported) {
      a.volume = out
    }
  }, [volumeSupported])

  const fadeTo = useCallback((target, ms, done) => {
    cancelAnimationFrame(fade.current.raf)
    const canFade = volumeSupported || graph.current.gain
    if (!canFade || ms <= 0 || reduceMotion()) {
      fade.current.level = target
      applyLevel()
      done?.()
      return
    }
    const from = fade.current.level
    const start = performance.now()
    const step = (now) => {
      const p = Math.min(1, (now - start) / ms)
      const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2
      fade.current.level = from + (target - from) * eased
      applyLevel()
      if (p < 1) fade.current.raf = requestAnimationFrame(step)
      else done?.()
    }
    fade.current.raf = requestAnimationFrame(step)
  }, [applyLevel, volumeSupported])

  // Routes audio through a GainNode – only used on iOS, where element volume is read-only.
  const ensureWebAudio = useCallback(() => {
    if (graph.current.gain) {
      if (graph.current.ctx.state === 'suspended') graph.current.ctx.resume().catch(() => {})
      return true
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return false
      const ctx = new Ctx()
      const src = ctx.createMediaElementSource(audioRef.current)
      const gain = ctx.createGain()
      src.connect(gain).connect(ctx.destination)
      graph.current = { ctx, gain }
      ctx.resume().catch(() => {})
      setWebAudioActive(true)
      return true
    } catch {
      return false
    }
  }, [])

  useEffect(() => { applyLevel() }, [volume, muted, applyLevel])

  // ---- loading & playing ---------------------------------------------------
  const loadedId = useRef(null)
  const startPlayback = useCallback(() => {
    const a = audioRef.current
    if (graph.current.ctx?.state === 'suspended') graph.current.ctx.resume().catch(() => {})
    fade.current.level = 0
    applyLevel()
    const p = a.play()
    if (p && p.catch) {
      p.then(() => fadeTo(1, 450)).catch((err) => {
        if (err?.name === 'NotAllowedError') toast('Tippe auf Play, um die Wiedergabe zu starten')
        else if (err?.name !== 'AbortError') toast('Wiedergabe nicht möglich')
        fade.current.level = 1
        applyLevel()
      })
    } else {
      fadeTo(1, 450)
    }
  }, [applyLevel, fadeTo])

  const loadTrack = useCallback((id, autoplay, startAt = 0) => {
    const a = audioRef.current
    const t = trackById[id]
    if (!t) return
    if (loadedId.current !== id) {
      loadedId.current = id
      a.src = t.src
      setProgress({ currentTime: startAt, duration: t.duration, buffered: 0 })
      if (startAt > 0) {
        const seek = () => {
          try { a.currentTime = startAt } catch { /* ignore */ }
          a.removeEventListener('loadedmetadata', seek)
        }
        a.addEventListener('loadedmetadata', seek)
      }
      a.load()
    } else if (startAt === 0 && autoplay) {
      a.currentTime = 0
    }
    if (autoplay) {
      startPlayback()
      markPlayed(id)
    }
  }, [markPlayed, startPlayback])

  // restore last session (paused)
  useEffect(() => {
    if (current && !loadedId.current) loadTrack(current.id, false, saved?.time || 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const goTo = useCallback((newIndex, newQueue, autoplay = true) => {
    const q = newQueue || st.current.queue
    if (!q.length) return
    const i = ((newIndex % q.length) + q.length) % q.length
    setIndex(i)
    loadTrack(q[i], autoplay)
  }, [loadTrack])

  const playQueue = useCallback((ids, startIndex = 0, ctx = null, opts = {}) => {
    const list = validIds(ids)
    if (!list.length) return
    const useShuffle = opts.shuffle ?? st.current.shuffle
    if (opts.shuffle !== undefined) setShuffle(opts.shuffle)
    const startId = opts.shuffle && opts.randomStart
      ? list[Math.floor(Math.random() * list.length)]
      : list[Math.max(0, Math.min(startIndex, list.length - 1))]
    const q = useShuffle ? [startId, ...shuffleArray(list.filter((x) => x !== startId))] : list
    setOriginal(list)
    setQueue(q)
    setContext(ctx)
    goTo(q.indexOf(startId), q, true)
  }, [goTo])

  const playTrack = useCallback((id, contextIds, ctx) => {
    const ids = contextIds && contextIds.length ? contextIds : [id]
    playQueue(ids, Math.max(0, ids.indexOf(id)), ctx)
  }, [playQueue])

  const play = useCallback(() => {
    if (!st.current.current) return
    if (loadedId.current !== st.current.current.id) loadTrack(st.current.current.id, true)
    else startPlayback()
  }, [loadTrack, startPlayback])

  const pause = useCallback(() => {
    const a = audioRef.current
    fadeTo(0, 160, () => {
      a.pause()
      fade.current.level = 1
      applyLevel()
    })
  }, [applyLevel, fadeTo])

  const toggle = useCallback(() => {
    if (!st.current.current) return
    if (audioRef.current.paused) play()
    else pause()
  }, [play, pause])

  const next = useCallback((auto = false) => {
    const { queue: q, index: i, repeat: r } = st.current
    if (!q.length) return
    if (auto && r === 'one') {
      audioRef.current.currentTime = 0
      startPlayback()
      return
    }
    if (i + 1 >= q.length) {
      if (auto && r === 'off') {
        // end of queue – stop at the beginning of the last track
        audioRef.current.pause()
        audioRef.current.currentTime = 0
        return
      }
      goTo(0)
      return
    }
    goTo(i + 1)
  }, [goTo, startPlayback])

  const previous = useCallback(() => {
    const a = audioRef.current
    const { index: i, repeat: r, queue: q } = st.current
    if (a.currentTime > 3 || (i === 0 && r !== 'all')) {
      a.currentTime = 0
      if (a.paused) startPlayback()
      return
    }
    goTo(i - 1 < 0 ? q.length - 1 : i - 1)
  }, [goTo, startPlayback])

  const seek = useCallback((time) => {
    const a = audioRef.current
    const d = a.duration || st.current.current?.duration || 0
    const t = Math.max(0, Math.min(d - 0.05, time))
    try { a.currentTime = t } catch { /* ignore */ }
    setProgress((p) => ({ ...p, currentTime: t }))
  }, [])

  const toggleShuffle = useCallback(() => {
    const { shuffle: s, queue: q, original: o, index: i } = st.current
    const cur = q[i]
    if (!s) {
      const base = o.length ? o : q
      const nq = cur ? [cur, ...shuffleArray(base.filter((x) => x !== cur))] : shuffleArray(base)
      setQueue(nq)
      setIndex(0)
      toast('Zufallswiedergabe an')
    } else {
      const base = o.length ? o : q
      setQueue(base)
      setIndex(Math.max(0, base.indexOf(cur)))
      toast('Zufallswiedergabe aus')
    }
    setShuffle(!s)
  }, [])

  const cycleRepeat = useCallback(() => {
    const order = ['off', 'all', 'one']
    const nextMode = order[(order.indexOf(st.current.repeat) + 1) % 3]
    setRepeat(nextMode)
    toast(nextMode === 'off' ? 'Wiederholung aus' : nextMode === 'all' ? 'Alle wiederholen' : 'Titel wiederholen')
  }, [])

  const setVolume = useCallback((v) => {
    const val = Math.max(0, Math.min(1, v))
    if (!volumeSupported) ensureWebAudio()
    setMuted(false)
    setVolumeState(val)
  }, [ensureWebAudio, volumeSupported])

  const toggleMute = useCallback(() => {
    if (!volumeSupported) ensureWebAudio()
    setMuted((m) => !m)
  }, [ensureWebAudio, volumeSupported])

  const addNext = useCallback((id) => {
    const { queue: q, index: i, original: o } = st.current
    if (!q.length) { playQueue([id], 0); return }
    const nq = [...q]
    nq.splice(i + 1, 0, id)
    setQueue(nq)
    setOriginal([...o, id])
    toast('Wird als Nächstes gespielt')
  }, [playQueue])

  const addToQueue = useCallback((id) => {
    const { queue: q, original: o } = st.current
    if (!q.length) { playQueue([id], 0); return }
    setQueue([...q, id])
    setOriginal([...o, id])
    toast('Zur Warteschlange hinzugefügt')
  }, [playQueue])

  const removeFromQueue = useCallback((pos) => {
    const { queue: q, index: i } = st.current
    if (pos === i) return
    const nq = q.filter((_, k) => k !== pos)
    setQueue(nq)
    if (pos < i) setIndex(i - 1)
  }, [])

  const playFromQueue = useCallback((pos) => goTo(pos), [goTo])

  // ---- persistence -------------------------------------------------------------
  const persist = useCallback(() => {
    const s = st.current
    save('session', {
      queue: s.queue, original: s.original, index: s.index, shuffle: s.shuffle, repeat: s.repeat,
      volume: s.volume, context: s.context, time: audioRef.current?.currentTime || 0,
    })
  }, [])
  // ---- audio element events --------------------------------------------------
  useEffect(() => {
    const a = audioRef.current
    let lastSave = 0
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onWaiting = () => setBuffering(true)
    const onPlaying = () => { setBuffering(false); setIsPlaying(true) }
    const onCanPlay = () => setBuffering(false)
    const onTime = () => {
      let buffered = 0
      try { if (a.buffered.length) buffered = a.buffered.end(a.buffered.length - 1) } catch { /* ignore */ }
      setProgress({ currentTime: a.currentTime, duration: a.duration || st.current.current?.duration || 0, buffered })
      const now = Date.now()
      if (now - lastSave > 4000) { lastSave = now; persist() }
      if ('mediaSession' in navigator && a.duration && navigator.mediaSession.setPositionState) {
        try {
          navigator.mediaSession.setPositionState({ duration: a.duration, playbackRate: a.playbackRate, position: Math.min(a.currentTime, a.duration) })
        } catch { /* ignore */ }
      }
    }
    const onMeta = () => setProgress((p) => ({ ...p, duration: a.duration || p.duration }))
    const onEnded = () => next(true)
    const onError = () => {
      if (!a.src) return
      setBuffering(false)
      toast('Titel konnte nicht geladen werden – Verbindung prüfen')
    }
    const evs = { play: onPlay, pause: onPause, waiting: onWaiting, playing: onPlaying, canplay: onCanPlay,
      timeupdate: onTime, loadedmetadata: onMeta, ended: onEnded, error: onError }
    Object.entries(evs).forEach(([k, f]) => a.addEventListener(k, f))
    return () => Object.entries(evs).forEach(([k, f]) => a.removeEventListener(k, f))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next])

  useEffect(() => { persist() }, [queue, original, index, shuffle, repeat, volume, context, persist])
  useEffect(() => {
    const h = () => persist()
    window.addEventListener('pagehide', h)
    document.addEventListener('visibilitychange', h)
    return () => {
      window.removeEventListener('pagehide', h)
      document.removeEventListener('visibilitychange', h)
    }
  }, [persist])

  // ---- Media Session (lock screen / control center / keyboard media keys) ---
  useEffect(() => {
    if (!('mediaSession' in navigator) || !current) return
    try {
      const art = new URL(current.cover, window.location.href).href
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: current.title, artist: current.artist, album: current.album,
        artwork: [{ src: art, sizes: '600x600', type: 'image/jpeg' }],
      })
    } catch { /* ignore */ }
  }, [current])
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
  }, [isPlaying])
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const ms = navigator.mediaSession
    const handlers = {
      play: () => play(),
      pause: () => pause(),
      previoustrack: () => previous(),
      nexttrack: () => next(),
      seekto: (e) => seek(e.seekTime),
      seekbackward: (e) => seek(audioRef.current.currentTime - (e.seekOffset || 10)),
      seekforward: (e) => seek(audioRef.current.currentTime + (e.seekOffset || 10)),
    }
    Object.entries(handlers).forEach(([k, f]) => { try { ms.setActionHandler(k, f) } catch { /* unsupported */ } })
    return () => Object.keys(handlers).forEach((k) => { try { ms.setActionHandler(k, null) } catch { /* ignore */ } })
  }, [play, pause, previous, next, seek])

  // iOS 17+: declare a playback audio session so music keeps going with the mute switch on
  useEffect(() => {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback' } catch { /* ignore */ }
  }, [])

  // ---- keyboard shortcuts (desktop) ---------------------------------------
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return
      if (e.code === 'Space') { e.preventDefault(); toggle() }
      else if (e.code === 'ArrowRight' && e.shiftKey) next()
      else if (e.code === 'ArrowLeft' && e.shiftKey) previous()
      else if (e.code === 'ArrowRight') seek(audioRef.current.currentTime + 5)
      else if (e.code === 'ArrowLeft') seek(audioRef.current.currentTime - 5)
      else if (e.key === 'm') toggleMute()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle, next, previous, seek, toggleMute])

  const value = useMemo(() => ({
    audioRef, current, queue, index, context, isPlaying, buffering, shuffle, repeat, volume, muted,
    volumeSupported, webAudioActive, fullOpen, setFullOpen,
    playQueue, playTrack, play, pause, toggle, next: () => next(false), previous, seek,
    toggleShuffle, cycleRepeat, setVolume, toggleMute, addNext, addToQueue, removeFromQueue, playFromQueue,
  }), [current, queue, index, context, isPlaying, buffering, shuffle, repeat, volume, muted, volumeSupported,
    webAudioActive, fullOpen, playQueue, playTrack, play, pause, toggle, next, previous, seek, toggleShuffle,
    cycleRepeat, setVolume, toggleMute, addNext, addToQueue, removeFromQueue, playFromQueue])

  return (
    <PlayerContext.Provider value={value}>
      <ProgressContext.Provider value={progress}>{children}</ProgressContext.Provider>
    </PlayerContext.Provider>
  )
}

export const usePlayer = () => useContext(PlayerContext)
export const useProgress = () => useContext(ProgressContext)
