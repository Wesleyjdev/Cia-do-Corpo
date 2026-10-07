#!/usr/bin/env python3
"""Análise de áudio para animação sincronizada -> JSON (e opcionalmente JS).

Saída:
  fps, duration, n_frames, bpm
  beats   [t, ...]                       grade de batidas (s)
  onsets  [{t, s}, ...]                  ataques com força normalizada
  frames  [{<bandas>, rms, onset, spec[]}, ...]   um item por frame de vídeo
          bandas e rms/onset normalizados (≈0..1, p99 = 1, teto 1.5)
          spec = espectro mel (n_mels valores 0..1) para visualizadores

Uso:
  python3 analyze_audio.py audio.mp3 audio.json [--fps 30] [--mels 64] [--js]
          [--bands "sub:20-80,bass:80-250,lowmid:250-1000,mid:1000-4000,high:4000-16000"]
  --js grava também audio.js (window.AUDIO = {...}) para páginas abertas via file://

Requer: pip install librosa numpy
"""
import argparse
import json
from pathlib import Path

import librosa
import numpy as np

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument("audio")
ap.add_argument("out")
ap.add_argument("--fps", type=float, default=30)
ap.add_argument("--mels", type=int, default=64, help="bandas do espectro por frame (0 desliga)")
ap.add_argument("--sr", type=int, default=44100)
ap.add_argument("--bands", default="sub:20-80,bass:80-250,lowmid:250-1000,mid:1000-4000,high:4000-16000")
ap.add_argument("--js", action="store_true", help="grava também <out>.js com window.AUDIO")
a = ap.parse_args()

HOP = 512
y, sr = librosa.load(a.audio, sr=a.sr, mono=True)
dur = len(y) / sr
n_frames = int(round(dur * a.fps))

tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, hop_length=HOP, units="frames")
beats = librosa.frames_to_time(beat_frames, sr=sr, hop_length=HOP)
onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP)
onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr, hop_length=HOP, units="time")

S = np.abs(librosa.stft(y, n_fft=2048, hop_length=HOP))
freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
st = librosa.frames_to_time(np.arange(S.shape[1]), sr=sr, hop_length=HOP)
rms = librosa.feature.rms(y=y, hop_length=HOP)[0]


def norm(v):
    v = np.asarray(v, float)
    return np.clip(v / (np.percentile(v, 99) + 1e-9), 0, 1.5)


bands = {}
for spec in a.bands.split(","):
    name, rng = spec.split(":")
    lo, hi = (float(x) for x in rng.split("-"))
    m = (freqs >= lo) & (freqs < hi)
    bands[name] = norm(S[m].mean(axis=0)) if m.any() else np.zeros(S.shape[1])
series = bands | {"rms": norm(rms), "onset": norm(onset_env)}

if a.mels:  # mel bands: every band has energy (narrow log bins at low freq would be empty)
    mel = librosa.feature.melspectrogram(S=S ** 2, sr=sr, n_mels=a.mels, fmin=30, fmax=min(14000, sr / 2))
    spec_n = np.clip((librosa.power_to_db(mel, ref=np.max) + 55) / 55, 0, 1)

frames = []
for i in range(n_frames):
    j = min(int(np.searchsorted(st, i / a.fps)), S.shape[1] - 1)
    f = {k: round(float(v[min(j, len(v) - 1)]), 4) for k, v in series.items()}
    if a.mels:
        f["spec"] = [round(float(x), 3) for x in spec_n[:, j]]
    frames.append(f)

onset_t = librosa.frames_to_time(np.arange(len(onset_env)), sr=sr, hop_length=HOP)
strength = np.interp(onsets, onset_t, norm(onset_env))
out = {
    "fps": a.fps, "duration": round(dur, 4), "n_frames": n_frames,
    "bpm": round(float(np.atleast_1d(tempo)[0]), 2),
    "beats": [round(float(b), 3) for b in beats],
    "onsets": [{"t": round(float(t), 3), "s": round(float(s), 3)} for t, s in zip(onsets, strength)],
    "frames": frames,
}
dst = Path(a.out)
dst.write_text(json.dumps(out, separators=(",", ":")))
if a.js:
    dst.with_suffix(".js").write_text("window.AUDIO=" + json.dumps(out, separators=(",", ":")) + ";\n")

top = sorted(out["onsets"], key=lambda o: -o["s"])[:8]
print(f"{dst}: {dur:.3f}s, {n_frames} frames @ {a.fps:g} fps, ~{out['bpm']} BPM, {len(beats)} batidas")
print("ataques mais fortes (s):", ", ".join(f"{o['t']:.2f}" for o in sorted(top, key=lambda o: o["t"])))
