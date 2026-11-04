"""Original procedural score + signature chime (48 kHz stereo WAV). No samples, no third-party audio.

    python3 production/score.py out.wav --duration 120 --reveal 18 --end 115 [--mood demo|ad]

Pad (detuned saws through a soft low-pass) moves from a suspended chord to a resolved one at --reveal;
a quiet 8th-note pulse enters after the reveal; the signature chime (the product's "found" sound:
two rising bell partials) lands at --end.
"""
import argparse, wave
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('out'); ap.add_argument('--duration', type=float, default=120); ap.add_argument('--reveal', type=float, default=18)
ap.add_argument('--end', type=float, default=115); ap.add_argument('--mood', default='demo'); ap.add_argument('--bpm', type=float, default=84)
a = ap.parse_args()
SR = 48000
n = int(a.duration * SR)
t = np.arange(n) / SR
rng = np.random.default_rng(20261104)

def note(m): return 440.0 * 2 ** ((m - 69) / 12)

def saw(f, ph=0.0):
    # band-limited-ish saw via additive partials (8 is plenty for a pad)
    out = np.zeros(n)
    for k in range(1, 9):
        out += np.sin(2 * np.pi * f * k * t + ph * k) / k
    return out

def lowpass(x, cutoff):
    # one-pole low-pass, cutoff may be an array (time-varying)
    y = np.zeros_like(x); a_ = np.exp(-2 * np.pi * np.broadcast_to(cutoff, x.shape) / SR); acc = 0.0
    for i in range(len(x)):
        acc = (1 - a_[i]) * x[i] + a_[i] * acc; y[i] = acc
    return y

def env(start, stop, att=2.0, rel=2.5):
    e = np.clip((t - start) / att, 0, 1) * np.clip((stop - t) / rel, 0, 1)
    return e * e * (3 - 2 * e)

# chords (MIDI): suspended tension -> open resolution
tension = [50, 57, 62, 64]      # D3 A3 D4 E4 (sus2, unresolved)
resolve = [50, 57, 62, 66, 69]  # D3 A3 D4 F#4 A4 (D major, open)
pad = np.zeros(n)
for m in tension:
    for det in (-0.07, 0.07):
        pad += saw(note(m + det), rng.uniform(0, 6)) * env(0, a.reveal + 1.5, 3.0, 2.0)
for m in resolve:
    for det in (-0.06, 0.06):
        pad += saw(note(m + det), rng.uniform(0, 6)) * env(a.reveal - 0.5, a.duration, 2.5, 3.0)
cut = 500 + 900 * np.clip((t - a.reveal) / 6, 0, 1) + 120 * np.sin(2 * np.pi * t / 9)
pad = lowpass(pad, cut) * 0.06

# soft pulse after the reveal (filtered sine plucks on the chord tones)
beat = 60 / a.bpm / 2
pulse = np.zeros(n)
seq = [62, 69, 66, 69, 62, 69, 71, 69]
for i, start in enumerate(np.arange(a.reveal + 2, a.end - 1, beat)):
    i0, L = int(start * SR), int(0.45 * SR)
    if i0 + L >= n: break
    tt = np.arange(L) / SR
    f = note(seq[i % len(seq)] + 12)
    pulse[i0:i0 + L] += np.sin(2 * np.pi * f * tt) * np.exp(-tt * 9) * 0.035
pulse *= np.clip((t - a.reveal - 2) / 4, 0, 1) * np.clip((a.end - 0.5 - t) / 2, 0, 1)

# signature chime at the end card: two rising bell partials (inharmonic, decaying)
chime = np.zeros(n)
for k, (m, dly) in enumerate([(74, 0.0), (81, 0.16)]):
    i0 = int((a.end + 0.2 + dly) * SR); L = min(int(3.5 * SR), n - i0)
    if L <= 0: continue
    tt = np.arange(L) / SR; f = note(m)
    bell = sum(np.sin(2 * np.pi * f * r * tt) * g for r, g in [(1, 1), (2.76, .35), (5.4, .12)])
    chime[i0:i0 + L] += bell * np.exp(-tt * 2.2) * 0.09

mix = pad + pulse + chime
# stereo: slight decorrelation via a short delay on the right channel
R = np.concatenate([np.zeros(int(0.011 * SR)), mix[:-int(0.011 * SR)]])
st = np.stack([mix, 0.92 * mix + 0.08 * R], axis=1)
st *= 0.89 / max(1e-9, np.abs(st).max())           # peak -1 dBFS
st *= np.clip(t / 1.5, 0, 1)[:, None] * np.clip((a.duration - t) / 1.2, 0, 1)[:, None]
pcm = (st * 32767).astype('<i2')
with wave.open(a.out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('wrote', a.out, f'{a.duration}s')
