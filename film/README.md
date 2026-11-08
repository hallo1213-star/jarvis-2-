# VERBOTENE LIEBE – PART 1 (KI-Kurzfilm)

Generiert echte Videoclips (16:9, 1080p, deutscher Ton) mit Google Veo über die Gemini-API und schneidet sie mit FFmpeg zum Film.

Voraussetzung: Gemini-API-Key mit aktivierter Abrechnung
(Cloud-Umgebung → Network secrets → Host `generativelanguage.googleapis.com`, Header `x-goog-api-key`,
oder Umgebungsvariable `GEMINI_API_KEY`).

```bash
python3 film/film.py models     # prüfen, ob Key + Veo funktionieren
python3 film/film.py test       # nur Shot 1 (Qualitäts-/Kostentest)
python3 film/film.py all        # Referenzbilder + 15 Shots + Schnitt
# optional: MUSIC=pfad/zu/musik.mp3 python3 film/film.py assemble
```

Ergebnis: `film/out/VERBOTENE_LIEBE_PART1.mp4` (H.264/AAC, iPhone- und TikTok-tauglich).
