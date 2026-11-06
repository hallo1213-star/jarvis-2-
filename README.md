# AURIX – MUSIC WITHOUT LIMITS.

Premium-Musik-Streaming als Progressive Web App. Mobile-first, optimiert für Safari auf dem iPhone, läuft genauso unter Windows/macOS im Browser – installierbar ohne App Store.

## Funktionen

- **Startseite:** Begrüßung nach Tageszeit (mit deinem Namen), Suche, Zuletzt gehört, Empfehlungen (lernen aus Favoriten & Verlauf), Neuerscheinungen, Stimmungen, Künstler, eigene Playlists
- **Player:** Play/Pause, vor/zurück, Waveform-Scrubber mit echten Pegeldaten, Lautstärke, Zufall, Wiederholen (aus/alle/einen), Warteschlange („Als Nächstes“, „Zur Warteschlange“), Mini-Player, Vollbild-Player mit animiertem Hintergrund
- **Gesten:** Mini-Player wischen = Titel wechseln, nach oben = Vollbild; Cover im Vollbild wischen = Titel wechseln; nach unten ziehen = schließen
- **Bibliothek:** Playlists erstellen / umbenennen / sortieren / löschen, Songs hinzufügen & entfernen, Favoriten, Zuletzt gehört, gefolgte Künstler, Alben
- **Bereiche:** Start, Entdecken, Suche (mit Filtern & Suchverlauf), Bibliothek, Favoriten, Playlists, Zuletzt gehört, Stimmungen, Künstler- und Albumseiten, Einstellungen
- **Alles kostenlos:** unbegrenztes Überspringen, unbegrenzt Playlists, keine Werbung, keine Sperren
- **Hintergrundwiedergabe & Sperrbildschirm:** Media Session API (Titel, Cover, Play/Pause/Skip/Spulen)
- **PWA:** eigenes Icon, Startbildschirme für alle aktuellen iPhones/iPads, Offline-App-Shell, gehörte Titel werden fürs Offline-Hören zwischengespeichert
- **Desktop:** Seitenleiste, Player-Leiste, Tastatur (Leertaste, ←/→ spulen, Shift+←/→ Titel, M stumm)
- Alle Daten bleiben lokal (LocalStorage)

## Musik & Rechte

**Audius-Katalog (live):** Trends, Genres, Suche und Künstlerseiten kommen über die offizielle, kostenlose Audius-API (`api.audius.co`, kein Schlüssel nötig). Audius ist eine offene Plattform, auf der Künstler ihre Songs selbst hochladen und zum freien Streamen freigeben – die Rechte bleiben bei den Künstlern. AURIX spielt nur frei streambare Titel (keine kostenpflichtigen/gesperrten) und zeigt die Quelle („via Audius“) an. Genutzte Titel werden lokal gemerkt, damit Favoriten und Playlists erhalten bleiben.

**AURIX Originals:**

Der Demo-Katalog (12 Titel, 6 EPs) besteht ausschließlich aus **AURIX Originals**: Jeder Titel wird von `scripts/generate_music.py` mit Oszillatoren, Rauschen und Mathematik komplett neu komponiert und synthetisiert – keine Samples, keine fremden Aufnahmen, keine externen Streaming-Links. Musik und Cover-Art werden unter **CC0 1.0** (Public Domain) bereitgestellt. Künstler- und Albumnamen sind Projektnamen dieses Katalogs.

## Auf dem iPhone nutzen

1. Die App muss einmal über HTTPS gehostet werden. Am einfachsten mit **GitHub Pages** (Workflow liegt bei):
   GitHub → Repository → *Settings* → *Pages* → *Source: GitHub Actions*. Danach wird bei jedem Push auf `main` automatisch gebaut und veröffentlicht.
   Alternativ: Ordner `dist/` bei Netlify/Vercel/Cloudflare Pages hochladen (keine Server-Konfiguration nötig, Hash-Routing).
2. Die URL in **Safari** öffnen → **Teilen** → **Zum Home-Bildschirm**.
3. AURIX startet jetzt wie eine native App im Vollbild mit eigenem Icon und Startbildschirm.

Hinweis iOS: Die Hardware-Tasten regeln die Systemlautstärke; der AURIX-Regler arbeitet relativ dazu (iOS erlaubt keine direkte Lautstärkesteuerung von Audio-Elementen, daher wird dafür Web Audio genutzt, sobald du den Regler bewegst).

## Entwicklung

```bash
npm install
npm run dev        # Entwicklungsserver
npm run build      # Produktions-Build nach dist/ (inkl. Service Worker)
npm run preview    # Build lokal testen
```

Assets neu erzeugen (optional):

```bash
pip install numpy scipy        # + ffmpeg mit libmp3lame
npm run generate:music         # komponiert public/audio/*.mp3 + Waveform-Daten
npm run generate:assets        # Icons, Splash-Screens, Cover
```

## Technik

React 19 · Vite · JavaScript · CSS (ohne Framework) · Lucide Icons · HTML Audio API (+ Web Audio auf iOS für Lautstärke) · Media Session API · LocalStorage · Service Worker mit Range-Request-Unterstützung für Offline-Audio.

```
src/
  data/        Katalog (Titel, Alben, Künstler, Stimmungen) + Waveform-Daten
  store/       LibraryContext (Bibliothek, LocalStorage), PlayerContext (Audio-Engine), UIContext (Menüs/Sheets)
  components/  Player (Mini/Bar/Vollbild), Waveform, Slider, Karten, Track-Zeilen, Sheets
  views/       Start, Entdecken, Suche, Bibliothek, Playlist, Künstler, Album, Stimmungen, Einstellungen
scripts/       Musik-, Icon- und Cover-Generatoren
sw-template.js Service Worker (wird beim Build mit Precache-Liste erzeugt)
```
