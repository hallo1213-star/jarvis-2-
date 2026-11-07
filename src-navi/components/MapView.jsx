// MapLibre map: dark neon style, 3D buildings, glowing route, user puck, detected vehicles.
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const STYLE_URL = 'https://tiles.openfreemap.org/styles/dark'
const FALLBACK_STYLE = {
  version: 8,
  sources: {
    carto: {
      type: 'raster', tileSize: 256,
      tiles: ['a', 'b', 'c', 'd'].map((s) => `https://${s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png`),
      attribution: '© OpenStreetMap-Mitwirkende © CARTO',
    },
  },
  layers: [{ id: 'carto', type: 'raster', source: 'carto' }],
}
const EMPTY = { type: 'FeatureCollection', features: [] }
const line = (coords) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } })

// Re-tint the vector style so it feels like a cockpit, not a paper map
function neonify(map) {
  const style = map.getStyle()
  for (const l of style.layers) {
    try {
      if (l.type === 'background') map.setPaintProperty(l.id, 'background-color', '#05070d')
      else if (l.id.includes('water') && l.type === 'fill') map.setPaintProperty(l.id, 'fill-color', '#06142a')
      else if (l.type === 'line' && /motorway|trunk/.test(l.id) && !/casing/.test(l.id)) map.setPaintProperty(l.id, 'line-color', '#3b3f8f')
      else if (l.type === 'line' && /primary|secondary|tertiary/.test(l.id) && !/casing/.test(l.id)) map.setPaintProperty(l.id, 'line-color', '#262b4a')
      else if (l.type === 'line' && /minor|service|street|road/.test(l.id) && !/casing/.test(l.id)) map.setPaintProperty(l.id, 'line-color', '#1b1f33')
      else if (l.type === 'symbol' && l.layout?.['text-field']) {
        map.setPaintProperty(l.id, 'text-color', '#9aa4c7')
        map.setPaintProperty(l.id, 'text-halo-color', '#05070d')
      }
      if (l.type === 'fill-extrusion' || (l.type === 'fill' && l.id.includes('building'))) map.setLayoutProperty(l.id, 'visibility', 'none')
    } catch { /* layer without that property */ }
  }
  const vectorSource = Object.entries(style.sources).find(([, s]) => s.type === 'vector')?.[0]
  if (vectorSource && !map.getLayer('nova-buildings')) {
    const firstSymbol = style.layers.find((l) => l.type === 'symbol')?.id
    map.addLayer({
      id: 'nova-buildings', type: 'fill-extrusion', source: vectorSource, 'source-layer': 'building', minzoom: 14,
      paint: {
        'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 8], 0, '#121733', 40, '#24206b', 120, '#4b2a9a'],
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 14, 0, 15.5, ['coalesce', ['get', 'render_height'], 8]],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.85,
      },
    }, firstSymbol)
  }
}

function addOverlays(map) {
  const before = map.getStyle().layers.find((l) => l.type === 'symbol')?.id
  map.addSource('alts', { type: 'geojson', data: EMPTY })
  map.addSource('route', { type: 'geojson', data: EMPTY, lineMetrics: true })
  map.addSource('done', { type: 'geojson', data: EMPTY })
  map.addSource('vehicles', { type: 'geojson', data: EMPTY })
  map.addSource('dest', { type: 'geojson', data: EMPTY })
  map.addLayer({ id: 'alts', type: 'line', source: 'alts', layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#5b6290', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 3, 16, 9], 'line-opacity': 0.7 } }, before)
  map.addLayer({ id: 'route-glow', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#00e5ff', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 10, 16, 30], 'line-blur': 14, 'line-opacity': 0.55 } }, before)
  map.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, 4, 16, 12],
      'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, '#00e5ff', 0.5, '#6a7bff', 1, '#d04bff'],
    } }, before)
  map.addLayer({ id: 'done', type: 'line', source: 'done', layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#2a2f4a', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 4, 16, 12] } }, before)
  map.addLayer({ id: 'vehicles-glow', type: 'circle', source: 'vehicles',
    paint: { 'circle-radius': 16, 'circle-blur': 1, 'circle-opacity': 0.8,
      'circle-color': ['match', ['get', 'level'], 'danger', '#ff2d55', 'warn', '#ffb020', '#00e5ff'] } })
  map.addLayer({ id: 'vehicles', type: 'circle', source: 'vehicles',
    paint: { 'circle-radius': 6, 'circle-color': '#fff', 'circle-stroke-width': 3,
      'circle-stroke-color': ['match', ['get', 'level'], 'danger', '#ff2d55', 'warn', '#ffb020', '#00e5ff'] } })
  map.addLayer({ id: 'dest-glow', type: 'circle', source: 'dest', paint: { 'circle-radius': 22, 'circle-color': '#d04bff', 'circle-blur': 1 } })
  map.addLayer({ id: 'dest', type: 'circle', source: 'dest', paint: { 'circle-radius': 8, 'circle-color': '#fff', 'circle-stroke-color': '#d04bff', 'circle-stroke-width': 4 } })
}

function puckElement() {
  const el = document.createElement('div')
  el.className = 'puck'
  el.innerHTML = '<div class="puck-pulse"></div><svg viewBox="0 0 40 40" class="puck-arrow"><defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7ff6ff"/><stop offset="1" stop-color="#6a7bff"/></linearGradient></defs><path d="M20 3 L34 35 L20 27 L6 35 Z" fill="url(#pg)" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>'
  return el
}

const MapView = forwardRef(function MapView({ onUserPan, onLongPress }, ref) {
  const box = useRef(null)
  const mapRef = useRef(null)
  const puckRef = useRef(null)
  const ready = useRef(false)
  const pending = useRef({})
  const following = useRef(false)

  useEffect(() => {
    const map = new maplibregl.Map({
      container: box.current,
      style: STYLE_URL,
      center: [10.45, 51.16],
      zoom: 5,
      attributionControl: { compact: true },
      maxPitch: 75,
      fadeDuration: 0,
    })
    mapRef.current = map
    let fellBack = false
    map.on('error', (e) => {
      if (!ready.current && !fellBack && /style|Failed to fetch|NetworkError|404/i.test(String(e?.error?.message || e?.error))) {
        fellBack = true
        map.setStyle(FALLBACK_STYLE)
      }
    })
    map.on('style.load', () => {
      try { neonify(map) } catch { /* fallback raster */ }
      addOverlays(map)
      ready.current = true
      Object.entries(pending.current).forEach(([id, data]) => map.getSource(id)?.setData(data))
    })
    const userMove = (e) => { if (e.originalEvent && following.current) { following.current = false; onUserPan?.() } }
    map.on('dragstart', userMove)
    map.on('zoomstart', userMove)
    map.on('rotatestart', userMove)
    map.on('pitchstart', userMove)
    map.on('contextmenu', (e) => onLongPress?.([e.lngLat.lng, e.lngLat.lat]))
    puckRef.current = new maplibregl.Marker({ element: puckElement(), rotationAlignment: 'map', pitchAlignment: 'map' })
    return () => map.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setData = (id, data) => {
    pending.current[id] = data
    if (ready.current) mapRef.current.getSource(id)?.setData(data)
  }

  useImperativeHandle(ref, () => ({
    get map() { return mapRef.current },
    center() { const c = mapRef.current.getCenter(); return [c.lng, c.lat] },
    setUser(pos, heading) {
      if (!pos) return
      const m = puckRef.current
      m.setLngLat(pos)
      m.setRotation(heading || 0)
      if (!m._map) m.addTo(mapRef.current)
    },
    setRoute(coords) { setData('route', coords ? line(coords) : EMPTY) },
    setDone(coords) { setData('done', coords && coords.length > 1 ? line(coords) : EMPTY) },
    setAlternatives(list) { setData('alts', { type: 'FeatureCollection', features: (list || []).map((c) => line(c)) }) },
    setDestination(coord) { setData('dest', coord ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: coord } }] } : EMPTY) },
    setVehicles(items) {
      setData('vehicles', { type: 'FeatureCollection', features: items.map((v) => ({ type: 'Feature', properties: { level: v.level }, geometry: { type: 'Point', coordinates: v.coord } })) })
    },
    fitRoute(coords, padding) {
      const b = coords.reduce((bb, c) => bb.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]))
      following.current = false
      mapRef.current.fitBounds(b, { padding, pitch: 0, bearing: 0, duration: 900, maxZoom: 16 })
    },
    flyTo(pos, zoom = 15) { following.current = false; mapRef.current.flyTo({ center: pos, zoom, pitch: 0, bearing: 0, duration: 1200 }) },
    follow(pos, heading, speed, mode3d, offsetY) {
      following.current = true
      const z = mode3d ? Math.max(15.3, 17.6 - (speed || 0) / 14) : 16
      mapRef.current.easeTo({
        center: pos, bearing: mode3d ? heading || 0 : 0, pitch: mode3d ? 62 : 0, zoom: z,
        offset: [0, offsetY], duration: 900, easing: (t) => t,
      })
    },
    isFollowing() { return following.current },
  }))

  return <div ref={box} className="map" />
})

export default MapView
