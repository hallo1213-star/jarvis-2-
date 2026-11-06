import { useEffect, useRef, useState } from 'react'
import {
  Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1, ChevronDown, Heart, ListMusic,
  Volume, Volume1, Volume2, VolumeX, MoreHorizontal, Maximize2, X, Loader2, ListPlus,
} from 'lucide-react'
import { getTrack, artistPath } from '../data/tracks.js'
import { usePlayer, useProgress } from '../store/PlayerContext.jsx'
import { useLibrary } from '../store/LibraryContext.jsx'
import { useUI } from '../store/UIContext.jsx'
import { useRouter } from '../router.jsx'
import { toast } from '../store/toast.js'
import { Cover, Equalizer, Sheet, fmtTime } from './ui.jsx'
import { Slider } from './Slider.jsx'
import { Waveform } from './Waveform.jsx'

function PlayIcon({ size = 28 }) {
  const { isPlaying, buffering } = usePlayer()
  if (buffering && isPlaying) return <Loader2 size={size} className="spin" />
  return isPlaying ? <Pause size={size} fill="currentColor" /> : <Play size={size} fill="currentColor" className="nudge" />
}

function VolumeIcon({ size = 20 }) {
  const { volume, muted } = usePlayer()
  if (muted || volume === 0) return <VolumeX size={size} />
  if (volume < 0.34) return <Volume size={size} />
  if (volume < 0.67) return <Volume1 size={size} />
  return <Volume2 size={size} />
}

function FavButton({ id, size = 22 }) {
  const lib = useLibrary()
  const fav = lib.isFavorite(id)
  return (
    <button
      className={`icon-btn ghost heart-btn ${fav ? 'on' : ''}`}
      onClick={(e) => {
        e.stopPropagation()
        const added = lib.toggleFavorite(id)
        toast(added ? 'Zu Favoriten hinzugefügt' : 'Aus Favoriten entfernt')
      }}
      aria-label={fav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
      aria-pressed={fav}
    >
      <Heart size={size} fill={fav ? 'currentColor' : 'none'} />
    </button>
  )
}

function VolumeControl() {
  const p = usePlayer()
  return (
    <div className="volume">
      <button className="icon-btn ghost small" onClick={p.toggleMute} aria-label={p.muted ? 'Ton an' : 'Stumm'}>
        <VolumeIcon size={18} />
      </button>
      <Slider value={p.muted ? 0 : p.volume} onChange={p.setVolume} label="Lautstärke" />
    </div>
  )
}

function MiniProgress() {
  const { currentTime, duration } = useProgress()
  const pct = duration ? (currentTime / duration) * 100 : 0
  return <div className="mini-progress"><div style={{ transform: `scaleX(${pct / 100})` }} /></div>
}

function LineProgress() {
  const { currentTime, duration, buffered } = useProgress()
  const { seek } = usePlayer()
  const [drag, setDrag] = useState(null)
  return (
    <div className="line-progress">
      <span className="time">{fmtTime(drag ?? currentTime)}</span>
      <div className="line-progress-bar" style={{ '--buf': duration ? (buffered / duration) * 100 + '%' : '0%' }}>
        <Slider value={drag ?? currentTime} max={duration || 1} onChange={setDrag}
          onCommit={(v) => { seek(v); setDrag(null) }} label="Wiedergabeposition" />
      </div>
      <span className="time">{fmtTime(duration)}</span>
    </div>
  )
}

// Full-player progress for tracks without pre-computed waveform data (streamed tracks)
function FullProgress() {
  const { currentTime, duration, buffered } = useProgress()
  const { seek } = usePlayer()
  const [drag, setDrag] = useState(null)
  const shown = drag ?? currentTime
  return (
    <div className="waveform-block full-progress" style={{ '--buf': duration ? (buffered / duration) * 100 + '%' : '0%' }}>
      <Slider value={shown} max={duration || 1} onChange={setDrag} onCommit={(v) => { seek(v); setDrag(null) }} label="Wiedergabeposition" />
      <div className="time-row">
        <span>{fmtTime(shown)}</span>
        <span>-{fmtTime(Math.max(0, (duration || 0) - shown))}</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- mini --
export function MiniPlayer() {
  const p = usePlayer()
  const t = p.current
  const touch = useRef(null)
  if (!t) return null
  return (
    <div
      className="mini-player"
      style={{ '--c1': t.palette[0], '--c2': t.palette[2] }}
      onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
      onTouchEnd={(e) => {
        if (!touch.current) return
        const dx = e.changedTouches[0].clientX - touch.current.x
        const dy = e.changedTouches[0].clientY - touch.current.y
        touch.current = null
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { dx < 0 ? p.next() : p.previous() }
        else if (dy < -40 && Math.abs(dy) > Math.abs(dx)) p.setFullOpen(true)
      }}
    >
      <button className="mini-open" onClick={() => p.setFullOpen(true)} aria-label="Player öffnen">
        <span key={t.id} className="mini-cover"><Cover src={t.cover} size={44} /></span>
        <span className="mini-meta" key={t.id + 'm'}>
          <strong>{t.title}</strong>
          <span>{t.artist}</span>
        </span>
      </button>
      <FavButton id={t.id} size={20} />
      <button className="icon-btn ghost" onClick={p.toggle} aria-label={p.isPlaying ? 'Pause' : 'Abspielen'}>
        <PlayIcon size={24} />
      </button>
      <button className="icon-btn ghost" onClick={p.next} aria-label="Nächster Titel"><SkipForward size={22} fill="currentColor" /></button>
      <MiniProgress />
    </div>
  )
}

// ----------------------------------------------------------- desktop bar --
export function PlayerBar() {
  const p = usePlayer()
  const ui = useUI()
  const t = p.current
  if (!t) return null
  return (
    <div className="player-bar">
      <div className="pb-left">
        <button className="pb-cover" onClick={() => p.setFullOpen(true)} aria-label="Player öffnen">
          <Cover src={t.cover} size={56} key={t.id} />
          <span className="pb-expand"><Maximize2 size={16} /></span>
        </button>
        <div className="pb-meta">
          <strong>{t.title}</strong>
          <span>{t.artist}</span>
        </div>
        <FavButton id={t.id} size={20} />
      </div>
      <div className="pb-center">
        <div className="pb-controls">
          <button className={`icon-btn ghost small toggle ${p.shuffle ? 'on' : ''}`} onClick={p.toggleShuffle} aria-label="Zufallswiedergabe" aria-pressed={p.shuffle}><Shuffle size={18} /></button>
          <button className="icon-btn ghost" onClick={p.previous} aria-label="Vorheriger Titel"><SkipBack size={22} fill="currentColor" /></button>
          <button className="play-main small" onClick={p.toggle} aria-label={p.isPlaying ? 'Pause' : 'Abspielen'}><PlayIcon size={22} /></button>
          <button className="icon-btn ghost" onClick={p.next} aria-label="Nächster Titel"><SkipForward size={22} fill="currentColor" /></button>
          <button className={`icon-btn ghost small toggle ${p.repeat !== 'off' ? 'on' : ''}`} onClick={p.cycleRepeat} aria-label="Wiederholung" aria-pressed={p.repeat !== 'off'}>
            {p.repeat === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
          </button>
        </div>
        <LineProgress />
      </div>
      <div className="pb-right">
        <button className="icon-btn ghost small" onClick={() => ui.openAddToPlaylist(t.id)} aria-label="Zu Playlist hinzufügen"><ListPlus size={18} /></button>
        <QueueButton small />
        <VolumeControl />
      </div>
    </div>
  )
}

// --------------------------------------------------------------- queue --
function QueueButton({ small }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className={`icon-btn ghost ${small ? 'small' : ''}`} onClick={() => setOpen(true)} aria-label="Warteschlange">
        <ListMusic size={small ? 18 : 22} />
      </button>
      <QueueSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}

function QueueSheet({ open, onClose }) {
  const p = usePlayer()
  const { navigate } = useRouter()
  const upcoming = p.queue.map((id, i) => ({ id, i })).filter((x) => x.i > p.index)
  const cur = p.current
  return (
    <Sheet open={open} onClose={onClose} title="Warteschlange" className="queue-sheet">
      {cur && (
        <>
          <p className="queue-label">Läuft gerade{p.context?.label ? <> · {p.context.to
            ? <button className="link-btn" onClick={() => { onClose(); p.setFullOpen(false); navigate(p.context.to) }}>{p.context.label}</button>
            : p.context.label}</> : null}</p>
          <div className="queue-row current">
            <Cover src={cur.cover} size={44} />
            <div className="queue-meta"><strong>{cur.title}</strong><span>{cur.artist}</span></div>
            <Equalizer playing={p.isPlaying} small />
          </div>
        </>
      )}
      <p className="queue-label">Als Nächstes {p.shuffle && <em>· Zufall</em>} {p.repeat === 'all' && <em>· Wiederholen</em>}</p>
      {upcoming.length === 0 && <p className="muted small-text">Keine weiteren Titel. {p.repeat === 'all' ? 'Die Warteschlange beginnt von vorn.' : ''}</p>}
      {upcoming.map(({ id, i }) => {
        const t = getTrack(id)
        if (!t) return null
        return (
          <div className="queue-row" key={id + i}>
            <button className="queue-play" onClick={() => p.playFromQueue(i)}>
              <Cover src={t.cover} size={44} />
              <div className="queue-meta"><strong>{t.title}</strong><span>{t.artist}</span></div>
            </button>
            <button className="icon-btn ghost small" onClick={() => p.removeFromQueue(i)} aria-label="Aus Warteschlange entfernen"><X size={18} /></button>
          </div>
        )
      })}
    </Sheet>
  )
}

// ---------------------------------------------------------------- full --
function AnimatedBackdrop({ track, playing }) {
  const [layers, setLayers] = useState([{ key: track.id, palette: track.palette }])
  useEffect(() => {
    setLayers((ls) => (ls[ls.length - 1].key === track.id ? ls : [...ls.slice(-1), { key: track.id, palette: track.palette }]))
  }, [track.id, track.palette])
  return (
    <div className={`fp-backdrop ${playing ? 'playing' : ''}`} aria-hidden="true">
      {layers.map((l) => (
        <div key={l.key} className="fp-layer" style={{ '--a': l.palette[0], '--b': l.palette[1], '--c': l.palette[2] }}>
          <span className="blob b1" /><span className="blob b2" /><span className="blob b3" />
        </div>
      ))}
      <div className="fp-vignette" />
    </div>
  )
}

export function FullPlayer() {
  const p = usePlayer()
  const ui = useUI()
  const { navigate } = useRouter()
  const t = p.current
  const [render, setRender] = useState(p.fullOpen)
  const [visible, setVisible] = useState(false)
  const panel = useRef(null)
  const drag = useRef(null)
  const swipe = useRef(null)
  const [dir, setDir] = useState('next')
  const prevIndex = useRef(p.index)

  useEffect(() => {
    if (p.index !== prevIndex.current) {
      setDir(p.index > prevIndex.current ? 'next' : 'prev')
      prevIndex.current = p.index
    }
  }, [p.index])

  useEffect(() => {
    if (p.fullOpen) {
      setRender(true)
      document.documentElement.classList.add('no-scroll')
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
      return () => cancelAnimationFrame(r)
    }
    setVisible(false)
    document.documentElement.classList.remove('no-scroll')
    const tm = setTimeout(() => setRender(false), 420)
    return () => clearTimeout(tm)
  }, [p.fullOpen])

  useEffect(() => {
    if (!p.fullOpen) return
    const onKey = (e) => e.key === 'Escape' && p.setFullOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [p.fullOpen, p.setFullOpen])

  if (!render || !t) return null

  const close = () => p.setFullOpen(false)
  const goto = (to) => { close(); navigate(to) }

  // drag-down to dismiss
  const onTouchStart = (e) => {
    if (e.target.closest('.waveform, .slider, .fp-scroll-zone')) return
    drag.current = { y0: e.touches[0].clientY, x0: e.touches[0].clientX, dy: 0, locked: null }
  }
  const onTouchMove = (e) => {
    const d = drag.current
    if (!d) return
    const dy = e.touches[0].clientY - d.y0
    const dx = e.touches[0].clientX - d.x0
    if (d.locked == null && (Math.abs(dy) > 8 || Math.abs(dx) > 8)) d.locked = Math.abs(dy) > Math.abs(dx) ? 'y' : 'x'
    if (d.locked !== 'y') return
    d.dy = Math.max(0, dy)
    panel.current.style.transition = 'none'
    panel.current.style.transform = `translateY(${d.dy}px)`
  }
  const onTouchEnd = () => {
    const d = drag.current
    drag.current = null
    if (!d || d.locked !== 'y') return
    panel.current.style.transition = ''
    panel.current.style.transform = ''
    if (d.dy > 120) close()
  }

  return (
    <div className={`full-player ${visible ? 'visible' : ''}`} role="dialog" aria-modal="true" aria-label="Player">
      <div className="fp-panel" ref={panel} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        <AnimatedBackdrop track={t} playing={p.isPlaying} />
        <div className="fp-inner">
          <div className="fp-top">
            <button className="icon-btn glass" onClick={close} aria-label="Player schließen"><ChevronDown size={26} /></button>
            <div className="fp-context">
              <span>Wird abgespielt aus</span>
              {p.context?.to
                ? <button className="link-btn" onClick={() => goto(p.context.to)}>{p.context.label}</button>
                : <strong>{p.context?.label || 'Deiner Auswahl'}</strong>}
            </div>
            <button className="icon-btn glass" onClick={() => ui.openTrackMenu(t.id)} aria-label="Weitere Optionen"><MoreHorizontal size={22} /></button>
          </div>

          <div
            className="fp-art-zone"
            onTouchStart={(e) => { swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
            onTouchEnd={(e) => {
              const s = swipe.current
              swipe.current = null
              if (!s) return
              const dx = e.changedTouches[0].clientX - s.x
              const dy = e.changedTouches[0].clientY - s.y
              if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) { dx < 0 ? p.next() : p.previous() }
            }}
          >
            <div key={t.id} className={`fp-art ${p.isPlaying ? 'playing' : 'paused'} enter-${dir}`}>
              <Cover src={t.coverLarge || t.cover} alt={`${t.title} Cover`} />
              <div className="fp-art-shine" />
            </div>
          </div>

          <div className="fp-info">
            <div className="fp-titles" key={t.id}>
              <h2>{t.title}</h2>
              <button className="link-btn artist" onClick={() => goto(artistPath(t))}>{t.artist}</button>
              {t.source === 'audius' && <span className="source-badge">via Audius</span>}
            </div>
            <FavButton id={t.id} size={26} />
          </div>

          {t.peaks ? <Waveform track={t} /> : <FullProgress />}

          <div className="fp-controls">
            <button className={`icon-btn ghost toggle ${p.shuffle ? 'on' : ''}`} onClick={p.toggleShuffle} aria-label="Zufallswiedergabe" aria-pressed={p.shuffle}><Shuffle size={22} /></button>
            <button className="icon-btn ghost big" onClick={p.previous} aria-label="Vorheriger Titel"><SkipBack size={34} fill="currentColor" /></button>
            <button className="play-main" onClick={p.toggle} aria-label={p.isPlaying ? 'Pause' : 'Abspielen'}><PlayIcon size={34} /></button>
            <button className="icon-btn ghost big" onClick={p.next} aria-label="Nächster Titel"><SkipForward size={34} fill="currentColor" /></button>
            <button className={`icon-btn ghost toggle ${p.repeat !== 'off' ? 'on' : ''}`} onClick={p.cycleRepeat} aria-label={`Wiederholung: ${p.repeat}`} aria-pressed={p.repeat !== 'off'}>
              {p.repeat === 'one' ? <Repeat1 size={22} /> : <Repeat size={22} />}
            </button>
          </div>

          <div className="fp-bottom">
            <VolumeControl />
            <div className="fp-actions">
              <button className="icon-btn ghost" onClick={() => ui.openAddToPlaylist(t.id)} aria-label="Zu Playlist hinzufügen"><ListPlus size={22} /></button>
              <QueueButton />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
