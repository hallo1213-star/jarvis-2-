// Top-down radar of what the camera sees ahead
export default function Radar({ vehicles, range = 60 }) {
  const W = 120, H = 150
  const ox = W / 2, oy = H - 18
  const scale = (H - 30) / range
  return (
    <div className="radar">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <radialGradient id="rg" cx="50%" cy="100%" r="100%">
            <stop offset="0" stopColor="rgba(0,229,255,.22)" />
            <stop offset="1" stopColor="rgba(0,229,255,0)" />
          </radialGradient>
        </defs>
        <path d={`M${ox} ${oy} L${ox - 70} ${oy - 140} A160 160 0 0 1 ${ox + 70} ${oy - 140} Z`} fill="url(#rg)" />
        {[20, 40, 60].map((d) => (
          <g key={d}>
            <line x1="8" x2={W - 8} y1={oy - d * scale} y2={oy - d * scale} stroke="rgba(255,255,255,.08)" />
            <text x={W - 8} y={oy - d * scale - 3} fill="rgba(255,255,255,.35)" fontSize="8" textAnchor="end">{d} m</text>
          </g>
        ))}
        <line x1={ox - 16} x2={ox - 16} y1={oy} y2="8" stroke="rgba(0,229,255,.18)" strokeDasharray="4 4" />
        <line x1={ox + 16} x2={ox + 16} y1={oy} y2="8" stroke="rgba(0,229,255,.18)" strokeDasharray="4 4" />
        {vehicles.filter((v) => v.distance < range).map((v) => {
          const a = (v.angle * Math.PI) / 180
          const x = ox + Math.sin(a) * v.distance * scale * 1.6
          const y = oy - Math.cos(a) * v.distance * scale
          const col = v.level === 'danger' ? '#ff2d55' : v.level === 'warn' ? '#ffb020' : v.inLane ? '#00e5ff' : '#7c8cff'
          const big = v.cls === 'truck' || v.cls === 'bus'
          return <rect key={v.id} x={x - (big ? 7 : 5)} y={y - (big ? 10 : 7)} width={big ? 14 : 10} height={big ? 20 : 14} rx="3" fill={col} style={{ filter: `drop-shadow(0 0 4px ${col})` }} />
        })}
        <path d={`M${ox} ${oy - 9} L${ox + 7} ${oy + 7} L${ox} ${oy + 3} L${ox - 7} ${oy + 7} Z`} fill="#fff" />
      </svg>
    </div>
  )
}
