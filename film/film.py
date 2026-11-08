#!/usr/bin/env python3
"""VERBOTENE LIEBE – PART 1: echte KI-Videogenerierung mit Google Veo (Gemini API) + FFmpeg-Schnitt.

Nutzung:
  python3 film.py models            # verfügbare Veo-/Imagen-Modelle anzeigen
  python3 film.py refs              # Referenzbilder der Figuren erzeugen (Konsistenz)
  python3 film.py test              # nur Shot 1 generieren (Kosten-/Qualitätstest)
  python3 film.py generate          # alle Shots generieren (bereits fertige werden übersprungen)
  python3 film.py assemble          # Film schneiden -> out/VERBOTENE_LIEBE_PART1.mp4
  python3 film.py all               # refs + generate + assemble

Umgebungsvariablen:
  GEMINI_API_KEY  (in dieser Cloud-Umgebung injiziert der Proxy den Key; Dummy genügt)
  VEO_MODEL       (Standard: neuestes verfügbares Veo-Modell)
  MUSIC           (optional: Pfad zu lizenzfreier Musik, wird unter die Dialoge gemischt)
"""
import base64, json, os, ssl, subprocess, sys, time, urllib.request, urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CLIPS, REFS, OUT = ROOT / "clips", ROOT / "refs", ROOT / "out"
for d in (CLIPS, REFS, OUT): d.mkdir(exist_ok=True)
API = "https://generativelanguage.googleapis.com/v1beta"
KEY = os.environ.get("GEMINI_API_KEY", "proxy-injected")
CA = "/root/.ccr/ca-bundle.crt"
CTX = ssl.create_default_context(cafile=CA) if os.path.exists(CA) else ssl.create_default_context()

# ---------------------------------------------------------------- Figuren & Stil
YASIN = ("Yasin: a young man in his late teens, slim athletic build, short black slightly curly hair with volume on top "
         "and shorter sides, warm dark-brown eyes, light olive skin, clean-shaven, wearing an open black matte bomber "
         "jacket over a plain white crew-neck T-shirt, dark grey jeans, white sneakers")
AMIRA = ("Amira: a young girl in her mid teens, long straight black hair past her shoulders, warm brown eyes, light olive "
         "skin, natural look without makeup, wearing a light-grey oversized jacket over a black top, light-blue jeans, "
         "white sneakers, small black crossbody bag")
VATER = "Amira's father: a man around 45, short greying black hair, trimmed beard, dark-blue sweater"
MUTTER = "Amira's mother: a woman around 42, black hair tied back, beige cardigan"
STYLE = ("Cinematic live-action scene from a premium German Netflix drama, photorealistic real actors, shot on ARRI Alexa "
         "with anamorphic lenses, 16:9, natural film lighting, shallow depth of field, subtle film grain, warm amber and "
         "teal autumn color grade, realistic skin texture, natural facial expressions and body movement. Set in a real "
         "German city in autumn (Altbau facades, cobblestones, orange leaves, trams). All spoken dialogue is in German, "
         "natural voices, clear lip-sync. Ambient sound only, no music, no subtitles, no on-screen text.")
NEG = ("cartoon, anime, 3d render, plastic skin, waxy face, morphing face, changing clothes, inconsistent hair, extra "
       "fingers, distorted hands, subtitles, captions, text, watermark, background music, kissing, romantic touching")

# ---------------------------------------------------------------- Drehbuch (je 8 s)
SHOTS = [
 # 1 Der Junge läuft durch die Stadt
 ("01_yasin_stadt", [YASIN], "Golden late-afternoon light. Smooth side tracking shot: Yasin walks calmly along a busy "
  "autumn street with his hands in his jacket pockets, leaves crunching under his sneakers, a yellow tram passes behind "
  "him, sunlight flickers through the trees across his face. He looks thoughtful and calm."),
 # 2 Das Mädchen wird gezeigt
 ("02_amira_intro", [AMIRA], "Golden late-afternoon light. Medium shot that slowly pushes in: Amira comes out of an old "
  "bakery holding a paper bag and a school notebook, the wind moves her long black hair, she checks her phone and "
  "smiles softly to herself. Bakery sign 'Bäckerei' blurred in the background."),
 # 3 Zufällige Begegnung
 ("03_begegnung", [YASIN, AMIRA], "A gust of wind blows a loose sheet of paper out of Amira's notebook across the "
  "sidewalk. Yasin, walking towards her, catches it in mid-air. Slow motion feel. He hands it back, their eyes meet for "
  "the first time, both pause for a moment. Medium two-shot, golden backlight."),
 # 4 Gespräch
 ("04_gespraech_a", [YASIN, AMIRA], "Over-the-shoulder shot from behind Amira onto Yasin, standing at a respectful "
  "distance on the sidewalk. Yasin smiles and says in German: \"Hey, hast du kurz Zeit?\" Cut to Amira glancing around "
  "nervously, she answers in German with a hesitant half-smile: \"Eigentlich darf ich gar nicht mit dir reden.\""),
 ("05_gespraech_b", [YASIN, AMIRA], "Close-up shot-reverse-shot. Yasin tilts his head, puzzled but gentle, and asks in "
  "German: \"Warum denn nicht?\" Amira lowers her gaze, a hint of sadness in her eyes, and says quietly in German: "
  "\"Meine Eltern würden das niemals erlauben.\" Yasin answers calmly in German: \"Dann reden wir eben nur kurz.\""),
 # 5 Zeit miteinander
 ("06_zusammen_park", [YASIN, AMIRA], "Steadicam shot in a small city park with golden trees: Yasin and Amira walk side "
  "by side with a little distance between them, talking and laughing. Amira says in German, laughing: \"Du bist echt "
  "komisch, weißt du das?\" Yasin grins and replies in German: \"Ich weiß.\" Leaves fall slowly."),
 ("07_zusammen_bank", [YASIN, AMIRA], "Warm sunset. Wide shot, then medium shot: they sit on a wooden park bench, an "
  "arm's length apart, sharing a pretzel from the paper bag. Amira says softly in German: \"So entspannt war ich schon "
  "lange nicht mehr.\" Yasin smiles shyly and looks at the ground. Innocent, friendly atmosphere."),
 # 6 Die Eltern erfahren davon
 ("08_vater_sieht", [VATER, YASIN, AMIRA], "Inside a parked dark car across the street, seen from the back seat: "
  "Amira's father stops the car and stares through the windshield at Amira and Yasin on the park bench in the distance. "
  "His face hardens. He whispers in German: \"Amira?\" Tense atmosphere, the sunset light dims."),
 # 7 Verbot
 ("09_kueche_verbot", [VATER, MUTTER, AMIRA], "Evening, interior of a warm German family kitchen with a single pendant "
  "lamp. Amira stands in the doorway with her jacket still on. Her father, standing by the table, says firmly in German: "
  "\"Wer war dieser Junge? Du triffst ihn nie wieder. Ist das klar?\" Her mother stands behind him with crossed arms, "
  "worried. Dramatic low-key lighting."),
 ("10_amira_widerspricht", [AMIRA, MUTTER], "Close-up on Amira, tears in her eyes, she answers in German with a "
  "trembling voice: \"Ihr kennt ihn doch gar nicht!\" Her mother answers in German, strict but sad: \"Wir wollen nur "
  "dein Bestes. Gib mir dein Handy.\" Amira slowly hands over the phone. Low-key lighting."),
 # 8 Enttäuschung / Missverständnis
 ("11_amira_fenster", [AMIRA], "Night, rain on the window. Amira sits on the floor of her dim bedroom against the bed, "
  "knees pulled up, looking out of the rain-streaked window, a single tear runs down her cheek. Blue night light with "
  "warm street-lamp glow. Silence except rain."),
 ("12_yasin_nachricht", [YASIN], "Night, Yasin's small bedroom lit only by his phone screen. He reads a message, his "
  "face turns from hopeful to hurt. He says quietly to himself in German: \"Sie will mich nicht mehr sehen...\" He drops "
  "the phone on the bed and stares at the ceiling."),
 # 9 Cliffhanger
 ("13_bruecke_warten", [YASIN], "Next day, grey overcast evening, light rain. Wide shot of a stone bridge over a river in "
  "the German city. Yasin stands alone at the railing, hood up, looking at his watch, then down at the water, "
  "disappointed. He turns to leave."),
 ("14_amira_rennt", [AMIRA, YASIN], "Amira runs through the rainy street towards the bridge, out of breath, hair wet. "
  "She shouts in German: \"Yasin! Warte!\" Yasin stops and turns around, surprised. Handheld camera, emotional."),
 ("15_cliffhanger", [AMIRA, YASIN, VATER], "On the bridge in the rain, Amira and Yasin face each other at a short "
  "distance. Amira says breathlessly in German: \"Die Nachricht war nicht von mir.\" Suddenly car headlights hit them "
  "from behind, a car door slams. Amira's father's voice shouts in German: \"Amira! Steig sofort ins Auto!\" Amira turns "
  "around in shock. Freeze on her frightened face."),
]

# ---------------------------------------------------------------- HTTP-Helfer
def req(method, url, body=None, raw=False, timeout=120):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method,
                               headers={"x-goog-api-key": KEY, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, context=CTX, timeout=timeout) as resp:
            b = resp.read()
            return b if raw else json.loads(b or b"{}")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code} {url}\n{e.read().decode(errors='replace')[:1500]}")

def list_models():
    out, tok = [], ""
    while True:
        j = req("GET", f"{API}/models?pageSize=200" + (f"&pageToken={tok}" if tok else ""))
        out += [m["name"].split("/")[-1] for m in j.get("models", [])]
        tok = j.get("nextPageToken")
        if not tok: return out

def pick(models, prefix, prefer=("generate-preview", "generate-001", "generate")):
    c = sorted([m for m in models if m.startswith(prefix) and "fast" not in m], reverse=True)
    for p in prefer:
        for m in c:
            if p in m: return m
    return c[0] if c else None

# ---------------------------------------------------------------- Referenzbilder
def make_refs():
    models = list_models()
    img_model = pick(models, "imagen-")
    if not img_model:
        print("Kein Imagen-Modell verfügbar – Referenzbilder übersprungen."); return
    for name, desc in (("yasin", YASIN), ("amira", AMIRA)):
        f = REFS / f"{name}.png"
        if f.exists(): continue
        prompt = (f"Photorealistic cinematic character reference photo, front view, upper body, neutral expression, "
                  f"standing on an autumn street in a German city, soft daylight, shot on ARRI Alexa 50mm. {desc}.")
        print(f"[refs] {name} mit {img_model} ...")
        j = req("POST", f"{API}/models/{img_model}:predict",
                {"instances": [{"prompt": prompt}], "parameters": {"sampleCount": 1, "aspectRatio": "3:4",
                                                                     "personGeneration": "allow_adult"}})
        preds = j.get("predictions") or []
        if not preds: print("  keine Bilder (Sicherheitsfilter?)", json.dumps(j)[:400]); continue
        f.write_bytes(base64.b64decode(preds[0]["bytesBase64Encoded"]))
        print("  ->", f)

# ---------------------------------------------------------------- Videogenerierung
def veo_model():
    return os.environ.get("VEO_MODEL") or pick(list_models(), "veo-") or "veo-3.1-generate-preview"

def ref_images(chars):
    refs = []
    for name, desc in (("yasin", YASIN), ("amira", AMIRA)):
        f = REFS / f"{name}.png"
        if desc in chars and f.exists():
            refs.append({"image": {"bytesBase64Encoded": base64.b64encode(f.read_bytes()).decode(),
                                   "mimeType": "image/png"}, "referenceType": "asset"})
    return refs

def gen_shot(model, sid, chars, action):
    out = CLIPS / f"{sid}.mp4"
    if out.exists() and out.stat().st_size > 10000:
        print(f"[skip] {sid}"); return out
    prompt = f"{STYLE}\nCharacters (must look exactly like this): {' | '.join(chars)}.\nScene: {action}"
    params = {"aspectRatio": "16:9", "resolution": "1080p", "negativePrompt": NEG,
              "personGeneration": "allow_adult", "durationSeconds": 8}
    inst = {"prompt": prompt}
    refs = ref_images(chars)
    attempts = ([dict(inst, referenceImages=refs)] if refs else []) + [inst]
    last = None
    for a in attempts:
        for p in (params, {k: v for k, v in params.items() if k not in ("resolution", "durationSeconds")}):
            try:
                print(f"[veo] {sid} ({model}{', mit Referenzbildern' if 'referenceImages' in a else ''}) ...")
                op = req("POST", f"{API}/models/{model}:predictLongRunning", {"instances": [a], "parameters": p})
                break
            except RuntimeError as e:
                last = e; print("  abgelehnt:", str(e).splitlines()[0]); op = None
        if op: break
    if not op: raise last
    name = op["name"]; t0 = time.time()
    while not op.get("done"):
        time.sleep(10); op = req("GET", f"{API}/{name}")
        print(f"  ... {int(time.time()-t0)} s", end="\r")
    if "error" in op: raise RuntimeError(f"{sid}: {op['error']}")
    resp = op.get("response", {}).get("generateVideoResponse", {})
    samples = resp.get("generatedSamples") or []
    if not samples:
        raise RuntimeError(f"{sid}: kein Video (gefiltert?) {json.dumps(resp)[:600]}")
    uri = samples[0]["video"]["uri"]
    out.write_bytes(req("GET", uri, raw=True, timeout=600))
    print(f"\n  -> {out} ({out.stat().st_size//1024} KB)")
    return out

def generate(only=None):
    model = veo_model(); print("Videomodell:", model)
    failed = []
    for sid, chars, action in SHOTS[:only] if only else SHOTS:
        try: gen_shot(model, sid, chars, action)
        except Exception as e: print("FEHLER", sid, e); failed.append(sid)
    if failed: print("Fehlgeschlagen:", failed, "-> 'generate' erneut ausführen")

# ---------------------------------------------------------------- Schnitt
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
def ff(*a): subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *a], check=True)
ENC = ["-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "24",
       "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2"]

def card(path, lines, dur, size=84):
    draw = []
    n = len(lines)
    for i, (txt, sz) in enumerate(lines):
        y = f"(h/2)+({i}-{(n-1)/2})*{int(size*1.4)}-text_h/2"
        draw.append(f"drawtext=fontfile={FONT}:text='{txt}':fontsize={sz}:fontcolor=white:x=(w-text_w)/2:y={y}")
    ff("-f", "lavfi", "-i", f"color=black:s=1920x1080:d={dur}:r=24", "-f", "lavfi", "-i",
       f"anullsrc=r=48000:cl=stereo", "-t", str(dur), "-vf",
       ",".join(draw) + f",fade=t=in:st=0:d=1,fade=t=out:st={dur-1}:d=1", *ENC, "-shortest", str(path))

def assemble():
    clips = [CLIPS / f"{sid}.mp4" for sid, _, _ in SHOTS if (CLIPS / f"{sid}.mp4").exists()]
    if not clips: sys.exit("Keine Clips vorhanden – zuerst 'generate' ausführen.")
    missing = [sid for sid, _, _ in SHOTS if not (CLIPS / f"{sid}.mp4").exists()]
    if missing: print("Achtung, fehlende Shots werden ausgelassen:", missing)
    tmp = OUT / "tmp"; tmp.mkdir(exist_ok=True)
    parts = [tmp / "00_title.mp4"]
    card(parts[0], [("VERBOTENE LIEBE", 110), ("PART 1", 54)], 4)
    for i, c in enumerate(clips):
        p = tmp / f"{i+1:02d}.mp4"
        has_audio = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index",
                                    "-of", "csv=p=0", str(c)], capture_output=True, text=True).stdout.strip()
        ain = ["-i", str(c)] if has_audio else ["-i", str(c), "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]
        amap = ["-map", "0:v", "-map", "0:a" if has_audio else "1:a", "-shortest"]
        ff(*ain, *amap, "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,"
           "setsar=1,fade=t=in:st=0:d=0.25", *ENC, str(p))
        parts.append(p)
    end = tmp / "99_end.mp4"
    card(end, [("WIRD IHRE LIEBE", 84), ("EINE CHANCE BEKOMMEN?", 84), ("PART 2 FOLGT", 40)], 5)
    parts.append(end)
    lst = tmp / "list.txt"; lst.write_text("".join(f"file '{p.name}'\n" for p in parts))
    film = tmp / "film_noMusic.mp4"
    ff("-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(film))
    final = OUT / "VERBOTENE_LIEBE_PART1.mp4"
    music = os.environ.get("MUSIC")
    if music and os.path.exists(music):
        # Musik leise darunter, wird bei Dialog automatisch abgesenkt (Sidechain-Ducking)
        ff("-i", str(film), "-stream_loop", "-1", "-i", music, "-filter_complex",
           "[1:a]volume=0.35,aresample=48000[m];[m][0:a]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[d];"
           "[0:a][d]amix=inputs=2:duration=first:normalize=0[a]",
           "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
           str(final))
    else:
        ff("-i", str(film), "-c", "copy", "-movflags", "+faststart", str(final))
    print("FERTIG:", final)

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "help"
    if cmd == "models": print("\n".join(m for m in list_models() if m.startswith(("veo", "imagen"))))
    elif cmd == "refs": make_refs()
    elif cmd == "test": generate(only=1)
    elif cmd == "generate": generate()
    elif cmd == "assemble": assemble()
    elif cmd == "all": make_refs(); generate(); assemble()
    else: print(__doc__)
