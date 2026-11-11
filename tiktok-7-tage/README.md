# DIE LETZTEN 7 TAGE – TikTok-Serie

Vollständig animierte 3D-Serie im Hochformat (1080 × 1920, 9:16). Ein einziger Mensch steht in der
verlassenen Großstadt **VALENHEIM**. In 7 Tagen beginnt (in dieser fiktiven Geschichte) ein Weltkrieg.
Jeder neue Follower wird ein neuer Einwohner, und die Kommentare entscheiden, was gebaut wird.

**Folge 1:** `ausgabe/folge-01.mp4` (≈ 47 s, H.264 + AAC, deutsche Stimme, eingebrannte Untertitel)
plus `ausgabe/folge-01.srt` als separate Untertiteldatei.

---

## Wie es funktioniert

| Baustein | Technik | Datei |
|---|---|---|
| 3D-Stadt (immer dieselbe dank festem Seed) | Three.js, prozedurale Shader für Fassaden, Straßen und Himmel | `engine/world.js` |
| Spielfigur „ICH“ (orange Jacke, Rucksack) und Einwohner | Gelenk-Animation (umsehen, winken, laufen) | `engine/figure.js` |
| Gebäude für die Bauplätze B1–B8 | Katalog: Krankenhaus, Feuerwache, Bunker, Schule … | `engine/catalog.js` |
| Kamerafahrten | Spline-Pfade und Orbits mit Handkamera-Wackeln | `engine/camera.js` |
| HUD, Untertitel, Callouts, Alarm, Endkarte | Canvas-Overlay | `engine/hud.js` |
| Ablaufsteuerung pro Frame | deterministisch (Frame = Zeit t) | `engine/main.js` |
| Deutsche Stimme + Wort-Timing | **Piper TTS** `de_DE-thorsten-high` (kostenlos, offline) | `pipeline/stimme.py` |
| Musik + Soundeffekte + Mix (−14 LUFS) | prozedural mit numpy/scipy, ohne Lizenzprobleme | `pipeline/audio.py` |
| Rendern → MP4 | Headless-Chromium (WebGL) → ffmpeg/x264 | `pipeline/render.js` |
| Serienstand | Tag, Einwohner, Kasse, Gebäude, Verlauf | `serie/stadt-status.json` |
| Drehbücher | eine JSON-Datei pro Folge | `folgen/folge-XX.json` |

## Einrichtung (einmalig)

Voraussetzungen: Node 18+, Python 3.10+, ffmpeg.

```bash
cd tiktok-7-tage
bash pipeline/setup.sh        # npm-Pakete, piper-tts, deutsche Stimme (~110 MB), ggf. Playwright-Chromium
```

## Eine Folge produzieren

```bash
bash pipeline/folge.sh 1 --worker 3
# -> ausgabe/folge-01.mp4  und  ausgabe/folge-01.srt
```

Die Schritte lassen sich auch einzeln ausführen:

```bash
python3 pipeline/stimme.py 1                        # Stimme + timeline.json + Untertitel
python3 pipeline/audio.py 1                         # Musik, Effekte, Mix
node pipeline/render.js 1 --bilder 2,10,20,40       # nur Standbilder zur Kontrolle (build/folge-01/vorschau/)
node pipeline/render.js 1 --worker 3                # komplettes Video ohne Ton
```

Rechenzeit: Ohne Grafikkarte (Software-WebGL) braucht ein Frame etwa 2–3 s, also rund eine Stunde
pro Folge. Mit echter GPU geht es deutlich schneller.

> Hinweis: Piper variiert die Betonung bei jedem Lauf leicht. `stimme.py` erzeugt deshalb
> Stimme **und** Zeitachse gemeinsam. Nach einem neuen `stimme.py`-Lauf immer auch `audio.py`
> und den Render neu ausführen (`folge.sh` macht das automatisch).

## Fortsetzungen (Folge 2, 3, 4 …)

Stadt, Figur, Stil, Animationen und HUD sind fest in der Engine. Der **Fortschritt** steht in
`serie/stadt-status.json` und wird von Folge zu Folge weitergegeben:

1. **Folge abschließen**, sobald sie veröffentlicht ist. Mit `--einwohner` trägst du die echte Zahl neuer Follower ein:
   ```bash
   node pipeline/folge-abschliessen.js 1 --einwohner 0
   ```
2. **Nächste Folge erzeugen**, mit dem Ergebnis aus den Kommentaren:
   ```bash
   node pipeline/neue-folge.js 2 --bau krankenhaus:B1 --neue-einwohner 250 \
     --kommentar "lena.k|Baut ein Krankenhaus!|412" \
     --kommentar "max_99|Wir brauchen Ärzte!|233"
   ```
   Daraus entsteht `folgen/folge-02.json` mit Tag 2 (noch 6 Tage), Kommentar-Karten, einer
   Bau-Animation auf Bauplatz 1, ankommenden Einwohnern (Zähler zählt hoch), angepasster Stadtkasse
   und Stadtentwicklung sowie Endkarte und Aufruf zum Kommentieren.
   Ein fertiges Beispiel liegt in `folgen/beispiel-folge-02.json`.
3. **Texte nach Wunsch anpassen** und produzieren: `bash pipeline/folge.sh 2`
4. Nach der Veröffentlichung wieder `node pipeline/folge-abschliessen.js 2 …` ausführen, und so weiter.

Bereits gebaute Gebäude bleiben dauerhaft auf ihrem Bauplatz stehen, und die Einwohner laufen
sichtbar über den Platz (bis zu 60 Figuren werden gezeigt, die echte Zahl steht im HUD).
`build/folge-XX/status_vorher.json` friert den Stand vor jeder Folge ein. Dadurch bleibt eine
ältere Folge beim erneuten Rendern exakt gleich.

### Bauplätze & Gebäudetypen

Die Bauplätze **B1–B8** liegen rund um den Zentralplatz (B1 westlich, B2 östlich, B3/B4 südwestlich bzw. südöstlich,
B5/B6 weiter außen, B7 südlich hinter dem Supermarkt, B8). Typen:
`wohnhaus, supermarkt, krankenhaus, feuerwache, polizei, schule, bunker, farm, kraftwerk, wasserwerk, funkturm, lager, rathaus, park`.
Ein Gebäude im Status `"im_bau"` (mit `"fortschritt": 0.4`) wird mit Gerüst und Kran dargestellt.

## Drehbuch-Format (`folgen/folge-XX.json`)

- `sprecher`: Text der Szene. `*wort*` erscheint gelb, `!wort!` rot im Untertitel, `|` erzeugt eine Sprechpause, `|0.6|` eine Pause mit fester Länge.
- `aussprache`: Ersetzungen nur für die Stimme, etwa `"Follower": "Follohuer"`.
- `shots`: `{"typ":"pfad","keys":[{"pos":[x,y,z],"ziel":[x,y,z]}, …]}` oder `{"typ":"orbit","ziel":…,"radius":[a,b],"hoehe":[a,b],"winkel":[a,b]}`.
  Positionen können relativ zur Figur angegeben werden: `"figur+2,1.5,-4"`. `"ab_wort": "Weltkrieg"` lässt einen Shot genau bei diesem Wort beginnen.
- `effekte` (zeitlich verankert mit `"zeit"`, `"wort"` + `"offset"` oder `"ende"`):
  `titel, callout, alarm, glitch, scan, spieler_label, hud_einblenden, countdown_start, hinweis, einwohner_holo, bauplan,
  simulation_label, hologramme_aus, zaehler_reset, frage, endkarte, kommentar_cta, kommentare, bau, einwohner_ankunft, werte`.
- `toene`: `boom, impact, whoosh, whoosh_up, whoosh_down, wind_swell, riser, alarm, blip, hud_boot, scan, spawn, shimmer, build, neon_flicker, tick_folge, final_hit`.
- `figur`: Aktionen der Spielfigur (`idle, umsehen, blick_stadt, winken`) mit Blickrichtung `richtung` in Grad (180 = Norden).
- `ergebnis`: der Stand nach der Folge. `folge-abschliessen.js` übernimmt ihn.

## Stimme

Piper „Thorsten“ (high) ist die natürlichste frei verfügbare deutsche Offline-Stimme. Sie wird um
+1 Halbton angehoben (Formanten bleiben erhalten), damit sie mittelhoch statt tief klingt. Danach
kommen EQ, Kompressor und ein kleiner Raum dazu. Einstellbar unter `"stimme"`: `tempo`, `lebendigkeit`, `rhythmus`, `tonhoehe_halbtoene`.
Willst du später deine **eigene Stimme** verwenden, lege eine Aufnahme als `build/folge-XX/stimme.wav` ab.
Die Wortzeiten müssen dann aber neu bestimmt werden, zum Beispiel mit einem Alignment-Tool.

## TikTok-Hinweise

- HUD und Untertitel lassen die TikTok-Bedienelemente frei: oben die Tabs, rechts die Icon-Leiste, unten die Caption.
- Die Lautheit ist auf −14 LUFS normalisiert, wie es bei TikTok und Reels üblich ist.
- Die Geschichte ist frei erfunden. Sie dreht sich um Stadtaufbau und Gemeinschaft.
