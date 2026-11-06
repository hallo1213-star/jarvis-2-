import { useRef, useState } from 'react'

// Touch-friendly slider (consistent on iOS Safari, Windows & macOS)
export function Slider({ value, max = 1, onChange, onCommit, label, className = '', step = 0 }) {
  const ref = useRef(null)
  const [dragging, setDragging] = useState(false)

  const valueAt = (clientX) => {
    const r = ref.current.getBoundingClientRect()
    let v = Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * max
    if (step) v = Math.round(v / step) * step
    return v
  }

  const pct = max ? Math.max(0, Math.min(100, (value / max) * 100)) : 0

  return (
    <div
      ref={ref}
      className={`slider ${dragging ? 'dragging' : ''} ${className}`}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value * 100) / 100}
      style={{ '--pct': pct + '%' }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        setDragging(true)
        onChange(valueAt(e.clientX))
      }}
      onPointerMove={(e) => { if (dragging) onChange(valueAt(e.clientX)) }}
      onPointerUp={(e) => {
        if (!dragging) return
        setDragging(false)
        onCommit?.(valueAt(e.clientX))
      }}
      onPointerCancel={() => setDragging(false)}
      onKeyDown={(e) => {
        const d = (step || max / 20) * (e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0)
        if (!d) return
        e.preventDefault()
        e.stopPropagation()
        const v = Math.max(0, Math.min(max, value + d))
        onChange(v)
        onCommit?.(v)
      }}
    >
      <div className="slider-track"><div className="slider-fill" /></div>
      <div className="slider-thumb" />
    </div>
  )
}
