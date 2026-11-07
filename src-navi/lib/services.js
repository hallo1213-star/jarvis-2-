// Free, key-less map services: OSRM (routing), Photon (search), Overpass (speed limits)
import { distance } from './geo.js'

const OSRM = 'https://router.project-osrm.org/route/v1/driving'
const PHOTON = 'https://photon.komoot.io'
const OVERPASS = 'https://overpass-api.de/api/interpreter'

// ---------- Search ----------
function photonLabel(p) {
  const name = p.name || [p.street, p.housenumber].filter(Boolean).join(' ')
  const place = [p.postcode, p.city || p.town || p.village || p.county].filter(Boolean).join(' ')
  const sub = [p.name && p.street ? [p.street, p.housenumber].filter(Boolean).join(' ') : null, place, p.country]
    .filter(Boolean).join(', ')
  return { name: name || place || 'Ort', sub }
}

export async function searchPlaces(query, near, limit = 7) {
  const u = new URL(`${PHOTON}/api/`)
  u.searchParams.set('q', query)
  u.searchParams.set('lang', 'de')
  u.searchParams.set('limit', String(limit))
  if (near) { u.searchParams.set('lat', near[1]); u.searchParams.set('lon', near[0]) }
  const res = await fetch(u)
  if (!res.ok) throw new Error(`Suche fehlgeschlagen (${res.status})`)
  const data = await res.json()
  return data.features.map((f) => {
    const { name, sub } = photonLabel(f.properties)
    const coord = f.geometry.coordinates
    return {
      id: `${f.properties.osm_type}${f.properties.osm_id}`,
      name, sub, coord,
      kind: f.properties.osm_value || f.properties.type,
      dist: near ? distance(near, coord) : null,
    }
  })
}

export async function reverseGeocode(p) {
  try {
    const res = await fetch(`${PHOTON}/reverse?lat=${p[1]}&lon=${p[0]}&lang=de&limit=1`)
    const data = await res.json()
    const f = data.features?.[0]
    if (!f) return null
    return photonLabel(f.properties)
  } catch { return null }
}

// ---------- Routing ----------
const DIR = {
  left: 'links', right: 'rechts', 'slight left': 'leicht links', 'slight right': 'leicht rechts',
  'sharp left': 'scharf links', 'sharp right': 'scharf rechts', straight: 'geradeaus', uturn: 'wenden',
}
const ORD = ['', 'erste', 'zweite', 'dritte', 'vierte', 'fünfte', 'sechste', 'siebte', 'achte']

export function instruction(step) {
  const m = step.maneuver
  const mod = m.modifier
  const dir = DIR[mod] || ''
  const road = step.name ? (step.ref ? `${step.name} (${step.ref})` : step.name) : step.ref || ''
  const onto = road ? ` auf ${road}` : ''
  switch (m.type) {
    case 'depart': return `Starte${road ? ` auf ${road}` : ''}`
    case 'arrive':
      return mod === 'left' ? 'Das Ziel liegt links' : mod === 'right' ? 'Das Ziel liegt rechts' : 'Ziel erreichen'
    case 'roundabout': case 'rotary': case 'roundabout turn': {
      const n = m.exit
      return n ? `Im Kreisverkehr die ${ORD[n] || `${n}.`} Ausfahrt nehmen${onto}` : `In den Kreisverkehr fahren${onto}`
    }
    case 'exit roundabout': case 'exit rotary': return `Kreisverkehr verlassen${onto}`
    case 'merge': return `Einfädeln${dir ? ` ${dir}` : ''}${onto}`
    case 'on ramp': return `Auffahrt ${dir ? `${dir} ` : ''}nehmen${onto}`
    case 'off ramp': return `Ausfahrt ${dir ? `${dir} ` : ''}nehmen${onto}`
    case 'fork': return `An der Gabelung ${dir || 'weiter'} halten${onto}`
    case 'end of road': return `Am Straßenende ${dir} abbiegen${onto}`
    case 'continue': case 'new name':
      return mod === 'straight' || !mod ? `Weiter geradeaus${onto}` : `${cap(dir)} halten${onto}`
    case 'turn': default:
      if (mod === 'uturn') return 'Bitte wenden'
      if (mod === 'straight') return `Geradeaus weiter${onto}`
      return `${cap(dir || 'weiter')} abbiegen${onto}`
  }
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

export function maneuverIcon(step) {
  const m = step.maneuver
  if (m.type === 'arrive') return 'arrive'
  if (m.type?.includes('roundabout') || m.type?.includes('rotary')) return 'roundabout'
  if (m.modifier === 'uturn') return 'uturn'
  if (m.modifier?.includes('left')) return m.modifier.includes('slight') ? 'slight-left' : 'left'
  if (m.modifier?.includes('right')) return m.modifier.includes('slight') ? 'slight-right' : 'right'
  return 'straight'
}

export async function fetchRoutes(from, to, { alternatives = true } = {}) {
  const url = `${OSRM}/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson&steps=true&alternatives=${alternatives}&annotations=false`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Routing fehlgeschlagen (${res.status})`)
  const data = await res.json()
  if (data.code !== 'Ok' || !data.routes?.length) throw new Error('Keine Route gefunden')
  return data.routes.map((r, i) => {
    const steps = []
    let along = 0
    for (const leg of r.legs) {
      for (const s of leg.steps) {
        steps.push({
          text: instruction(s),
          icon: maneuverIcon(s),
          location: s.maneuver.location,
          type: s.maneuver.type,
          name: s.name || s.ref || '',
          startAlong: along, // metres from route start where this maneuver happens
          distance: s.distance,
        })
        along += s.distance
      }
    }
    return {
      id: i,
      geometry: r.geometry.coordinates,
      distance: r.distance,
      duration: r.duration,
      steps,
      summary: r.legs.map((l) => l.summary).filter(Boolean).join(', '),
    }
  })
}

// ---------- Speed limit around a position ----------
export async function fetchSpeedLimit(p) {
  const q = `[out:json][timeout:8];way(around:25,${p[1]},${p[0]})[highway][maxspeed];out tags 3;`
  const res = await fetch(OVERPASS, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
  if (!res.ok) return null
  const data = await res.json()
  for (const el of data.elements || []) {
    const v = el.tags?.maxspeed
    if (!v) continue
    if (v === 'none' || v === 'DE:motorway') return { value: null, label: 'frei' }
    if (v === 'DE:urban') return { value: 50, label: '50' }
    if (v === 'DE:rural') return { value: 100, label: '100' }
    if (v === 'DE:zone30' || v === 'DE:zone:30') return { value: 30, label: '30' }
    const n = parseInt(v, 10)
    if (n) return { value: v.includes('mph') ? Math.round(n * 1.609) : n, label: String(n) }
  }
  return null
}
