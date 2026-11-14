import { useRef, useState } from 'react';
import Logo from './Logo.jsx';
import { leistungstest } from '../core/benchmark.js';
import { PROFILE, STUFEN, geraet, speichereTest, testErgebnis, zielFps } from '../core/quality.js';

// Misst die echte Leistung DIESES Geräts in allen drei Grafikstufen. Ergebnis zum Screenshot/Kopieren.
export default function Leistungstest() {
  const canvas = useRef(null);
  const [laeuft, setLaeuft] = useState(false); const [fort, setFort] = useState({ text: '', anteil: 0 });
  const [erg, setErg] = useState(testErgebnis()); const [kopiert, setKopiert] = useState(false);
  const g = erg?.geraet || geraet();

  async function starten() {
    setLaeuft(true); setKopiert(false);
    try { const r = await leistungstest(canvas.current, (text, anteil) => setFort({ text, anteil })); speichereTest(r); setErg(r); }
    catch (e) { setFort({ text: 'Fehler: ' + e.message, anteil: 0 }); }
    finally { setLaeuft(false); }
  }
  const text = erg && [
    'VALENHEIM 2.0 – Leistungstest', `Gerät: ${erg.geraet.mobil ? 'Mobil' : 'PC'} · ${erg.geraet.browser} · ${erg.geraet.bildschirm} · DPR ${erg.geraet.dpr}`,
    `Grafikchip: ${erg.geraet.gpu}`, `Kerne: ${erg.geraet.kerne} · Speicher: ${erg.geraet.speicherGB ? erg.geraet.speicherGB + ' GB' : 'unbekannt'}`,
    ...STUFEN.map((s) => `${PROFILE[s].name}: ${erg.ergebnisse[s].fps} FPS (Tiefstwert ${erg.ergebnisse[s].tief}) · ${erg.ergebnisse[s].calls} Aufrufe · ${(erg.ergebnisse[s].dreiecke / 1e6).toFixed(2)} Mio Dreiecke`),
    `Empfehlung: ${PROFILE[erg.empfehlung].name} (Ziel ${erg.ziel} FPS)`,
  ].join('\n');

  return (
    <div className="seite">
      <div className="seite__kopf"><a className="zurueck" href="#/" aria-label="Zurück">←</a><Logo small /></div>
      <div className="inhalt">
        <div><div className="eyebrow">Phase 1 · Geräteprüfung</div><h1 className="h1">Leistungstest</h1>
          <p className="sub">Misst etwa 15 Sekunden lang eine stadtähnliche Szene in den Stufen Niedrig, Mittel und Hoch. Danach weiß das Spiel, welche Stufe auf diesem Gerät flüssig läuft (Ziel: {zielFps(g)} Bilder pro Sekunde). Bitte das Gerät währenddessen nicht bedienen.</p></div>
        <div className="card stack">
          <div ref={canvas} aria-label="Testszene">{!laeuft && !erg && <div className="lt__canvas" style={{ display: 'grid', placeItems: 'center', color: '#93a0b8', fontSize: 13 }}>Testszene erscheint hier</div>}</div>
          {laeuft ? <><div className="balken"><div style={{ width: `${Math.round(fort.anteil * 100)}%` }} /></div><p className="sub">{fort.text}</p></>
            : <button className="btn btn--gold" onClick={starten}>{erg ? 'TEST WIEDERHOLEN' : 'TEST STARTEN'}</button>}
        </div>
        {erg && !laeuft && (
          <div className="card stack">
            <div className="eyebrow">Ergebnis</div>
            <div style={{ overflowX: 'auto' }}><table className="tabelle"><thead><tr><th>Stufe</th><th>FPS</th><th>Tiefstwert</th><th>Aufrufe</th><th>Dreiecke</th></tr></thead>
              <tbody>{STUFEN.map((s) => <tr key={s} className={s === erg.empfehlung ? 'empf' : ''}><td>{PROFILE[s].name}{s === erg.empfehlung ? ' ★' : ''}</td><td>{erg.ergebnisse[s].fps}</td><td>{erg.ergebnisse[s].tief}</td><td>{erg.ergebnisse[s].calls}</td><td>{(erg.ergebnisse[s].dreiecke / 1e6).toFixed(2)} Mio</td></tr>)}</tbody>
            </table></div>
            <p className="sub">Empfohlene Stufe: <b style={{ color: '#f0d27a' }}>{PROFILE[erg.empfehlung].name}</b>. Bei „Grafik: Automatisch“ nutzt das Spiel diese Stufe und senkt sie selbst, wenn es ruckelt.</p>
            <div className="daten">
              {[['Gerät', `${erg.geraet.mobil ? 'Mobil' : 'PC'} · ${erg.geraet.browser}`], ['Grafikchip', erg.geraet.gpu], ['Bildschirm', `${erg.geraet.bildschirm} · DPR ${erg.geraet.dpr}`], ['Prozessor', `${erg.geraet.kerne || '?'} Kerne`], ['Arbeitsspeicher', erg.geraet.speicherGB ? `${erg.geraet.speicherGB} GB` : 'vom Browser nicht verraten'], ['Max. Texturgröße', erg.geraet.maxTex]].map(([k, v]) => <div key={k} className="datum"><small>{k}</small><b>{v}</b></div>)}
            </div>
            <button className="btn btn--ghost" onClick={async () => { try { await navigator.clipboard.writeText(text); setKopiert(true); } catch { setKopiert(false); } }}>{kopiert ? 'KOPIERT ✓ – jetzt an Claude schicken' : 'ERGEBNIS KOPIEREN'}</button>
          </div>
        )}
      </div>
    </div>
  );
}
