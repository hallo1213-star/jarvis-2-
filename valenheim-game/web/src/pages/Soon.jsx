import Logo from '../ui/Logo.jsx';
// Ehrliche Platzhalterseite für Bereiche, die noch nicht gebaut sind.
export default function Soon({ titel, phase }) {
  return (
    <div className="page page--center">
      <Logo small />
      <div className="card soon">
        <div className="eyebrow">NOCH NICHT VERFÜGBAR</div>
        <h1>{titel}</h1>
        <p>Dieser Bereich wird in <b>Phase {phase}</b> gebaut und ist noch nicht freigeschaltet.</p>
        <a className="btn btn--ghost" href="#/">Zurück zur Startseite</a>
      </div>
    </div>
  );
}
