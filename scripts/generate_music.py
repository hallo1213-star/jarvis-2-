#!/usr/bin/env python3
"""
AURIX Originals – procedural music generator.

Every track in the AURIX demo catalog is composed and synthesized by this
script from scratch (oscillators, noise and math – no samples, no third-party
recordings). The resulting audio is therefore original work of this project
and is released under CC0 1.0 (public domain dedication).

Requirements: python3, numpy, scipy, ffmpeg (with libmp3lame)
Usage:        python3 scripts/generate_music.py
Output:       public/audio/*.mp3
"""
import json
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

SR = 44100
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "public", "audio")

NOTE_NAMES = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6,
              "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
SCALES = {
    "minor": [0, 2, 3, 5, 7, 8, 10],
    "major": [0, 2, 4, 5, 7, 9, 11],
    "dorian": [0, 2, 3, 5, 7, 9, 10],
    "lydian": [0, 2, 4, 6, 7, 9, 11],
}


def midi_to_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12.0)


# ----------------------------------------------------------------- filters --
def lowpass(x, cutoff, order=2):
    cutoff = min(cutoff, SR * 0.45)
    sos = butter(order, cutoff, btype="low", fs=SR, output="sos")
    return sosfilt(sos, x)


def highpass(x, cutoff, order=2):
    sos = butter(order, cutoff, btype="high", fs=SR, output="sos")
    return sosfilt(sos, x)


def bandpass(x, lo, hi, order=2):
    sos = butter(order, [lo, min(hi, SR * 0.45)], btype="band", fs=SR, output="sos")
    return sosfilt(sos, x)


def make_reverb_ir(seconds, rng, damp=6000):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    irs = []
    for _ in range(2):
        noise = rng.standard_normal(n)
        env = np.exp(-t * (6.9 / seconds))
        ir = lowpass(noise * env, damp)
        ir[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
        irs.append(ir / np.sqrt(np.sum(ir ** 2)))
    return irs


def reverb(stereo, ir, mix):
    out = np.zeros_like(stereo)
    for ch in range(2):
        wet = fftconvolve(stereo[ch], ir[ch])[: stereo.shape[1]]
        out[ch] = stereo[ch] * (1 - mix) + wet * mix
    return out


def delay(stereo, seconds, feedback=0.35, mix=0.25, taps=4):
    d = int(seconds * SR)
    out = stereo.copy()
    for i in range(1, taps + 1):
        g = mix * feedback ** (i - 1)
        ch_src = (i % 2)  # ping-pong
        shifted = np.zeros(stereo.shape[1])
        if d * i < stereo.shape[1]:
            shifted[d * i:] = stereo[ch_src][: -d * i]
        out[1 - ch_src] += shifted * g
    return out


# ------------------------------------------------------------- oscillators --
def adsr(n, a, d, s, r, sustain_len=None):
    a_n, d_n, r_n = int(a * SR), int(d * SR), int(r * SR)
    if sustain_len is None:
        sustain_len = max(0, n - a_n - d_n - r_n)
    env = np.concatenate([
        np.linspace(0, 1, max(a_n, 1), endpoint=False),
        np.linspace(1, s, max(d_n, 1), endpoint=False),
        np.full(max(sustain_len, 0), s),
        np.linspace(s, 0, max(r_n, 1)),
    ])
    if len(env) < n:
        env = np.pad(env, (0, n - len(env)))
    return env[:n]


def saw(freq, n, phase=0.0, harmonics=None):
    """Band-limited saw via additive synthesis (clean on all devices)."""
    t = np.arange(n) / SR
    if harmonics is None:
        harmonics = int(min(40, (SR * 0.4) / max(freq, 1)))
    out = np.zeros(n)
    for k in range(1, harmonics + 1):
        out += np.sin(2 * np.pi * freq * k * t + phase * k) / k
    return out * 0.6


def square(freq, n, harmonics=None):
    t = np.arange(n) / SR
    if harmonics is None:
        harmonics = int(min(30, (SR * 0.4) / max(freq, 1)))
    out = np.zeros(n)
    for k in range(1, harmonics + 1, 2):
        out += np.sin(2 * np.pi * freq * k * t) / k
    return out * 0.7


def sine(freq, n, phase=0.0):
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * freq * t + phase)


# -------------------------------------------------------------- instruments --
class Track:
    def __init__(self, length_s, seed):
        self.n = int(length_s * SR)
        self.rng = np.random.default_rng(seed)
        self.buses = {}

    def bus(self, name):
        if name not in self.buses:
            self.buses[name] = np.zeros((2, self.n))
        return self.buses[name]

    def place(self, name, sig, start_s, gain=1.0, pan=0.0):
        b = self.bus(name)
        s = int(start_s * SR)
        if s >= self.n:
            return
        e = min(self.n, s + len(sig))
        seg = sig[: e - s] * gain
        left = np.cos((pan + 1) * np.pi / 4)
        right = np.sin((pan + 1) * np.pi / 4)
        b[0, s:e] += seg * left
        b[1, s:e] += seg * right


def inst_pad(freq, dur, rng, bright=2200):
    n = int((dur + 1.2) * SR)
    sig = np.zeros(n)
    for det in (-0.08, 0.0, 0.07):
        f = freq * 2 ** (det / 12)
        sig += saw(f, n, phase=rng.uniform(0, 6.28), harmonics=int(min(18, 9000 / f)))
    sig = lowpass(sig, bright)
    return sig * adsr(n, 0.6, 0.4, 0.8, 1.2) * 0.22


def inst_keys(freq, dur, rng):
    """Electric-piano style: FM-ish additive with bell partials."""
    n = int((dur + 0.8) * SR)
    t = np.arange(n) / SR
    mod = np.sin(2 * np.pi * freq * 2 * t) * 1.4 * np.exp(-t * 3)
    sig = np.sin(2 * np.pi * freq * t + mod)
    sig += 0.25 * np.sin(2 * np.pi * freq * 4.01 * t) * np.exp(-t * 6)
    env = np.exp(-t * 1.6) * adsr(n, 0.004, 0.05, 1.0, 0.5, sustain_len=int(dur * SR))
    return sig * env * 0.3


def inst_piano(freq, dur, rng):
    n = int((dur + 1.6) * SR)
    t = np.arange(n) / SR
    sig = np.zeros(n)
    for k, amp in enumerate([1.0, 0.55, 0.32, 0.18, 0.12, 0.07], start=1):
        inh = k * np.sqrt(1 + 0.0004 * k * k)
        sig += amp * np.sin(2 * np.pi * freq * inh * t) * np.exp(-t * (1.1 + k * 0.7))
    hammer = rng.standard_normal(n) * np.exp(-t * 120) * 0.05
    env = adsr(n, 0.002, 0.01, 1.0, 0.4, sustain_len=int(dur * SR))
    return (sig + hammer) * env * 0.32


def inst_pluck(freq, dur, rng, bright=5000):
    n = int(max(dur, 0.25) * SR + 0.3 * SR)
    t = np.arange(n) / SR
    sig = saw(freq, n, harmonics=int(min(20, 9000 / freq))) + 0.5 * square(freq * 1.002, n, 9)
    sig = lowpass(sig, bright)
    return sig * np.exp(-t * 7) * adsr(n, 0.002, 0.01, 1, 0.08) * 0.25


def inst_lead(freq, dur, rng, bright=3500):
    n = int((dur + 0.3) * SR)
    t = np.arange(n) / SR
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.2 * t) * np.clip(t * 2 - 0.3, 0, 1)
    phase = 2 * np.pi * np.cumsum(freq * vib) / SR
    sig = np.zeros(n)
    for k in range(1, 12):
        sig += np.sin(phase * k) / k * (1 if k % 2 else 0.45)
    sig = lowpass(sig, bright)
    return sig * adsr(n, 0.02, 0.1, 0.75, 0.25) * 0.18


def inst_bass(freq, dur, rng, drive=1.5):
    n = int((dur + 0.08) * SR)
    sig = sine(freq, n) + 0.35 * saw(freq, n, harmonics=8)
    sig = np.tanh(sig * drive) / np.tanh(drive)
    sig = lowpass(sig, 900)
    return sig * adsr(n, 0.005, 0.08, 0.85, 0.06) * 0.42


def inst_sub(freq, dur, rng):
    n = int((dur + 0.1) * SR)
    return sine(freq, n) * adsr(n, 0.01, 0.1, 0.9, 0.08) * 0.45


def drum_kick(rng, punch=1.0):
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 45 + 110 * np.exp(-t * 28) * punch
    phase = 2 * np.pi * np.cumsum(f) / SR
    sig = np.sin(phase) * np.exp(-t * 7.5)
    click = rng.standard_normal(n) * np.exp(-t * 400) * 0.12
    return np.tanh((sig + click) * 1.6) * 0.75


def drum_snare(rng):
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 25) * 0.4
    noise = bandpass(rng.standard_normal(n), 1200, 9000) * np.exp(-t * 16) * 0.55
    return (tone + noise) * 0.55


def drum_clap(rng):
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    noise = bandpass(rng.standard_normal(n), 900, 5000)
    env = np.zeros(n)
    for off in (0, 0.011, 0.022):
        o = int(off * SR)
        env[o:] += np.exp(-(t[: n - o]) * 45)
    env += np.exp(-t * 12) * 0.4
    return noise * env * 0.25


def drum_hat(rng, open_=False):
    n = int((0.35 if open_ else 0.06) * SR)
    t = np.arange(n) / SR
    noise = highpass(rng.standard_normal(n), 7000)
    return noise * np.exp(-t * (9 if open_ else 70)) * (0.16 if open_ else 0.12)


def drum_rim(rng):
    n = int(0.08 * SR)
    t = np.arange(n) / SR
    return (np.sin(2 * np.pi * 820 * t) + 0.5 * np.sin(2 * np.pi * 1650 * t)) * np.exp(-t * 60) * 0.18


def vinyl_noise(n, rng):
    hiss = lowpass(rng.standard_normal(n), 5000) * 0.006
    crackle = np.zeros(n)
    idx = rng.integers(0, n, size=n // 2500)
    crackle[idx] = rng.uniform(-0.25, 0.25, size=len(idx))
    crackle = bandpass(crackle, 1500, 8000)
    return hiss + crackle


# ---------------------------------------------------------------- harmony --
def chord_notes(root_midi, scale, degree, size=4, inversion_center=None):
    intervals = SCALES[scale]
    notes = []
    for i in range(size):
        d = degree + i * 2
        octave, idx = divmod(d, 7)
        notes.append(root_midi + intervals[idx] + 12 * octave)
    if inversion_center is not None:
        notes = [n + 12 * round((inversion_center - n) / 12) for n in notes]
        notes = sorted(notes)
    return notes


def scale_note(root_midi, scale, degree):
    octave, idx = divmod(degree, 7)
    return root_midi + SCALES[scale][idx] + 12 * octave


# --------------------------------------------------------------- composing --
def compose(spec):
    rng = np.random.default_rng(spec["seed"])
    bpm = spec["bpm"]
    beat = 60.0 / bpm
    bar = beat * 4
    swing = spec.get("swing", 0.0)
    sections = spec["sections"]  # list of (name, bars)
    total_bars = sum(b for _, b in sections)
    length = total_bars * bar + 3.0
    tr = Track(length, spec["seed"])
    root = 48 + NOTE_NAMES[spec["key"]]
    scale = spec["scale"]
    prog = spec["progression"]  # scale degrees, one per bar
    style = spec["style"]

    kick = drum_kick(rng, spec.get("punch", 1.0))
    snare = drum_snare(rng)
    clap = drum_clap(rng)
    hat_c = drum_hat(rng)
    hat_o = drum_hat(rng, True)
    rim = drum_rim(rng)

    # Melody motif (reused & varied for musical coherence)
    motif_len = 8
    motif = []
    pos = 0
    for _ in range(motif_len):
        step = rng.choice([-2, -1, 1, 2, 0, 3, -3], p=[.15, .25, .25, .15, .08, .06, .06])
        pos = int(np.clip(pos + step, -2, 9))
        motif.append(pos)
    rhythm_patterns = [
        [0, 1, 1.5, 2.5, 3, 4.5, 5, 6.5],
        [0, 0.5, 1.5, 2, 3, 3.5, 5, 6],
        [0, 1.5, 2, 3, 4, 5.5, 6, 7],
    ]
    rhythm = rhythm_patterns[spec["seed"] % 3]

    def swing_t(t_beats):
        frac = t_beats % 1
        if abs(frac - 0.5) < 1e-6:
            return t_beats + swing * 0.5
        return t_beats

    bar_idx = 0
    for sec_name, sec_bars in sections:
        layers = spec["layers"][sec_name]
        for b in range(sec_bars):
            t0 = bar_idx * bar
            degree = prog[bar_idx % len(prog)]
            chord = chord_notes(root + 12, scale, degree, 4, inversion_center=root + 17)
            last_bar_of_sec = b == sec_bars - 1

            if "pad" in layers:
                for i, note in enumerate(chord):
                    tr.place("pad", inst_pad(midi_to_hz(note), bar, rng, spec.get("pad_bright", 2200)),
                             t0, 1.0, pan=(-0.5 + i / 3))
            if "keys" in layers:
                hits = spec.get("keys_rhythm", [0, 1.5, 2.5])
                for h in hits:
                    for i, note in enumerate(chord):
                        tr.place("keys", inst_keys(midi_to_hz(note), beat * 0.9, rng),
                                 t0 + swing_t(h) * beat, 0.8, pan=-0.3 + i * 0.2)
            if "piano" in layers:
                # broken chord, gentle
                pattern = [0, 1, 2, 3, 2, 1, 2, 3]
                for i, p in enumerate(pattern):
                    note = chord[p] + (12 if i == 3 else 0)
                    tr.place("piano", inst_piano(midi_to_hz(note), beat * 0.5, rng),
                             t0 + i * beat * 0.5, 0.85 * rng.uniform(0.8, 1.0), pan=-0.2 + p * 0.13)
                tr.place("piano", inst_piano(midi_to_hz(chord[0] - 12), bar, rng), t0, 0.9, pan=-0.2)
            if "arp" in layers:
                arp_notes = chord + [chord[1] + 12, chord[2] + 12]
                steps = 16 if spec.get("arp_16th", True) else 8
                for i in range(steps):
                    note = arp_notes[(i * spec.get("arp_skip", 1)) % len(arp_notes)] + 12
                    st = t0 + i * (bar / steps)
                    tr.place("arp", inst_pluck(midi_to_hz(note), bar / steps, rng,
                                               spec.get("arp_bright", 4500)),
                             st, 0.75 * (1.0 if i % 4 == 0 else 0.8), pan=0.35 * np.sin(i))
            if "bass" in layers:
                bn = scale_note(root - 12, scale, degree)
                pattern = spec.get("bass_pattern", [(0, 1.5), (1.5, 0.5), (2, 1.5), (3.5, 0.5)])
                for (st, du) in pattern:
                    note = bn + (12 if (st == 3.5 and spec.get("bass_octave_jump")) else 0)
                    tr.place("bass", inst_bass(midi_to_hz(note), du * beat * 0.95, rng,
                                               spec.get("bass_drive", 1.5)),
                             t0 + swing_t(st) * beat, 1.0)
            if "sub" in layers:
                bn = scale_note(root - 12, scale, degree)
                tr.place("bass", inst_sub(midi_to_hz(bn), bar * 0.98, rng), t0, 1.0)
            if "lead" in layers:
                variant = (bar_idx // 2) % 4
                half = (bar_idx % 2)
                for i in range(4):
                    k = half * 4 + i
                    deg = motif[k] + degree * (1 if variant in (1, 3) else 0) // 2
                    if variant == 2 and i == 3:
                        deg += 2
                    note = scale_note(root + 24, scale, deg)
                    st = (rhythm[k] - half * 4)
                    if st < 0 or st >= 4:
                        st = i
                    nxt = (rhythm[k + 1] - half * 4) if k + 1 < len(rhythm) and i < 3 else 4
                    du = max(0.4, min(nxt - st, 2.0)) * beat
                    tr.place("lead", inst_lead(midi_to_hz(note), du * 0.92, rng,
                                               spec.get("lead_bright", 3500)),
                             t0 + swing_t(st) * beat, 0.9)
            if "bell" in layers:
                for i, st in enumerate([0, 2.5]):
                    note = chord[(bar_idx + i) % 4] + 24
                    tr.place("lead", inst_keys(midi_to_hz(note), beat * 1.5, rng), t0 + st * beat, 0.45,
                             pan=0.5 if i else -0.5)

            # ---- drums
            dr = spec["drums"]
            if "drums" in layers or "drums_lite" in layers:
                lite = "drums_lite" in layers
                if dr == "four":
                    for q in range(4):
                        tr.place("kick", kick, t0 + q * beat, 1.0)
                        if not lite:
                            tr.place("drums", hat_o, t0 + (q + 0.5) * beat, 0.8, pan=0.2)
                    if not lite:
                        for q in (1, 3):
                            tr.place("drums", clap, t0 + q * beat, 1.0)
                        for s16 in range(16):
                            if s16 % 2 == 1:
                                tr.place("drums", hat_c, t0 + s16 * beat / 4,
                                         0.5 * rng.uniform(0.6, 1), pan=-0.25)
                elif dr == "lofi":
                    pattern_k = [0, 1.75, 2.5] if bar_idx % 2 == 0 else [0, 2.25, 2.75]
                    for st in pattern_k:
                        tr.place("kick", kick, t0 + swing_t(st) * beat, 0.85)
                    if not lite:
                        for q in (1, 3):
                            tr.place("drums", snare, t0 + q * beat, 0.8)
                    for e in range(8):
                        tr.place("drums", hat_c, t0 + swing_t(e * 0.5) * beat,
                                 0.6 * (1 if e % 2 == 0 else 0.55) * rng.uniform(0.7, 1), pan=0.3)
                    if bar_idx % 4 == 3:
                        tr.place("drums", rim, t0 + 3.75 * beat, 0.7, pan=-0.4)
                elif dr == "pop":
                    for st in ([0, 1.5, 2] if bar_idx % 2 == 0 else [0, 0.75, 2, 2.5]):
                        tr.place("kick", kick, t0 + st * beat, 1.0)
                    if not lite:
                        for q in (1, 3):
                            tr.place("drums", snare, t0 + q * beat, 0.9)
                            tr.place("drums", clap, t0 + q * beat, 0.6)
                    for e in range(8):
                        tr.place("drums", hat_c, t0 + e * 0.5 * beat, 0.55, pan=0.25)
                    if last_bar_of_sec and not lite:
                        for s16 in range(12, 16):
                            tr.place("drums", snare, t0 + s16 * beat / 4, 0.4 + 0.1 * (s16 - 12))
                elif dr == "half":
                    tr.place("kick", kick, t0, 1.0)
                    tr.place("kick", kick, t0 + 2.75 * beat, 0.7)
                    if not lite:
                        tr.place("drums", snare, t0 + 2 * beat, 0.9)
                    for e in range(8):
                        tr.place("drums", hat_c, t0 + e * 0.5 * beat, 0.45 * rng.uniform(0.7, 1), pan=0.2)
            if "riser" in layers and last_bar_of_sec:
                n = int(bar * SR)
                t = np.arange(n) / SR
                noise = highpass(rng.standard_normal(n), 2500) * (t / bar) ** 2 * 0.12
                tr.place("fx", noise, t0, 1.0)
            if "impact" in layers and b == 0:
                tr.place("fx", inst_sub(midi_to_hz(root - 12), 1.5, rng) * np.exp(-np.arange(int(1.6 * SR)) / SR * 2)[: int(1.6 * SR)], t0, 0.8)
            bar_idx += 1

    return tr, beat, length


def mixdown(tr, spec, beat):
    rng = np.random.default_rng(spec["seed"] + 99)
    ir_long = make_reverb_ir(spec.get("reverb_len", 3.2), rng, 5500)
    ir_short = make_reverb_ir(1.1, rng, 7000)
    n = tr.n
    mix = np.zeros((2, n))

    # sidechain envelope from kick bus
    kick_bus = tr.buses.get("kick")
    if kick_bus is not None and spec.get("sidechain", 0) > 0:
        env = np.abs(kick_bus[0]) + np.abs(kick_bus[1])
        env = lowpass(env, 12)
        env = env / (env.max() + 1e-9)
        duck = 1 - np.clip(env * 2.2, 0, 1) * spec["sidechain"]
    else:
        duck = np.ones(n)

    gains = {"pad": 0.9, "keys": 0.75, "piano": 0.9, "arp": 0.55, "bass": 0.85,
             "lead": 0.65, "kick": 0.95, "drums": 0.75, "fx": 0.6}
    gains.update(spec.get("gains", {}))

    for name, bus in tr.buses.items():
        g = gains.get(name, 0.7)
        sig = bus * g
        if name in ("pad", "keys", "arp", "lead", "piano"):
            sig = highpass(sig, 140 if name != "piano" else 70)
        if name in ("pad", "arp", "bass", "keys", "lead"):
            sig = sig * duck
        if name in ("arp", "lead"):
            sig = delay(sig, beat * 0.75, 0.4, spec.get("delay_mix", 0.22))
        if name in ("pad", "lead", "arp", "piano", "keys", "fx"):
            sig = reverb(sig, ir_long, spec.get("reverb_mix", 0.32))
        elif name == "drums":
            sig = reverb(sig, ir_short, 0.12)
        mix += sig

    if spec.get("vinyl"):
        v = vinyl_noise(n, rng)
        mix += np.vstack([v, np.roll(v, 137)])
    if spec.get("lofi_tone"):
        mix = np.vstack([lowpass(mix[0], spec["lofi_tone"]), lowpass(mix[1], spec["lofi_tone"])])

    # gentle master glue + fades
    mix = mix / (np.max(np.abs(mix)) + 1e-9) * 1.25
    mix = np.tanh(mix * 1.1) / np.tanh(1.1)
    fade_in = int(0.05 * SR)
    fade_out = int(3.0 * SR)
    mix[:, :fade_in] *= np.linspace(0, 1, fade_in)
    mix[:, -fade_out:] *= np.linspace(1, 0, fade_out) ** 1.5
    mix = mix / (np.max(np.abs(mix)) + 1e-9) * 0.89
    return mix


def write_mp3(stereo, path, title, artist, album):
    pcm = (np.clip(stereo.T, -1, 1) * 32767).astype("<i2")
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = tmp.name
    with wave.open(tmp_path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error", "-i", tmp_path,
        "-codec:a", "libmp3lame", "-b:a", "128k",
        "-metadata", f"title={title}", "-metadata", f"artist={artist}",
        "-metadata", f"album={album}", "-metadata", "copyright=CC0 1.0 – AURIX Originals",
        path,
    ], check=True)
    os.unlink(tmp_path)


# -------------------------------------------------------------------- specs --
L = lambda *names: set(names)  # noqa: E731

TRACKS = [
    dict(id="midnight-bloom", title="Midnight Bloom", artist="Nova Lumen", album="Afterglow Theory",
         seed=11, bpm=100, key="A", scale="minor", style="synthwave", drums="pop",
         progression=[0, 5, 2, 6], sidechain=0.45, pad_bright=2600, arp_bright=3800,
         sections=[("intro", 4), ("a", 8), ("b", 8), ("break", 4), ("c", 8), ("outro", 4)],
         layers={"intro": L("pad", "arp"), "a": L("pad", "arp", "bass", "drums"),
                 "b": L("pad", "arp", "bass", "drums", "lead"), "break": L("pad", "lead", "riser"),
                 "c": L("pad", "arp", "bass", "drums", "lead", "impact"), "outro": L("pad", "arp")}),
    dict(id="velvet-orbit", title="Velvet Orbit", artist="Nova Lumen", album="Afterglow Theory",
         seed=23, bpm=92, key="F#", scale="minor", style="dreamwave", drums="half",
         progression=[0, 3, 5, 4], sidechain=0.3, pad_bright=1900, reverb_mix=0.4,
         sections=[("intro", 4), ("a", 8), ("b", 8), ("outro", 4)],
         layers={"intro": L("pad", "bell"), "a": L("pad", "sub", "drums", "bell"),
                 "b": L("pad", "sub", "drums", "lead", "arp"), "outro": L("pad", "bell")}),
    dict(id="paper-skies", title="Paper Skies", artist="Kairo Bay", album="Slow Mornings",
         seed=37, bpm=82, key="D", scale="dorian", style="lofi", drums="lofi", swing=0.18,
         progression=[0, 3, 1, 4], vinyl=True, lofi_tone=7000, keys_rhythm=[0, 1.5, 2.5, 3.5],
         bass_pattern=[(0, 1.5), (2, 1.0), (3.5, 0.5)],
         sections=[("intro", 4), ("a", 8), ("b", 8), ("outro", 4)],
         layers={"intro": L("keys", "drums_lite"), "a": L("keys", "bass", "drums"),
                 "b": L("keys", "bass", "drums", "lead"), "outro": L("keys")},
         gains={"lead": 0.5}, lead_bright=2200),
    dict(id="rain-on-glass", title="Rain on Glass", artist="Kairo Bay", album="Slow Mornings",
         seed=41, bpm=76, key="E", scale="minor", style="lofi", drums="lofi", swing=0.2,
         progression=[0, 5, 3, 4], vinyl=True, lofi_tone=6200, keys_rhythm=[0, 2, 2.5],
         bass_pattern=[(0, 2.0), (2.5, 1.0)],
         sections=[("intro", 2), ("a", 8), ("b", 8), ("outro", 4)],
         layers={"intro": L("piano"), "a": L("piano", "bass", "drums"),
                 "b": L("piano", "keys", "bass", "drums"), "outro": L("piano")},
         gains={"keys": 0.45}),
    dict(id="pulse-theory", title="Pulse Theory", artist="Vanta Grid", album="Signal & Noise",
         seed=53, bpm=122, key="G", scale="minor", style="house", drums="four",
         progression=[0, 0, 5, 3], sidechain=0.7, keys_rhythm=[0.5, 1.5, 2.5, 3.5],
         bass_pattern=[(0.5, 0.4), (1.5, 0.4), (2.5, 0.4), (3.5, 0.4)], bass_octave_jump=False,
         sections=[("intro", 8), ("a", 8), ("b", 8), ("break", 4), ("c", 8), ("outro", 8)],
         layers={"intro": L("drums_lite", "keys"), "a": L("drums", "bass", "keys"),
                 "b": L("drums", "bass", "keys", "arp"), "break": L("pad", "keys", "riser"),
                 "c": L("drums", "bass", "keys", "arp", "pad", "impact"), "outro": L("drums_lite", "keys")},
         arp_16th=True, arp_skip=3, arp_bright=3000, gains={"pad": 0.6}),
    dict(id="neon-cathedral", title="Neon Cathedral", artist="Vanta Grid", album="Signal & Noise",
         seed=67, bpm=126, key="C", scale="minor", style="techno", drums="four", punch=1.3,
         progression=[0, 0, 6, 5], sidechain=0.75, pad_bright=1500, bass_drive=3.0,
         bass_pattern=[(0.5, 0.25), (0.75, 0.25), (1.5, 0.25), (1.75, 0.25),
                       (2.5, 0.25), (2.75, 0.25), (3.5, 0.25), (3.75, 0.25)],
         sections=[("intro", 8), ("a", 8), ("break", 4), ("c", 12), ("outro", 4)],
         layers={"intro": L("drums_lite", "bass"), "a": L("drums", "bass", "arp"),
                 "break": L("pad", "riser"), "c": L("drums", "bass", "arp", "pad", "impact"),
                 "outro": L("drums_lite", "pad")},
         arp_skip=2, arp_bright=2400, reverb_mix=0.28),
    dict(id="aurora-drift", title="Aurora Drift", artist="Sølvi", album="Northern Quiet",
         seed=71, bpm=66, key="D#", scale="lydian", style="ambient", drums="none",
         progression=[0, 4, 5, 3], pad_bright=1700, reverb_len=5.5, reverb_mix=0.55,
         sections=[("intro", 4), ("a", 8), ("b", 8), ("outro", 4)],
         layers={"intro": L("pad"), "a": L("pad", "bell", "sub"), "b": L("pad", "bell", "sub", "lead"),
                 "outro": L("pad")}, gains={"lead": 0.4}, lead_bright=1800),
    dict(id="silver-hours", title="Silver Hours", artist="Sølvi", album="Northern Quiet",
         seed=83, bpm=72, key="A#", scale="major", style="piano", drums="none",
         progression=[0, 5, 3, 4], reverb_len=4.2, reverb_mix=0.42,
         sections=[("intro", 4), ("a", 8), ("b", 8), ("outro", 4)],
         layers={"intro": L("piano"), "a": L("piano", "pad"), "b": L("piano", "pad", "lead"),
                 "outro": L("piano")}, gains={"pad": 0.5, "lead": 0.35}, lead_bright=1600),
    dict(id="gravity-lines", title="Gravity Lines", artist="Echo Atlas", album="Parallel Rooms",
         seed=97, bpm=95, key="B", scale="minor", style="downtempo", drums="half", swing=0.1,
         progression=[0, 5, 6, 4], sidechain=0.25, keys_rhythm=[0, 2.5],
         sections=[("intro", 4), ("a", 8), ("b", 8), ("break", 4), ("c", 8)],
         layers={"intro": L("keys", "pad"), "a": L("keys", "pad", "sub", "drums"),
                 "b": L("keys", "pad", "sub", "drums", "arp"), "break": L("pad", "bell", "riser"),
                 "c": L("keys", "pad", "sub", "drums", "arp", "lead", "impact")},
         arp_16th=False, arp_bright=2600),
    dict(id="hollow-light", title="Hollow Light", artist="Echo Atlas", album="Parallel Rooms",
         seed=109, bpm=84, key="C#", scale="minor", style="cinematic", drums="half", punch=1.2,
         progression=[0, 5, 2, 6], pad_bright=2400, reverb_len=4.5, reverb_mix=0.45,
         sections=[("intro", 4), ("a", 8), ("b", 8), ("outro", 4)],
         layers={"intro": L("piano", "pad"), "a": L("piano", "pad", "sub", "drums_lite"),
                 "b": L("piano", "pad", "sub", "drums", "lead", "impact"), "outro": L("pad", "piano")},
         gains={"lead": 0.55}),
    dict(id="solar-run", title="Solar Run", artist="Juno Ray", album="Bright Side Club",
         seed=127, bpm=118, key="E", scale="major", style="electropop", drums="pop",
         progression=[0, 4, 5, 3], sidechain=0.5, bass_octave_jump=True, arp_bright=5200,
         sections=[("intro", 4), ("a", 8), ("b", 8), ("break", 4), ("c", 8), ("outro", 4)],
         layers={"intro": L("arp", "drums_lite"), "a": L("arp", "bass", "drums", "pad"),
                 "b": L("arp", "bass", "drums", "lead", "pad"), "break": L("pad", "bell", "riser"),
                 "c": L("arp", "bass", "drums", "lead", "pad", "impact"), "outro": L("arp", "pad")},
         lead_bright=4500),
    dict(id="golden-hour-avenue", title="Golden Hour Avenue", artist="Juno Ray", album="Bright Side Club",
         seed=131, bpm=108, key="G", scale="major", style="funk", drums="pop", swing=0.12,
         progression=[0, 3, 1, 4], sidechain=0.35, keys_rhythm=[0, 0.75, 1.5, 2.5, 3.25],
         bass_pattern=[(0, 0.75), (0.75, 0.25), (1.5, 0.5), (2.5, 0.5), (3, 0.25), (3.5, 0.5)],
         bass_octave_jump=True,
         sections=[("intro", 4), ("a", 8), ("b", 8), ("outro", 4)],
         layers={"intro": L("keys", "drums_lite"), "a": L("keys", "bass", "drums"),
                 "b": L("keys", "bass", "drums", "lead", "bell"), "outro": L("keys", "bass")}),
]


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    only = set(sys.argv[1:])
    durations = {}
    for spec in TRACKS:
        if only and spec["id"] not in only:
            continue
        print(f"♪ composing {spec['title']} – {spec['artist']} …", flush=True)
        tr, beat, length = compose(spec)
        mix = mixdown(tr, spec, beat)
        path = os.path.join(OUT_DIR, f"{spec['id']}.mp3")
        write_mp3(mix, path, spec["title"], spec["artist"], spec["album"])
        durations[spec["id"]] = round(length, 2)
        print(f"  → {os.path.relpath(path, ROOT)}  ({length:.1f}s)")
    subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "compute_peaks.py")], check=True)


if __name__ == "__main__":
    main()
