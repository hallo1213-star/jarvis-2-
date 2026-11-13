# VALENHEIM – THE CITY CHALLENGE

Multiplayer-3D-Browserspiel zur Valenheim-Geschichte. Es läuft auf dem PC und auf dem iPhone direkt im Browser.

## Was fertig ist

| Phase | Inhalt | Stand |
|---|---|---|
| 1 | Startseite (cinematischer Flug), Anmeldung mit eindeutigem Namen, 3D-Stadt mit 6 Vierteln, Laufen/Rennen/Springen, Kollision, Minikarte, PC- und Touch-Steuerung | ✅ |
| 2 | Echtzeit-Multiplayer (WebSocket), Namen über Figuren, Online-Anzeige, Betreten/Verlassen, Schnellnachrichten, Instanzen à 50 Spieler | ✅ |
| 3 | 7 Missionen in 5 Typen (Erkundung, Versorgung, Medizinische Hilfe, Evakuierung, Stadtverwaltung) – vom Server geprüft | ✅ |
| 4 | Punkte, Level, Bürgerprofil mit Erfolgen, öffentliche Rangliste (Top 100) | ✅ |
| 5 | Bürgermeister-Dashboard (Passwort, serverseitig geschützt) | ✅ |
| 6 | Tag/Nacht (für alle gleich), Regen, Nebel, Stromausfall, Sirenen, offizielle Meldungen, Radio-Laufband, Geräusche | ✅ |

**Noch nicht umgesetzt (ehrlich):**
- Konto per E-Mail sichern. Das Konto hängt im Moment am Gerät bzw. Browser. Wer den Browser-Speicher löscht, verliert den Zugang.
- Fahrzeuge fahren nicht, Innenräume sind noch nicht betretbar.
- Kein freier Chat, nur Schnellnachrichten (Jugendschutz).

## Sicherheit
- Punkte vergibt **nur der Server**. Er prüft Position, Tempo (Teleport/Speedhack werden zurückgesetzt), Wartezeit zwischen Missionen und Ladung (wer mit einer Kiste rennt, verliert sie).
- Spielernamen sind eindeutig (Groß-/Kleinschreibung egal). Reservierte und beleidigende Namen werden abgelehnt.
- Pro Konto ist nur eine Sitzung erlaubt. Eine zweite Anmeldung beendet die erste.
- Bürgermeister: Passwort als scrypt-Hash, Sitzung 12 h, höchstens 5 Login-Versuche pro Minute, jede Admin-Aktion wird protokolliert.

## Lokal starten
```bash
cd valenheim-game
npm run install:all
npm run admin:passwort      # einmalig: Bürgermeister-Passwort festlegen
npm run build
npm start                   # http://localhost:2567
```
Entwicklung mit Live-Neuladen: `npm run dev:server` und in einem zweiten Terminal `npm run dev:web` (http://localhost:5173).

- Spiel: `/#/` · Rangliste: `/#/rangliste` · Profil: `/#/profil` · Bürgermeister: `/#/buergermeister`

## Kostenlos veröffentlichen (Render + Supabase)
1. **Supabase** (supabase.com, Free): Neues Projekt anlegen. Dann *Connect* → **Session pooler** → Verbindungs-URL kopieren und das Datenbank-Passwort einsetzen. Die „Direct connection“ geht nicht, weil Render Free kein IPv6 kann.
2. **Passwort-Hash** erzeugen: `npm run admin:passwort` und die zweite Ausgabezeile (`scrypt$…`) kopieren.
3. **Render** (render.com, Free): *New* → *Blueprint* → dieses GitHub-Repository wählen. `render.yaml` wird erkannt. Dort `DATABASE_URL` und `ADMIN_PASSWORD_HASH` eintragen.
4. Nach dem Deploy ist das Spiel unter `https://valenheim.onrender.com` (oder ähnlich) erreichbar.

**Grenzen der kostenlosen Tarife:**
- Render Free schläft nach 15 Minuten ohne Besucher ein. Der erste Aufruf dauert dann etwa 30–60 Sekunden.
- Supabase Free pausiert ein Projekt nach 7 Tagen ganz ohne Aktivität. Es lässt sich im Dashboard mit einem Klick wieder starten.
- Ohne `DATABASE_URL` nutzt der Server SQLite. Auf Render Free gehen diese Daten bei jedem Neustart verloren, deshalb dort immer Supabase verwenden.

## Technik
- `web/`: React + Vite, Three.js (Stadt prozedural erzeugt, keine großen Downloads, etwa 240 KB gzip)
- `server/`: Node.js 22, eigener WebSocket-Server (`ws`), Datenbank Postgres (Supabase) oder SQLite
- Grafikstufen Niedrig, Mittel und Hoch. Auf Touch-Geräten wird automatisch „Mittel“ gewählt.
