#!/usr/bin/env python3
"""
Schritt 1: Sprecherstimme + Zeitachse.

Erzeugt aus folgen/folge-XX.json
  build/folge-XX/stimme.wav     (48 kHz, bearbeitete Sprecherstimme)
  build/folge-XX/timeline.json  (Szenen-Zeiten, Wort-Zeiten, aufgelöste Effekt-/Ton-/Shot-Zeitpunkte)

Stimme: Piper TTS (lokal, kostenlos, offline). Standard: de_DE-thorsten-high.
Die Wortzeiten werden aus den Phonemen der Synthese geschätzt (phonemanteilig pro Satz),
dadurch laufen die Untertitel synchron zur Stimme.
"""
import json, re, sys, subprocess, os, math
from pathlib import Path
import numpy as np
from scipy.signal import resample_poly
from scipy.io import wavfile

ROOT = Path(__file__).resolve().parent.parent
VOICES = Path(os.environ.get("PIPER_VOICES", ROOT / "build" / "stimmen"))
SR_OUT = 48000

PAUSE_STANDARD = 0.24      # Länge von "|"
PAUSE_CHUNK = 0.16         # zwischen Sätzen, die Piper selbst trennt


def lade_stimme(name):
    from piper import PiperVoice
    onnx = VOICES / f"{name}.onnx"
    if not onnx.exists():
        raise SystemExit(f"Stimme fehlt: {onnx}\n -> zuerst 'bash pipeline/setup.sh' ausführen")
    return PiperVoice.load(str(onnx))


def parse_sprecher(text):
    """Zerlegt den Sprechertext in Segmente [(segmenttext, pause_danach)]."""
    teile = re.split(r"\|(?:(\d+(?:\.\d+)?)\|)?", text)
    segs = []
    # re.split mit Gruppe -> [txt, grp, txt, grp, ...]
    for i in range(0, len(teile), 2):
        seg = teile[i].strip()
        pause = None
        if i + 1 < len(teile):
            g = teile[i + 1]
            pause = float(g) if g else PAUSE_STANDARD
        if seg:
            segs.append((seg, pause or 0.0))
        elif segs and pause:
            segs[-1] = (segs[-1][0], segs[-1][1] + pause)
    return segs


def tokenisiere(seg):
    """Anzeige-Wörter mit Hervorhebung. Reine Satzzeichen werden ans vorige Wort gehängt."""
    roh = seg.split()
    woerter = []
    for tok in roh:
        farbe = None
        m = re.match(r"^([\"„(]*)\*(.+?)\*(\W*)$", tok)
        n = re.match(r"^([\"„(]*)!(.+?)!(\W*)$", tok)
        if m:
            farbe, tok = "gelb", m.group(1) + m.group(2) + m.group(3)
        elif n:
            farbe, tok = "rot", n.group(1) + n.group(2) + n.group(3)
        if not re.search(r"\w", tok):
            if woerter:
                woerter[-1]["text"] += ("" if tok in ",.?!" else " ") + tok
            continue
        woerter.append({"text": tok, "farbe": farbe})
    return woerter


def sprechtext(woerter, aussprache):
    out = []
    for w in woerter:
        t = w["text"].replace("…", ",")
        for k, v in aussprache.items():
            t = re.sub(rf"\b{re.escape(k)}\b", v, t)
        out.append(t)
    return " ".join(out)


def trim(audio, sr):
    a = np.abs(audio)
    if a.max() <= 0:
        return audio, 0
    win = int(sr * 0.01)
    env = np.convolve(a, np.ones(win) / win, mode="same")
    thr = env.max() * 0.02
    idx = np.where(env > thr)[0]
    if len(idx) == 0:
        return audio, 0
    s = max(0, idx[0] - int(sr * 0.025))
    e = min(len(audio), idx[-1] + int(sr * 0.06))
    return audio[s:e], s


def phonem_woerter(phonemes):
    gruppen, cur = [], []
    for p in phonemes:
        if p == " ":
            if cur:
                gruppen.append(cur)
            cur = []
        else:
            cur.append(p)
    if cur:
        gruppen.append(cur)
    satzz = set(",.?!;:…—-\"'")
    return [g for g in gruppen if any(ch not in satzz for ch in g)]


def synth_segment(voice, text, cfg, aussprache):
    from piper import SynthesisConfig
    woerter = tokenisiere(text)
    spoken = sprechtext(woerter, aussprache)
    sc = SynthesisConfig(length_scale=cfg["tempo"], noise_scale=cfg["lebendigkeit"],
                         noise_w_scale=cfg["rhythmus"], normalize_audio=True)
    teile, wortzeiten, pos, sr = [], [], 0.0, 22050
    for k, chunk in enumerate(voice.synthesize(spoken, syn_config=sc)):
        sr = chunk.sample_rate
        audio = chunk.audio_int16_array.astype(np.float32) / 32768.0
        audio, _ = trim(audio, sr)
        if k > 0:
            teile.append(np.zeros(int(sr * PAUSE_CHUNK), np.float32))
            pos += PAUSE_CHUNK
        dur = len(audio) / sr
        pw = phonem_woerter(chunk.phonemes)
        gew = np.array([len(g) + 1.2 for g in pw], float)
        if len(gew):
            cum = np.concatenate([[0], np.cumsum(gew)]) / gew.sum()
            for i in range(len(pw)):
                wortzeiten.append((pos + cum[i] * dur * 0.97, pos + cum[i + 1] * dur * 0.97))
        teile.append(audio)
        pos += dur
    audio = np.concatenate(teile) if teile else np.zeros(1, np.float32)
    total = len(audio) / sr
    if len(wortzeiten) != len(woerter):
        # Fallback: zeichenanteilig
        gew = np.array([len(re.sub(r"\W", "", w["text"])) + 1.5 for w in woerter], float)
        cum = np.concatenate([[0], np.cumsum(gew)]) / gew.sum()
        wortzeiten = [(cum[i] * total, cum[i + 1] * total) for i in range(len(woerter))]
        print(f"  (Hinweis: Wortzeiten zeichenanteilig geschätzt für: {text[:40]}…)")
    for w, (a, b) in zip(woerter, wortzeiten):
        w["t0"], w["t1"] = a, b
    return audio, sr, woerter


def clean(w):
    return re.sub(r"[^\wäöüÄÖÜß]", "", w).lower()


def main():
    nr = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    ep_path = ROOT / "folgen" / f"folge-{nr:02d}.json"
    ep = json.loads(ep_path.read_text())
    out = ROOT / "build" / f"folge-{nr:02d}"
    out.mkdir(parents=True, exist_ok=True)
    cfg = {"tempo": 0.95, "lebendigkeit": 0.7, "rhythmus": 0.85, "tonhoehe_halbtoene": 1.0, "modell": "de_DE-thorsten-high"}
    cfg.update(ep.get("stimme", {}))
    voice = lade_stimme(cfg["modell"])
    aussprache = ep.get("aussprache", {})

    spur = []  # (startzeit, audio48)
    t = 0.0
    szenen = []
    for sz in ep["szenen"]:
        print(f"Szene {sz['id']} …")
        start = t
        vt = start + sz.get("vorlauf", 0.3)
        woerter = []
        segs = parse_sprecher(sz["sprecher"])
        for si, (seg, pause) in enumerate(segs):
            audio, sr, ws = synth_segment(voice, seg, cfg | sz.get("stimme", {}), aussprache)
            a48 = resample_poly(audio, 320, 147).astype(np.float32) if sr == 22050 else resample_poly(audio, SR_OUT, sr).astype(np.float32)
            spur.append((vt, a48))
            for w in ws:
                woerter.append({"text": w["text"], "farbe": w["farbe"], "t0": round(vt + w["t0"], 3),
                                "t1": round(vt + w["t1"], 3), "seg": si,
                                "satzende": bool(re.search(r"[.?!…,]$", w["text"]))})
            vt += len(a48) / SR_OUT + pause
        sprech_ende = woerter[-1]["t1"] if woerter else vt
        ende = sprech_ende + sz.get("nachlauf", 0.4)
        szenen.append({**sz, "start": round(start, 3), "ende": round(ende, 3), "woerter": woerter})
        t = ende

    gesamt = t
    # --- Zeitanker auflösen ---
    for sz in szenen:
        def wortzeit(wort, n=0):
            treffer = [w for w in sz["woerter"] if clean(w["text"]) == clean(wort)]
            if not treffer:
                raise SystemExit(f"Zeitanker-Wort '{wort}' nicht in Szene {sz['id']} gefunden")
            return treffer[min(n, len(treffer) - 1)]["t0"]

        def zeit(e):
            off = e.get("offset", 0.0)
            if "wort" in e:
                return wortzeit(e["wort"], e.get("n", 0)) + off
            if "ende" in e:
                return sz["ende"] + e["ende"]
            return sz["start"] + e.get("zeit", 0.0) + off

        for key in ("effekte", "toene", "figur"):
            for e in sz.get(key, []):
                e["t"] = round(zeit(e), 3)
        # Shots: feste Startpunkte (ab_wort) + Restaufteilung nach Anteil
        shots = sz.get("shots", [])
        fix = {}
        for i, s in enumerate(shots):
            if "ab_wort" in s:
                fix[i] = wortzeit(s["ab_wort"], s.get("n", 0)) + s.get("offset", 0.0)
        fix[0] = sz["start"]
        grenzen = sorted(fix.items()) + [(len(shots), sz["ende"])]
        for (i0, ta), (i1, tb) in zip(grenzen, grenzen[1:]):
            gruppe = shots[i0:i1]
            summe = sum(s.get("anteil", 1.0) for s in gruppe) or 1
            tt = ta
            for s in gruppe:
                d = (tb - ta) * s.get("anteil", 1.0) / summe
                s["t0"], s["t1"] = round(tt, 3), round(tt + d, 3)
                tt += d

    # --- Untertitel-Blöcke ---
    blöcke = []
    for sz in szenen:
        cur = []
        ws = sz["woerter"]
        for i, w in enumerate(ws):
            cur.append(w)
            nxt = ws[i + 1] if i + 1 < len(ws) else None
            zeichen = sum(len(x["text"]) + 1 for x in cur)
            if (nxt is None or w["satzende"] or nxt["seg"] != w["seg"] or len(cur) >= 3 or
                    zeichen + len(nxt["text"]) > 18):
                blöcke.append({"t0": cur[0]["t0"], "t1": cur[-1]["t1"], "woerter": [dict(x) for x in cur]})
                cur = []
    for i, b in enumerate(blöcke):
        nxt = blöcke[i + 1]["t0"] if i + 1 < len(blöcke) else gesamt
        b["t1"] = round(min(nxt, b["t1"] + 0.55), 3)

    tl = {"folge": nr, "titel": ep.get("titel"), "dauer": round(gesamt, 3), "szenen": szenen,
          "untertitel": blöcke, "musik": ep.get("musik", {}), "ergebnis": ep.get("ergebnis", {}), "licht": ep.get("licht", "standard"), "republik": ep.get("republik", False), "villen": ep.get("villen", []), "mega_villa": ep.get("mega_villa")}
    (out / "timeline.json").write_text(json.dumps(tl, ensure_ascii=False, indent=1))
    # Untertitel zusätzlich als SRT (z. B. für TikTok-Untertitel-Upload)
    def ts(x):
        ms = int(round(x * 1000)); return f"{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d},{ms%1000:03d}"
    srt = []
    for i, b in enumerate(blöcke, 1):
        srt.append(f"{i}\n{ts(b['t0'])} --> {ts(b['t1'])}\n{' '.join(w['text'] for w in b['woerter'])}\n")
    (out / "untertitel.srt").write_text("\n".join(srt), encoding="utf-8")

    # --- Stimme zusammensetzen ---
    n = int(math.ceil((gesamt + 0.5) * SR_OUT))
    mix = np.zeros(n, np.float32)
    for st, a in spur:
        i = int(st * SR_OUT)
        mix[i:i + len(a)] += a[: max(0, n - i)]
    roh = out / "stimme_roh.wav"
    wavfile.write(roh, SR_OUT, (np.clip(mix, -1, 1) * 32767).astype(np.int16))
    pitch = 2 ** (cfg.get("tonhoehe_halbtoene", 0) / 12)
    filt = (f"rubberband=pitch={pitch:.5f}:formant=preserved:pitchq=quality,"
            "highpass=f=75,lowpass=f=14500,"
            "equalizer=f=220:t=q:w=1.2:g=-2.0,equalizer=f=3200:t=q:w=1.0:g=2.5,equalizer=f=7500:t=q:w=1.5:g=1.2,"
            "acompressor=threshold=-20dB:ratio=3:attack=6:release=120:makeup=3dB,"
            "aecho=0.9:0.25:18|31:0.12|0.07")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(roh), "-af", filt, "-ar", str(SR_OUT),
                    "-ac", "1", str(out / "stimme.wav")], check=True)
    print(f"Fertig: Dauer {gesamt:.2f} s, {len(blöcke)} Untertitel-Blöcke -> {out}")


if __name__ == "__main__":
    main()
