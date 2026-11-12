# Republik Valenheim – Technische Dokumentation des Umbaus

## Schalter
- `"republik": true` im Drehbuch (Folge) oder im Serienstand (`serie/stadt-status.json`) aktiviert die Republik.
- Ohne Schalter wird die Welt exakt wie vor dem Umbau erzeugt (Folgen 1–6 bleiben identisch).
- Backup-Stand: siehe `serie/backup/README.md`.

## Neue Dateien
| Datei | Inhalt |
|---|---|
| `engine/identitaet.js` | Farben, Nationalflagge, Staatswappen, Valenheim-TV-Logo |
| `engine/republik.js` | Gebiete (Ring Block 7–13), Wahrzeichen, Prachtachse, Ringautobahn, Gleise, wehende Flaggen, Infobildschirme, Stadttore |
| `republik/VERFASSUNG.md` | Verfassungstext |
| `ausgabe/nationalhymne-valenheim.m4a` | Nationalhymne (Originalkomposition, prozedural erzeugt in `pipeline/audio.py` → `hymne()`) |

## Gebiete (Blockraster, Rathausplatz = Mitte)
Norden Regierungsviertel · Nordosten Geschäftsviertel + Valenheim TV · Osten Universität + Zentralklinikum ·
Südosten Kultur/Freizeit + Nationalstadion · Süden Neues Wohngebiet · Südwesten Luxusviertel ·
Westen Hauptbahnhof (Verkehrsknoten) + Industrie · Nordwesten Flughafen · Parks dazwischen · Mitte: historisches Stadtzentrum (alte Stadt, unverändert).

## Kamera-Anker (für Drehbücher)
`rathausplatz, platz_der_republik, regierungssitz, parlament, palast, podium, flughafen, bahnhof, stadion, klinikum, uni, tv, business, wohnen, luxus, industrie`
(z. B. `"pos": "palast+0,40,60"`)

## Neue Effekte (Drehbuch)
`tv` (Senderlogo + LIVE), `sondersendung` (Vollbild-Intro), `gebiet` (Gebietstitel), `wappen_reveal`, `urkunde` (Verfassung mit Siegel),
`bauchbinde` (Name/Funktion), `flagge_hissen`, `feuerwerk`, `versammlung` (alle Bewohner vor einem Punkt), `spieler_pos`.
Neuer Ton: `hymne` (`dauer`, `bpm`).
