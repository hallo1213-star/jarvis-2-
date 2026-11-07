// Turn arrows for the maneuver card
export function ManeuverIcon({ icon, size = 56 }) {
  const p = {
    straight: 'M24 44V10M14 20l10-10 10 10',
    left: 'M30 44V26a6 6 0 0 0-6-6H10M18 12l-8 8 8 8',
    right: 'M18 44V26a6 6 0 0 1 6-6h14M30 12l8 8-8 8',
    'slight-left': 'M30 44V28L16 14M16 26V14h12',
    'slight-right': 'M18 44V28l14-14M32 26V14H20',
    uturn: 'M32 44V18a8 8 0 0 0-16 0v14M10 26l6 6 6-6',
    roundabout: 'M24 44V32M24 32a8 8 0 1 0-8-8M10 18l6 6 6-6',
    arrive: 'M24 6c-7 0-12 5-12 12 0 9 12 22 12 22s12-13 12-22c0-7-5-12-12-12zM24 22a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  }[icon] || 'M24 44V10M14 20l10-10 10 10'
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={p} />
    </svg>
  )
}

export function NovaOrb({ state = 'idle', size = 44 }) {
  return (
    <span className={`orb orb-${state}`} style={{ width: size, height: size }}>
      <span className="orb-core" />
      <span className="orb-ring" />
    </span>
  )
}
