# Sprecher (Piper, Thorsten) für das Spielvideo: ein WAV pro Abschnitt + Längen
import json, wave, sys
from piper import PiperVoice, SynthesisConfig
V = PiperVoice.load('/home/user/jarvis-2-/tiktok-7-tage/build/stimmen/de_DE-thorsten-high.onnx')
cfg = SynthesisConfig(length_scale=0.95, noise_scale=0.6, noise_w_scale=0.8)
nur = sys.argv[1:]
laengen = json.load(open('build/laengen.json')) if nur else {}
for s in json.load(open('text.json')):
    if nur and s['id'] not in nur: continue
    with wave.open(f"build/{s['id']}.wav", 'wb') as w:
        V.synthesize_wav(s['text'], w, syn_config=cfg)
    with wave.open(f"build/{s['id']}.wav") as w: laengen[s['id']] = w.getnframes() / w.getframerate()
json.dump(laengen, open('build/laengen.json', 'w'), indent=1); print(laengen)
