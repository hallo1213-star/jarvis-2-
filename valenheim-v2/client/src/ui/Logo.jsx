// Valenheim-Logo: Flaggen-Emblem + Schriftzug
export function Emblem({ size = 84 }) {
  return (
    <svg width={size} height={size * 0.66} viewBox="0 0 120 80" aria-hidden="true">
      <rect width="120" height="80" rx="6" fill="#0d1f45" />
      <path d="M24 10 L60 70 L96 10" fill="none" stroke="#fff" strokeWidth="14" strokeLinejoin="round" />
      <path d="M24 10 L60 70 L96 10" fill="none" stroke="#d4af37" strokeWidth="9" strokeLinejoin="round" />
      <polygon fill="#fff" points={Array.from({ length: 14 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 7; const r = i % 2 ? 4 : 9; return `${60 + Math.cos(a) * r},${25 + Math.sin(a) * r}`; }).join(' ')} />
    </svg>
  );
}
export default function Logo({ small = false }) {
  return (
    <div className={`logo ${small ? 'logo--small' : ''}`}>
      <Emblem size={small ? 44 : 96} />
      <div className="logo__text">
        <div className="logo__title">VALENHEIM</div>
        <div className="logo__sub">THE CITY CHALLENGE 2.0</div>
      </div>
    </div>
  );
}
