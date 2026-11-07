// "Autos vor dir": rear camera + on-device object detection (TensorFlow.js COCO-SSD).
// Everything runs locally in the browser – no video ever leaves the phone.
import { useEffect, useRef, useState } from 'react'
import '@tensorflow/tfjs-backend-webgl'
import '@tensorflow/tfjs-backend-cpu'
import * as tf from '@tensorflow/tfjs-core'
import * as cocoSsd from '@tensorflow-models/coco-ssd'
import { Loader2, Maximize2, Minimize2, X, CameraOff } from 'lucide-react'

const CLASSES = {
  car: { label: 'PKW', width: 1.8 },
  truck: { label: 'LKW', width: 2.5 },
  bus: { label: 'Bus', width: 2.55 },
  motorcycle: { label: 'Motorrad', width: 0.8 },
  bicycle: { label: 'Fahrrad', width: 0.6 },
  person: { label: 'Person', width: 0.5 },
}
const LONG_SIDE_FOV = 66 // degrees, typical phone main camera
const LANE_ANGLE = 9 // |angle| below this = in my lane

let modelPromise
function loadModel() {
  modelPromise ||= tf.setBackend('webgl').catch(() => tf.setBackend('cpu')).then(() => tf.ready())
    .then(() => cocoSsd.load({ base: 'lite_mobilenet_v2' }))
  return modelPromise
}

function iou(a, b) {
  const x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1])
  const x2 = Math.min(a[0] + a[2], b[0] + b[2]), y2 = Math.min(a[1] + a[3], b[1] + b[3])
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  return inter / (a[2] * a[3] + b[2] * b[3] - inter || 1)
}

export default function CarVision({ speedKmh, onVehicles, onClose, expanded, onToggleExpand, children }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const tracksRef = useRef([])
  const speedRef = useRef(speedKmh)
  speedRef.current = speedKmh
  const [status, setStatus] = useState('loading') // loading | running | error
  const [error, setError] = useState('')
  const [fps, setFps] = useState(0)

  useEffect(() => {
    let stop = false
    let stream
    let raf
    let nextId = 1

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        const video = videoRef.current
        video.srcObject = stream
        await video.play()
        const model = await loadModel()
        if (stop) return
        setStatus('running')
        let last = performance.now()
        let frames = 0
        let fpsT = last

        const loop = async () => {
          if (stop) return
          const t0 = performance.now()
          let preds = []
          try { preds = await model.detect(video, 20, 0.45) } catch { /* frame not ready */ }
          if (stop) return
          const now = performance.now()
          const dt = Math.max(0.03, (now - last) / 1000)
          last = now
          frames++
          if (now - fpsT > 1000) { setFps(Math.round((frames * 1000) / (now - fpsT))); frames = 0; fpsT = now }
          process(preds, video.videoWidth, video.videoHeight, dt)
          draw(video.videoWidth, video.videoHeight)
          const wait = Math.max(0, 90 - (performance.now() - t0)) // ~10 fps max, saves battery
          raf = setTimeout(() => requestAnimationFrame(loop), wait)
        }
        loop()
      } catch (e) {
        setStatus('error')
        setError(e.name === 'NotAllowedError' ? 'Kamera-Zugriff wurde verweigert.' : e.name === 'NotFoundError' ? 'Keine Kamera gefunden.' : e.message || String(e))
      }
    }

    function process(preds, W, H, dt) {
      const focal = Math.max(W, H) / (2 * Math.tan(((LONG_SIDE_FOV / 2) * Math.PI) / 180))
      const dets = preds
        .filter((p) => CLASSES[p.class] && p.bbox[2] > 12)
        .map((p) => {
          const [x, y, w, h] = p.bbox
          const c = CLASSES[p.class]
          const distance = (c.width * focal) / w
          const angle = (Math.atan((x + w / 2 - W / 2) / focal) * 180) / Math.PI
          return { bbox: p.bbox, cls: p.class, label: c.label, score: p.score, distance, angle, cut: y + h > H * 0.98 }
        })
      const old = tracksRef.current
      const used = new Set()
      const tracks = dets.map((d) => {
        let best = null, bestIou = 0.25
        old.forEach((t) => { const v = iou(t.bbox, d.bbox); if (v > bestIou && !used.has(t.id)) { best = t; bestIou = v } })
        if (!best) return { ...d, id: nextId++, closing: 0, age: 1 }
        used.add(best.id)
        const dist = best.distance * 0.6 + d.distance * 0.4
        const rawClosing = (best.distance - dist) / dt
        return { ...d, id: best.id, distance: dist, closing: best.closing * 0.75 + rawClosing * 0.25, age: best.age + 1 }
      })
      // grade danger
      const v = (speedRef.current || 0)
      const safe = Math.max(8, v / 2) // "halber Tacho" in metres
      tracks.forEach((t) => {
        t.inLane = Math.abs(t.angle) < LANE_ANGLE
        t.ttc = t.closing > 0.7 ? t.distance / t.closing : null
        t.level = 'ok'
        if (t.inLane && t.age > 2) {
          if ((t.ttc && t.ttc < 2.2) || (v > 15 && t.distance < safe * 0.5)) t.level = 'danger'
          else if ((t.ttc && t.ttc < 4) || (v > 15 && t.distance < safe)) t.level = 'warn'
        }
      })
      tracksRef.current = tracks
      onVehicles?.(tracks.filter((t) => t.cls !== 'person' || t.distance < 40).map((t) => ({
        id: t.id, label: t.label, cls: t.cls, distance: t.distance, angle: t.angle,
        closing: t.closing, ttc: t.ttc, inLane: t.inLane, level: t.level,
      })))
    }

    function draw(W, H) {
      const cv = canvasRef.current
      const video = videoRef.current
      if (!cv || !video) return
      const rect = video.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      if (cv.width !== Math.round(rect.width * dpr)) { cv.width = Math.round(rect.width * dpr); cv.height = Math.round(rect.height * dpr) }
      const ctx = cv.getContext('2d')
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, cv.width, cv.height)
      // object-fit: cover mapping
      const s = Math.max(rect.width / W, rect.height / H) * dpr
      const ox = (rect.width * dpr - W * s) / 2
      const oy = (rect.height * dpr - H * s) / 2
      // lane corridor
      ctx.strokeStyle = 'rgba(0,229,255,.25)'
      ctx.lineWidth = 2 * dpr
      ctx.setLineDash([10 * dpr, 10 * dpr])
      const cx = cv.width / 2
      ctx.beginPath(); ctx.moveTo(cx - cv.width * 0.32, cv.height); ctx.lineTo(cx - cv.width * 0.05, cv.height * 0.45)
      ctx.moveTo(cx + cv.width * 0.32, cv.height); ctx.lineTo(cx + cv.width * 0.05, cv.height * 0.45); ctx.stroke()
      ctx.setLineDash([])
      for (const t of tracksRef.current) {
        const [x, y, w, h] = t.bbox
        const X = ox + x * s, Y = oy + y * s, Wd = w * s, Ht = h * s
        const col = t.level === 'danger' ? '#ff2d55' : t.level === 'warn' ? '#ffb020' : t.inLane ? '#00e5ff' : '#7c8cff'
        ctx.strokeStyle = col
        ctx.shadowColor = col
        ctx.shadowBlur = 12 * dpr
        ctx.lineWidth = 3 * dpr
        const k = Math.min(Wd, Ht) * 0.25
        ctx.beginPath()
        ;[[X, Y, 1, 1], [X + Wd, Y, -1, 1], [X, Y + Ht, 1, -1], [X + Wd, Y + Ht, -1, -1]].forEach(([px, py, sx, sy]) => {
          ctx.moveTo(px + sx * k, py); ctx.lineTo(px, py); ctx.lineTo(px, py + sy * k)
        })
        ctx.stroke()
        ctx.shadowBlur = 0
        const txt = `${t.label} · ${Math.round(t.distance)} m${t.ttc ? ` · ${t.ttc.toFixed(1)} s` : ''}`
        ctx.font = `600 ${13 * dpr}px Inter, system-ui, sans-serif`
        const tw = ctx.measureText(txt).width + 12 * dpr
        ctx.fillStyle = 'rgba(5,8,16,.75)'
        ctx.fillRect(X, Math.max(0, Y - 22 * dpr), tw, 20 * dpr)
        ctx.fillStyle = col
        ctx.fillText(txt, X + 6 * dpr, Math.max(14 * dpr, Y - 7 * dpr))
      }
    }

    start()
    return () => {
      stop = true
      clearTimeout(raf)
      stream?.getTracks().forEach((t) => t.stop())
      onVehicles?.([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className={`vision ${expanded ? 'vision-full' : ''}`}>
      <video ref={videoRef} playsInline muted autoPlay />
      <canvas ref={canvasRef} />
      {status === 'loading' && <div className="vision-msg"><Loader2 className="spin" size={22} /> KI-Kamera startet …</div>}
      {status === 'error' && <div className="vision-msg err"><CameraOff size={22} /> {error}</div>}
      <div className="vision-bar">
        <span className="vision-tag"><i className={status === 'running' ? 'live' : ''} /> {status === 'running' ? `LIVE · ${fps} fps` : 'KAMERA'}</span>
        <button onClick={onToggleExpand} aria-label="Größe ändern">{expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
        <button onClick={onClose} aria-label="Kamera schließen"><X size={16} /></button>
      </div>
      {expanded && children}
    </div>
  )
}
