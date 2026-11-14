# VALENHEIM – THE CITY CHALLENGE 2.0

Neuaufbau als Open-World-Lebenssimulation. Läuft **getrennt** vom alten Spiel (`../valenheim-game`, bleibt online).

## Stand
| Phase | Inhalt | Status |
|---|---|---|
| 1 Grundlage | Hauptmenü, Leistungstest + Auto-Grafikstufe, Konto (Name + Passwort, Wiederherstellungscode), Speichern, Rapier-Physik, Third/First Person, Touch | ✅ |
| 2 Welt | Die Stadt aus den TikTok-Folgen (Seed 7071, Stand nach Folge 7), Kollision, Tag/Nacht (40 Min), Wetter, Ampeln, Detailstufen | ✅ |
| 3 Charaktere | Editor: Körper, Gesicht, Haare, Bart, Kleidung, Accessoires, 3 Outfits – serverseitig geprüft | ✅ |
| 4 Multiplayer | Öffentliche Server (je 12 Spieler, neue öffnen automatisch), private Server mit 6-stelligem Code, andere Spieler mit ihrem Aussehen, Chat mit Filter + Spamschutz, Spielerliste (Tab) | ✅ |
| 5 Bank/Handy | Bargeld + Konto, Ein-/Auszahlen, Überweisen an Spieler, Umsätze, Bürgergeld alle 10 Min online, Handy (H) | ✅ |
| 6 Fahrzeuge | **Janniks Autohaus** (Showroom am Bauplatz B15, goldene Lichtsäule), 6 Modelle, Fahren mit Kollision, Wunschkennzeichen, Tuning (Lack, Felgen, Tieferlegung, Motor, Spoiler, Neon, Tönung), Autos der anderen sichtbar | ✅ |
| 7–12 | Immobilien/Garagen, Berufe, NPCs, Regierung/Story, Interaktion, Tests | geplant |

Schutz gegen Schummeln: Geld, Preise, Kauf, Tuning, Kennzeichen, Tempo und Position prüft immer der Server.
Kaufen/Tunen geht nur, wenn der Server dich wirklich bei Janniks Autohaus sieht.

## Steuerung
PC: `WASD` laufen/fahren · `Shift` rennen · `Leertaste` springen/Handbremse · `E`/`F` Aktion (Einsteigen, Autohaus …) · `H` Handy · `V` Kamera · `T` Chat · `Tab` Spieler · `Esc` Menü
Handy/Tablet: Joystick links, rechts wischen zum Umsehen, Knöpfe für Rennen/Sprung (im Auto: Bremse), 📱, 💬, Aktionsknopf unten.

## Tests
`cd server && node --test test/*.test.js` – 11 Tests mit echter Postgres-Engine (Konto, Speicher, Charakter, Räume, Chat-Filter, Bank inkl. gleichzeitiger Abbuchungen, Autokauf, Kennzeichen, Tuning, Tempo im Auto).

## Lokal
```bash
npm run install:all && npm run build && npm start   # http://localhost:2600
```

## Online (kostenlos, zweiter Render-Dienst)
Render → **New → Web Service** → Repo `jarvis-2-`, Branch `claude/tiktok-7-days-city-series-ru97i7`,
Root Directory `valenheim-v2`, Build `npm run install:all && npm run build`, Start `npm start`, Instance **Free**,
Umgebungsvariablen: `NODE_VERSION=22.12.0`, `DATABASE_URL=` (derselbe Supabase-Link wie beim alten Spiel – v2 nutzt nur eigene Tabellen `v2_*`).
