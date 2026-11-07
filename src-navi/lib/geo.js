// Small geo helpers (WGS84, coordinates as [lng, lat] like GeoJSON / MapLibre)
const R = 6371008.8
const rad = (d) => (d * Math.PI) / 180
const deg = (r) => (r * 180) / Math.PI

export function distance(a, b) {
  const dLat = rad(b[1] - a[1])
  const dLng = rad(b[0] - a[0])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function bearing(a, b) {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]))
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]))
  return (deg(Math.atan2(y, x)) + 360) % 360
}

// Point `dist` metres from `p` in direction `brg` degrees
export function destination(p, brg, dist) {
  const d = dist / R
  const t = rad(brg)
  const la1 = rad(p[1])
  const lo1 = rad(p[0])
  const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(t))
  const lo2 = lo1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2))
  return [deg(lo2), deg(la2)]
}

// Project point onto a polyline. Returns { point, index, along, offset }:
// index = segment index, along = metres from the start of the line, offset = metres from the line.
export function snapToLine(line, p) {
  let best = { point: line[0], index: 0, along: 0, offset: Infinity }
  let acc = 0
  const cosLat = Math.cos(rad(p[1]))
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]
    const b = line[i + 1]
    // local equirectangular projection (fine for short segments)
    const ax = (a[0] - p[0]) * cosLat, ay = a[1] - p[1]
    const bx = (b[0] - p[0]) * cosLat, by = b[1] - p[1]
    const dx = bx - ax, dy = by - ay
    const len2 = dx * dx + dy * dy
    let t = len2 ? -(ax * dx + ay * dy) / len2 : 0
    t = Math.max(0, Math.min(1, t))
    const q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    const off = distance(p, q)
    const segLen = distance(a, b)
    if (off < best.offset) best = { point: q, index: i, along: acc + segLen * t, offset: off }
    acc += segLen
  }
  return best
}

export function lineLength(line) {
  let s = 0
  for (let i = 0; i < line.length - 1; i++) s += distance(line[i], line[i + 1])
  return s
}

// Point at `along` metres on the line, plus the heading there
export function pointAlong(line, along) {
  let acc = 0
  for (let i = 0; i < line.length - 1; i++) {
    const seg = distance(line[i], line[i + 1])
    if (acc + seg >= along) {
      const t = seg ? (along - acc) / seg : 0
      const a = line[i], b = line[i + 1]
      return { point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], heading: bearing(a, b) }
    }
    acc += seg
  }
  const n = line.length
  return { point: line[n - 1], heading: n > 1 ? bearing(line[n - 2], line[n - 1]) : 0 }
}

export function formatDistance(m) {
  if (m == null || !isFinite(m)) return '–'
  if (m < 50) return `${Math.max(0, Math.round(m / 5) * 5)} m`
  if (m < 1000) return `${Math.round(m / 10) * 10} m`
  if (m < 10000) return `${(m / 1000).toFixed(1).replace('.', ',')} km`
  return `${Math.round(m / 1000)} km`
}

export function formatDuration(s) {
  if (s == null || !isFinite(s)) return '–'
  const min = Math.round(s / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  return `${h} h ${String(min % 60).padStart(2, '0')}`
}

export function formatClock(date) {
  return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}
