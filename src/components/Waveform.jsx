import { useEffect, useRef, useState } from 'react'
import { usePlayer } from '../store/PlayerContext.jsx'
import { fmtTime } from './ui.jsx'

// Waveform scrubber: real peaks of the current track, animated while playing.
export function Waveform({ track }) {
  const { audioRef, seek, isPlaying } = usePlayer()
  const canvas = useRef(null)
  const wrap = useRef(null)
  const [scrub, setScrub] = useState(null) // seconds while dragging
  const scrubRef = useRef(null)
  scrubRef.current = scrub
  const [time, setTime] = useState(0)

  const duration = () => {
    const a = audioRef.current
    return a && Number.isFinite(a.duration) && a.duration > 0 ? a.duration : track.duration
  }

  useEffect(() => {
    const c = canvas.current
    const ctx = c.getContext('2d')
    let raf = 0
    let lastShown = -1
    let w = 0
    let h = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    const resize = () => {
      const r = wrap.current.getBoundingClientRect()
      w = r.width
      h = r.height
      c.width = Math.round(w * dpr)
      c.height = Math.round(h * dpr)
      c.style.width = w + 'px'
      c.style.height = h + 'px'
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap.current)

    const peaks = track.peaks
    const n = peaks.length
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    const draw = (now) => {
      const a = audioRef.current
      const d = duration()
      const cur = scrubRef.current ?? a.currentTime
      const p = d ? cur / d : 0
      const shown = Math.floor(cur)
      if (shown !== lastShown) { lastShown = shown; setTime(cur) }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const gap = 2
      const bw = Math.max(1.5, (w - gap * (n - 1)) / n)
      const grad = ctx.createLinearGradient(0, 0, w, 0)
      grad.addColorStop(0, '#ffffff')
      grad.addColorStop(1, '#c4b5fd')
      for (let i = 0; i < n; i++) {
        const x = i * (bw + gap)
        const prog = i / n
        const near = Math.abs(prog - p) * n
        const live = !a.paused && !reduce ? (Math.sin(now / 160 + i * 0.9) * 0.5 + 0.5) * Math.max(0, 1 - near / 6) * 0.22 : 0
        const v = Math.min(1, peaks[i] + live)
        const bh = Math.max(3, v * h * 0.92)
        const y = (h - bh) / 2
        ctx.fillStyle = prog <= p ? grad : 'rgba(210,212,226,0.28)'
        const r = Math.min(bw / 2, 2)
        ctx.beginPath()
        if (ctx.roundRect) ctx.roundRect(x, y, bw, bh, r)
        else ctx.rect(x, y, bw, bh)
        ctx.fill()
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.id])

  const timeAt = (clientX) => {
    const r = wrap.current.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * duration()
  }

  const d = duration()
  const shownTime = scrub ?? time

  return (
    <div className="waveform-block">
      <div
        ref={wrap}
        className={`waveform ${scrub != null ? 'scrubbing' : ''} ${isPlaying ? 'playing' : ''}`}
        role="slider"
        tabIndex={0}
        aria-label="Wiedergabeposition"
        aria-valuemin={0}
        aria-valuemax={Math.round(d)}
        aria-valuenow={Math.round(shownTime)}
        aria-valuetext={`${fmtTime(shownTime)} von ${fmtTime(d)}`}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setScrub(timeAt(e.clientX)) }}
        onPointerMove={(e) => { if (scrubRef.current != null) setScrub(timeAt(e.clientX)) }}
        onPointerUp={(e) => { if (scrubRef.current == null) return; seek(timeAt(e.clientX)); setScrub(null) }}
        onPointerCancel={() => setScrub(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); seek(audioRef.current.currentTime + 5) }
          if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); seek(audioRef.current.currentTime - 5) }
        }}
      >
        <canvas ref={canvas} />
      </div>
      <div className="time-row">
        <span>{fmtTime(shownTime)}</span>
        <span>-{fmtTime(Math.max(0, d - shownTime))}</span>
      </div>
    </div>
  )
}
