import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, X } from 'lucide-react'
import { useRouter } from '../router.jsx'
import { getTrack } from '../data/tracks.js'

export const fmtTime = (s) => {
  if (!Number.isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export const fmtTotal = (ids) => {
  const total = ids.reduce((sum, id) => sum + (getTrack(id)?.duration || 0), 0)
  const m = Math.round(total / 60)
  return m < 60 ? `${m} Min.` : `${Math.floor(m / 60)} Std. ${m % 60} Min.`
}

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

export function Logo({ size = 28, withText = true }) {
  const gid = 'lg' + useId().replace(/[^a-zA-Z0-9]/g, '')
  return (
    <span className="logo" aria-label="AURIX">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.5" stopColor="#c4c6d2" />
            <stop offset="1" stopColor="#8e90a0" />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r="26" fill="none" stroke="#8b5cf6" strokeOpacity="0.35" strokeWidth="6" />
        <circle cx="32" cy="32" r="26" fill="none" stroke={`url(#${gid})`} strokeWidth="3" />
        <path d="M14 42 L20.5 42 L32 16 L43.5 42 L50 42" fill="none" stroke={`url(#${gid})`} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M27 34 L37 34" stroke="#a47bff" strokeWidth="3.6" strokeLinecap="round" />
      </svg>
      {withText && <span className="logo-text">AURIX</span>}
    </span>
  )
}

export function Cover({ src, alt = '', size, round, className = '', mosaic }) {
  const [loaded, setLoaded] = useState(false)
  if (mosaic && mosaic.length >= 4) {
    return (
      <div className={`cover mosaic ${className}`} style={size ? { width: size, height: size } : undefined}>
        {mosaic.slice(0, 4).map((s, i) => <img key={i} src={s} alt="" loading="lazy" decoding="async" />)}
      </div>
    )
  }
  const one = mosaic?.[0] || src
  return (
    <div className={`cover ${round ? 'round' : ''} ${loaded ? 'is-loaded' : ''} ${className}`}
      style={size ? { width: size, height: size } : undefined}>
      {one ? (
        <img src={one} alt={alt} loading="lazy" decoding="async" onLoad={() => setLoaded(true)} />
      ) : (
        <div className="cover-empty"><Logo size={36} withText={false} /></div>
      )}
    </div>
  )
}

export const playlistMosaic = (p) => {
  const covers = [...new Set(p.trackIds.map((id) => getTrack(id)?.cover).filter(Boolean))]
  return covers.length >= 4 ? covers : covers.slice(0, 1)
}

export function PageHeader({ title, back, right, subtitle }) {
  const router = useRouter()
  return (
    <header className="page-header">
      <div className="page-header-row">
        {back && (
          <button className="icon-btn ghost" onClick={() => router.back(typeof back === 'string' ? back : '/')} aria-label="Zurück">
            <ChevronLeft size={26} />
          </button>
        )}
        <h1 className="page-title">{title}</h1>
        <div className="page-header-right">{right}</div>
      </div>
      {subtitle && <p className="page-subtitle">{subtitle}</p>}
    </header>
  )
}

export function Section({ title, action, children, className = '' }) {
  return (
    <section className={`section ${className}`}>
      <div className="section-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function Shelf({ children }) {
  return <div className="shelf">{children}</div>
}

export function Equalizer({ playing, small }) {
  return (
    <span className={`eq ${playing ? 'on' : ''} ${small ? 'small' : ''}`} aria-hidden="true">
      <i /><i /><i /><i />
    </span>
  )
}

export function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="empty">
      {Icon && <div className="empty-icon"><Icon size={30} /></div>}
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  )
}

// Bottom sheet (mobile) / centered dialog (desktop)
export function Sheet({ open, onClose, title, children, className = '' }) {
  const [render, setRender] = useState(open)
  const [visible, setVisible] = useState(false)
  const panel = useRef(null)
  const drag = useRef({ y: 0, start: 0, active: false })

  useEffect(() => {
    if (open) {
      setRender(true)
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
      return () => cancelAnimationFrame(r)
    }
    setVisible(false)
    const t = setTimeout(() => setRender(false), 320)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!render) return null

  const onTouchStart = (e) => {
    if (panel.current && panel.current.scrollTop > 0) return
    drag.current = { start: e.touches[0].clientY, y: 0, active: true }
  }
  const onTouchMove = (e) => {
    if (!drag.current.active) return
    const dy = Math.max(0, e.touches[0].clientY - drag.current.start)
    drag.current.y = dy
    if (panel.current) panel.current.style.transform = `translateY(${dy}px)`
  }
  const onTouchEnd = () => {
    if (!drag.current.active) return
    drag.current.active = false
    if (panel.current) panel.current.style.transform = ''
    if (drag.current.y > 90) onClose()
  }

  return createPortal(
    <div className={`sheet-root ${visible ? 'visible' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className={`sheet ${className}`} ref={panel} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        <div className="sheet-grabber" />
        {title && (
          <div className="sheet-head">
            <h3>{title}</h3>
            <button className="icon-btn ghost small" onClick={onClose} aria-label="Schließen"><X size={20} /></button>
          </div>
        )}
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

export function TextPrompt({ open, onClose, title, label, initial = '', confirm = 'Speichern', onSubmit }) {
  const [value, setValue] = useState(initial)
  const input = useRef(null)
  useEffect(() => {
    if (open) {
      setValue(initial)
      const t = setTimeout(() => input.current?.focus(), 350)
      return () => clearTimeout(t)
    }
  }, [open, initial])
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <form
        className="prompt"
        onSubmit={(e) => {
          e.preventDefault()
          if (!value.trim()) return
          onSubmit(value.trim())
          onClose()
        }}
      >
        <label className="field">
          <span>{label}</span>
          <input ref={input} value={value} maxLength={60} onChange={(e) => setValue(e.target.value)} enterKeyHint="done" />
        </label>
        <div className="prompt-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Abbrechen</button>
          <button type="submit" className="btn primary" disabled={!value.trim()}>{confirm}</button>
        </div>
      </form>
    </Sheet>
  )
}

export function Confirm({ open, onClose, title, text, confirm = 'Löschen', onConfirm, danger = true }) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <p className="confirm-text">{text}</p>
      <div className="prompt-actions">
        <button className="btn secondary" onClick={onClose}>Abbrechen</button>
        <button className={`btn ${danger ? 'danger' : 'primary'}`} onClick={() => { onConfirm(); onClose() }}>{confirm}</button>
      </div>
    </Sheet>
  )
}
