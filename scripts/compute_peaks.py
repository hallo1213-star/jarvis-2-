#!/usr/bin/env python3
"""Decode every catalog MP3 and write waveform peaks + exact durations to src/data/audio-meta.json."""
import json, os, subprocess
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO = os.path.join(ROOT, "public", "audio")
BARS = 96
meta = {}
for f in sorted(os.listdir(AUDIO)):
    if not f.endswith(".mp3"):
        continue
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", os.path.join(AUDIO, f),
                          "-ac", "1", "-ar", "8000", "-f", "s16le", "-"], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768
    chunks = np.array_split(x, BARS)
    rms = np.array([np.sqrt(np.mean(c ** 2)) for c in chunks])
    rms = rms / (rms.max() + 1e-9)
    peaks = [round(float(0.08 + 0.92 * v ** 0.8), 3) for v in rms]
    meta[f[:-4]] = {"duration": round(len(x) / 8000, 2), "peaks": peaks}
with open(os.path.join(ROOT, "src", "data", "audio-meta.json"), "w") as fh:
    json.dump(meta, fh, separators=(",", ":"))
print(f"wrote meta for {len(meta)} tracks")
