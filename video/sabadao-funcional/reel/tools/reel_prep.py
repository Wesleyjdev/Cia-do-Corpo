"""Prepare the Sabadão Funcional reel (talking-head edit of IMG_1688.MOV).

1. frames: HLG/HDR iPhone footage -> SDR (mobius tone map, light warm
   grade), every source frame saved once as high-quality JPEG (the raw
   is decoded straight from the camera file, no intermediate re-encode).
2. edl.js: the edit decision list (window.REEL) used by project/reel.html.
3. audio: voice cut by the EDL (short crossfades), denoised, EQ'd and
   normalised (~-16 LUFS); music = the original song starting where the
   final art lands on the same beat as in the approved 15 s video, ducked
   under the voice (-20 dB speech / -10 dB pauses / full on the final),
   0.8 s fade out; master at -14 LUFS integrated, true peak < -1 dBTP.

Usage: python3 reel/tools/reel_prep.py [frames] [audio]   (default: both)
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]            # video/sabadao-funcional
SRC = ROOT / "project" / "assets" / "src"
RAW = SRC / "IMG_1688.MOV"
SONG = SRC / "toca_o_trompete.mp3"
FRAMES = ROOT / "project" / "reel_src"
WORK = ROOT / "reel" / "work"
FPS = 30
SR = 48000

TONEMAP = ("zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,"
           "tonemap=mobius:param=0.4:desat=0,zscale=t=bt709:m=bt709:r=tv,"
           "eq=contrast=1.05:saturation=1.04:gamma=1.02,"
           "colorbalance=rm=0.02:bm=-0.03")

# ---------------------------------------------------------------- EDL
# Audio segments (source seconds) in order. Cuts only remove silences,
# breaths and the phrase "mais precisamente" (10.56-11.66).
SEGMENTS = [
    # src_in, src_out, video clean range (src)  speaker
    (0.15, 2.85, (0.0, 2.53), "ele"),
    (3.00, 6.37, (3.20, 6.37), "ela"),
    (6.51, 7.48, (6.51, 7.03), "ela"),
    (7.74, 10.56, (7.74, 10.56), "ele"),
    (11.66, 12.32, (11.66, 12.43), "ele"),
    (12.62, 19.36, (12.80, 19.43), "ela"),
    (19.66, 21.44, (19.73, 21.70), "dois"),
]
FINAL_CUT = 19.10            # reel time where the leaves cut to the final art
APPROVED_FINAL = 8.4640      # same instant in the approved 15 s video
CLIP15_IN_SONG = 64.579      # the approved 15 s music starts here in the song
FINAL_AT_END = 15.34         # approved timeline value at the last reel frame
DURATION = round(FINAL_CUT + (FINAL_AT_END - APPROVED_FINAL), 4)
SONG_OFFSET = CLIP15_IN_SONG + APPROVED_FINAL - FINAL_CUT


def timeline():
    t, out = 0.0, []
    for a, b, clean, who in SEGMENTS:
        out.append({"t0": round(t, 4), "t1": round(t + b - a, 4), "src0": a, "src1": b,
                    "clean": clean, "who": who})
        t += b - a
    return out


def frames():
    FRAMES.mkdir(parents=True, exist_ok=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(RAW), "-vf", TONEMAP + ",format=yuvj444p",
                    "-q:v", "2", "-start_number", "0", str(FRAMES / "%04d.jpg")], check=True)
    print("frames:", len(list(FRAMES.glob("*.jpg"))))


def decode(path, ss=None, t=None, sr=SR, ch=2):
    cmd = ["ffmpeg", "-v", "error"]
    if ss is not None:
        cmd += ["-ss", f"{ss:.4f}"]
    cmd += ["-i", str(path)]
    if t is not None:
        cmd += ["-t", f"{t:.4f}"]
    cmd += ["-ac", str(ch), "-ar", str(sr), "-f", "f32le", "-"]
    raw = subprocess.run(cmd, check=True, capture_output=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, ch).copy()


def write_wav(path, x):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", str(x.shape[1]),
                    "-i", "-", str(path)], input=x.astype(np.float32).tobytes(), check=True)


def loudness(path):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(path), "-af", "ebur128=peak=true", "-f", "null", "-"],
                       capture_output=True, text=True).stderr
    tail = r[r.rfind("Summary:"):]
    I = float(tail.split("I:")[1].split("LUFS")[0])
    tp = float(tail.split("Peak:")[1].split("dBFS")[0])
    return I, tp


def audio():
    WORK.mkdir(parents=True, exist_ok=True)
    # --- voice: cut + 12 ms equal-power crossfades at every join
    raw = decode(RAW, ch=1)[:, 0]
    xf = int(0.012 * SR)
    parts = []
    for a, b, _, _ in SEGMENTS:
        seg = raw[int(a * SR) - xf // 2: int(b * SR) + xf // 2].copy()
        parts.append(seg)
    voice = parts[0]
    ramp = np.sin(np.linspace(0, np.pi / 2, xf)) ** 2
    for p in parts[1:]:
        head = voice[-xf:] * (1 - ramp) + p[:xf] * ramp
        voice = np.concatenate([voice[:-xf], head, p[xf:]])
    n = int(DURATION * SR)
    voice = np.concatenate([voice, np.zeros(max(0, n - len(voice)), np.float32)])[:n]
    write_wav(WORK / "voice_cut.wav", voice[:, None])
    # clarity: high-pass, light denoise, presence, gentle compression; ~-16 LUFS
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(WORK / "voice_cut.wav"), "-af",
                    "highpass=f=85,afftdn=nr=8:nf=-30,equalizer=f=250:t=q:w=1.2:g=-2,"
                    "equalizer=f=3200:t=q:w=1.0:g=2.5,equalizer=f=9000:t=q:w=0.8:g=1,"
                    "acompressor=threshold=-20dB:ratio=2.5:attack=8:release=120,"
                    "loudnorm=I=-16:TP=-2:LRA=7", "-ar", str(SR), "-ac", "2",
                    str(WORK / "voice.wav")], check=True)
    v = decode(WORK / "voice.wav")
    v = np.concatenate([v, np.zeros((max(0, n - len(v)), 2), np.float32)])[:n]

    # --- music: the song, starting so the final lands on the approved beat
    m = decode(SONG, ss=SONG_OFFSET, t=DURATION)
    m = np.concatenate([m, np.zeros((max(0, n - len(m)), 2), np.float32)])[:n]
    # ducking envelope from voice activity (attack 120 ms, release 400 ms)
    hop = int(0.01 * SR)
    env = np.sqrt(np.convolve(v[:, 0] ** 2, np.ones(hop) / hop, "same"))[::hop]
    db = 20 * np.log10(env + 1e-7)
    active = db > (np.percentile(db[db > -90], 90) - 24)
    # hold short gaps (< 180 ms) as speech so the music does not pump
    act = active.copy()
    gap = 0
    for i in range(len(act)):
        if active[i]:
            if 0 < gap < 18:
                act[i - gap:i] = True
            gap = 0
        else:
            gap += 1
    target = np.where(act, -20.0, -10.0)
    final_i = int(FINAL_CUT * 100) - 25
    target[final_i:] = 0.0                      # full on the final art
    g = np.empty_like(target)
    cur = target[0]
    a_up, a_dn = np.exp(-1 / 40.0), np.exp(-1 / 12.0)   # release 400 ms, attack 120 ms
    for i, tv in enumerate(target):
        k = a_dn if tv < cur else a_up
        cur = tv + (cur - tv) * k
        g[i] = cur
    gain = 10 ** (np.interp(np.arange(n) / SR, np.arange(len(g)) / 100, g) / 20)
    fade = np.clip((DURATION - np.arange(n) / SR) / 0.8, 0, 1)
    music = m * (gain * fade)[:, None]

    # music level: before ducking, put the song's own loudness at -14 LUFS
    write_wav(WORK / "music_raw.wav", m)
    I_m, _ = loudness(WORK / "music_raw.wav")
    music *= 10 ** ((-14 - I_m) / 20)
    mix = v + music
    write_wav(WORK / "mix_pre.wav", mix)
    I, tp = loudness(WORK / "mix_pre.wav")
    mix *= 10 ** ((-14 - I) / 20)
    # true-peak safety: soft limit to -1.2 dBTP
    write_wav(WORK / "mix_gain.wav", mix)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(WORK / "mix_gain.wav"), "-af",
                    "alimiter=limit=0.83:attack=3:release=60:level=disabled", "-ar", str(SR),
                    str(WORK / "mix.wav")], check=True)
    I, tp = loudness(WORK / "mix.wav")
    print(f"mix: {I:.1f} LUFS, true peak {tp:.1f} dBTP, {DURATION:.2f} s, song offset {SONG_OFFSET:.3f} s")


def edl():
    data = {"segments": timeline(), "final_cut": FINAL_CUT, "approved_final": APPROVED_FINAL,
            "duration": DURATION, "song_offset": round(SONG_OFFSET, 4), "fps": FPS}
    (ROOT / "project" / "reel_edl.js").write_text("window.REEL=" + json.dumps(data, indent=1) + ";\n")
    for s in data["segments"]:
        print(f"{s['t0']:6.2f}-{s['t1']:6.2f}  src {s['src0']:5.2f}-{s['src1']:5.2f}  {s['who']}")
    print("duration", DURATION)


if __name__ == "__main__":
    what = sys.argv[1:] or ["frames", "audio"]
    edl()
    if "frames" in what:
        frames()
    if "audio" in what:
        audio()
