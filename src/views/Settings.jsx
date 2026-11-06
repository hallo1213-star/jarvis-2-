import { useEffect, useState } from 'react'
import { Download, Share, PlusSquare, ShieldCheck, Trash2, Music2, Check, Infinity as InfinityIcon } from 'lucide-react'
import { LICENSE, TRACKS } from '../data/catalog.js'
import { useLibrary } from '../store/LibraryContext.jsx'
import { usePlayer } from '../store/PlayerContext.jsx'
import { toast } from '../store/toast.js'
import { Confirm, Logo, PageHeader, Section } from '../components/ui.jsx'

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true

let deferredPrompt = null
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e
    window.dispatchEvent(new Event('aurix:installable'))
  })
}

export default function Settings() {
  const lib = useLibrary()
  const player = usePlayer()
  const [name, setName] = useState(lib.profile.name || '')
  const [reset, setReset] = useState(false)
  const [canInstall, setCanInstall] = useState(Boolean(deferredPrompt))
  const standalone = isStandalone()

  useEffect(() => {
    const h = () => setCanInstall(true)
    window.addEventListener('aurix:installable', h)
    return () => window.removeEventListener('aurix:installable', h)
  }, [])

  const install = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    deferredPrompt = null
    setCanInstall(false)
    if (outcome === 'accepted') toast('AURIX wird installiert')
  }

  return (
    <div className="page">
      <PageHeader title="Profil & Einstellungen" back="/" />

      <Section title="Profil">
        <form className="settings-card" onSubmit={(e) => {
          e.preventDefault()
          lib.setProfile((p) => ({ ...p, name: name.trim() }))
          toast('Profil gespeichert')
          e.target.querySelector('input')?.blur()
        }}>
          <label className="field">
            <span>Dein Name (für die Begrüßung)</span>
            <input value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder="z. B. Alex" enterKeyHint="done" />
          </label>
          <button className="btn primary" type="submit" disabled={name.trim() === (lib.profile.name || '')}><Check size={18} /> Speichern</button>
        </form>
      </Section>

      <Section title="App installieren">
        <div className="settings-card">
          {standalone ? (
            <p className="ok-line"><Check size={18} /> AURIX läuft bereits als installierte App.</p>
          ) : isIOS() ? (
            <ol className="install-steps">
              <li><Share size={18} /> In Safari unten auf <strong>Teilen</strong> tippen</li>
              <li><PlusSquare size={18} /> <strong>Zum Home-Bildschirm</strong> wählen</li>
              <li><Music2 size={18} /> AURIX wie eine native App starten – mit eigenem Icon & Startbildschirm</li>
            </ol>
          ) : canInstall ? (
            <button className="btn primary" onClick={install}><Download size={18} /> AURIX installieren</button>
          ) : (
            <p className="muted">Öffne das Browser-Menü (Chrome/Edge: Symbol in der Adressleiste) und wähle „App installieren“.</p>
          )}
        </div>
      </Section>

      <Section title="Alles inklusive">
        <div className="settings-card perks">
          {['Unbegrenztes Überspringen', 'Unbegrenzt viele Playlists', 'Favoriten & Bibliothek', 'Zufall & Wiederholen', 'Hintergrundwiedergabe (Sperrbildschirm-Steuerung)', 'Keine Werbung, keine Limits'].map((x) => (
            <span key={x}><InfinityIcon size={16} /> {x}</span>
          ))}
        </div>
      </Section>

      <Section title="Wiedergabe">
        <div className="settings-card">
          <p className="muted small-text">
            {player.volumeSupported
              ? 'Die Lautstärke wird direkt im Player geregelt.'
              : 'Auf iPhone & iPad regelt der AURIX-Schieberegler die Lautstärke relativ zur Systemlautstärke (Hardware-Tasten).'}
            {' '}Tastatur: Leertaste = Play/Pause, ←/→ = 5 s spulen, Shift + ←/→ = Titel wechseln, M = Stumm.
          </p>
        </div>
      </Section>

      <Section title="Musik & Rechte">
        <div className="settings-card">
          <p className="ok-line"><ShieldCheck size={18} /> {TRACKS.length} Demo-Titel · {LICENSE.name}</p>
          <p className="muted small-text">{LICENSE.note} Künstler und Releases des Demo-Katalogs sind Projektnamen der AURIX Originals.</p>
          <a className="link-btn" href={LICENSE.url} target="_blank" rel="noreferrer">Lizenztext ansehen</a>
        </div>
      </Section>

      <Section title="Daten">
        <div className="settings-card">
          <p className="muted small-text">Favoriten, Playlists, Verlauf und Einstellungen werden lokal auf diesem Gerät gespeichert.</p>
          <button className="btn danger" onClick={() => setReset(true)}><Trash2 size={18} /> Alle Daten zurücksetzen</button>
        </div>
      </Section>

      <div className="about-foot">
        <Logo size={26} />
        <p>MUSIC WITHOUT LIMITS.</p>
        <span className="muted small-text">Version 1.0.0</span>
      </div>

      <Confirm open={reset} onClose={() => setReset(false)} title="Alles zurücksetzen?"
        text="Favoriten, Playlists, Verlauf und Profil werden von diesem Gerät gelöscht." confirm="Zurücksetzen" onConfirm={lib.resetAll} />
    </div>
  )
}
