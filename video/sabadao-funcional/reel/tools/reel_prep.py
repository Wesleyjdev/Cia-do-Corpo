"""Prepare the Sabadão Funcional reel (talking-head edit of IMG_1688.MOV).

1. frames: HLG/HDR iPhone footage -> SDR (mobius tone map, light warm
   grade), every source frame saved once as high-quality JPEG (decoded
   straight from the camera file, no intermediate re-encode).
2. reel_edl.js (window.REEL): audio/video segments, shots (framing),
   transitions, info chips and every event in reel time. All timings are
   written in SOURCE seconds here and mapped through the EDL, so a change
   in the cuts keeps captions, chips and effects in sync.
3. audio: voice cut only inside pauses (pauses shortened to ~120-180 ms,
   never removed whole), 40 ms equal-power crossfades on zero crossings,
   synthetic tails where the camera file itself clips a word, continuous
   room-tone bed (~-45 dBFS); gentle voice chain at ~-16 LUFS; the song
   placed so the final art lands on the approved beat, ducked under the
   voice with a slow release; synthesized SFX layer (leaf whooshes, whips,
   swells, chip pops/ticks, keyword ticks, riser, sub hit, shimmer); master
   at -14 LUFS integrated, true peak < -1 dBTP. Writes reel/work/cues.csv.

Usage: python3 reel/tools/reel_prep.py [frames] [audio]   (default: both)
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from scipy import signal

ROOT = Path(__file__).resolve().parents[2]            # video/sabadao-funcional
SRC = ROOT / "project" / "assets" / "src"
RAW = SRC / "IMG_1688.MOV"
SONG = SRC / "toca_o_trompete.mp3"
FRAMES = ROOT / "project" / "reel_src"
WORK = ROOT / "reel" / "work"
FPS = 30
SR = 48000
rng = np.random.default_rng(7)

TONEMAP = ("zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,"
           "tonemap=mobius:param=0.4:desat=0,zscale=t=bt709:m=bt709:r=tv,"
           "eq=contrast=1.05:saturation=1.04:gamma=1.02,"
           "colorbalance=rm=0.02:bm=-0.03")

# ---------------------------------------------------------------- EDL (source seconds)
# Joins sit inside pauses only. Pauses kept at ~120-180 ms; the phrase
# "mais precisamente" (10.65-11.38) is the only speech removed.
SEGMENTS = [
    (0.04, 6.38),    # ele "E aí ... de verdade?" + ela "Então prepara aí ... manhã,"
    (6.50, 7.57),    # ela "temos um encontro marcado."  (pause 6.30-6.58 -> 0.16 s)
    (7.68, 10.61),   # ele "É o Funcional ... Casa Caiada,"  (pause 7.49-7.76 -> 0.16 s)
    (11.60, 12.40),  # ele "na praia do Quartel."  ("mais precisamente" removed)
    (12.56, 19.44),  # ela "Então chama a galera ... recepção."
    (19.60, 21.56),  # os dois "Esperando vocês. Bora treinar!"
]
# the camera file itself clips these word endings (digital silence right after)
CLIPPED_TAILS = [12.322, 19.362, 21.445]
# shots: clean video ranges (dissolves of the raw file excluded)
SHOTS = [
    {"who": "ele", "a": 0.00, "b": 2.53, "drift": 0.010},
    {"who": "ela", "a": 3.20, "b": 7.03, "drift": 0.010, "punch": 4.30},       # "24 de outubro"
    {"who": "ele", "a": 7.33, "b": 10.61, "drift": 0.010},
    {"who": "ele", "a": 11.60, "b": 12.43, "drift": 0.008, "base": 1.05},     # reframe on the jump cut
    {"who": "ela", "a": 12.80, "b": 19.43, "drift": 0.005, "punch": 16.36},   # "ingresso"
    {"who": "dois", "a": 19.73, "b": 21.70, "drift": 0.010},
]
KEYWORDS = [4.30, 8.02, 12.12, 16.36, 20.90]       # 24 de outubro, Funcional, Quartel, ingresso, Bora treinar
FINAL_SRC = 21.50                                   # leaves fully cover -> final art
APPROVED_FINAL = 8.4640                             # same instant in the approved 15 s video
CLIP15_IN_SONG = 64.579                             # the approved 15 s music starts here in the song
FINAL_LEN = 15.34 - APPROVED_FINAL                  # approved final + 0.34 s -> 4.0 s hold


def timeline():
    t, out = 0.0, []
    for a, b in SEGMENTS:
        out.append({"t0": round(t, 4), "t1": round(t + b - a, 4), "src0": a, "src1": b})
        t += b - a
    return out


SEG = timeline()


def r(src):
    """source time -> reel time (a time inside a removed gap maps to the join)."""
    for s in SEG:
        if src <= s["src1"]:
            return s["t0"] + max(0.0, src - s["src0"])
    return SEG[-1]["t1"]


FINAL_CUT = round(r(FINAL_SRC), 4)
DURATION = round(FINAL_CUT + FINAL_LEN, 4)
SONG_OFFSET = CLIP15_IN_SONG + APPROVED_FINAL - FINAL_CUT
JOINS = [SEG[i]["t1"] for i in range(len(SEG) - 1)]


def events():
    tr = [
        {"kind": "whip", "t0": r(2.53), "tc": r(2.92), "t1": r(3.20), "dir": -1},
        {"kind": "leaf", "t0": JOINS[1] - 0.42, "tc": JOINS[1], "t1": JOINS[1] + 0.38, "dir": 1},
        {"kind": "whip", "t0": JOINS[3] - 0.12, "tc": JOINS[3], "t1": r(12.80), "dir": 1},
        {"kind": "whip", "t0": JOINS[4] - 0.12, "tc": JOINS[4], "t1": r(19.73), "dir": -1},
        {"kind": "final", "t0": FINAL_CUT - 0.30, "tc": FINAL_CUT, "t1": FINAL_CUT + 0.52, "dir": -1},
    ]
    # info chips: >= 1.6 s on screen, while spoken + 0.5 s, 250 ms in / 300 ms out,
    # never starting or ending on a cut or inside a transition
    leaf0 = tr[1]["t0"]
    chips = [
        {"txt": "24 DE OUTUBRO", "icon": "cal", "row": 0, "in": r(4.55), "out": leaf0 - 0.04},
        {"txt": "ÀS 07H", "icon": "clock", "row": 1, "in": r(5.38), "out": leaf0 - 0.04},
        {"txt": "PRAIA DE CASA CAIADA", "icon": "pin", "row": 0, "in": r(9.94), "out": r(11.90) + 1.70},
        {"txt": "EM FRENTE AO QUARTEL", "icon": "pin", "row": 1, "in": r(11.90), "out": r(11.90) + 1.70},
    ]
    cuts = JOINS + [x["tc"] for x in tr]
    for c in chips:
        assert c["out"] - c["in"] >= 1.6 - 1e-6, (c["txt"], c["out"] - c["in"])
        for edge in (c["in"], c["out"]):
            assert all(abs(edge - k) > 0.08 for k in cuts), (c["txt"], edge)
            assert not any(x["t0"] - 0.02 < edge < x["t1"] for x in tr), (c["txt"], edge)
    shots = [dict(s, ra=r(s["a"]), rb=r(s["b"])) for s in SHOTS]
    for s in shots:
        if "punch" in s:
            s["rpunch"] = r(s["punch"])
    return tr, chips, shots


def frames():
    FRAMES.mkdir(parents=True, exist_ok=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(RAW), "-vf", TONEMAP + ",format=yuvj444p",
                    "-q:v", "2", "-start_number", "0", str(FRAMES / "%04d.jpg")], check=True)
    print("frames:", len(list(FRAMES.glob("*.jpg"))))


# ---------------------------------------------------------------- audio helpers
def decode(path, ss=None, t=None, ch=2):
    cmd = ["ffmpeg", "-v", "error"]
    if ss is not None:
        cmd += ["-ss", f"{ss:.4f}"]
    cmd += ["-i", str(path)]
    if t is not None:
        cmd += ["-t", f"{t:.4f}"]
    cmd += ["-ac", str(ch), "-ar", str(SR), "-f", "f32le", "-"]
    raw = subprocess.run(cmd, check=True, capture_output=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, ch).astype(np.float64)


def write_wav(path, x):
    x = np.asarray(x, np.float32)
    if x.ndim == 1:
        x = x[:, None]
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", str(x.shape[1]),
                    "-i", "-", str(path)], input=x.tobytes(), check=True)


def loudness(path):
    out = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(path), "-af", "ebur128=peak=true",
                          "-f", "null", "-"], capture_output=True, text=True).stderr
    tail = out[out.rfind("Summary:"):]
    return float(tail.split("I:")[1].split("LUFS")[0]), float(tail.split("Peak:")[1].split("dBFS")[0])


def zero_cross(x, i, w=144):
    """index of the zero crossing nearest to i (within +-3 ms)."""
    a, b = max(1, i - w), min(len(x) - 1, i + w)
    z = np.where(np.signbit(x[a - 1:b - 1]) != np.signbit(x[a:b]))[0]
    return a + z[np.argmin(np.abs(z + a - i))] if len(z) else i


def db(x):
    return 20 * np.log10(np.maximum(x, 1e-9))


def smooth_env(target_db, attack, release, rate=100):
    """one-pole smoothing of a dB curve (attack when going down, release when going up)."""
    a_dn, a_up = np.exp(-1 / (attack * rate)), np.exp(-1 / (release * rate))
    g = np.empty_like(target_db)
    cur = target_db[0]
    for i, tv in enumerate(target_db):
        k = a_dn if tv < cur else a_up
        cur = tv + (cur - tv) * k
        g[i] = cur
    return g


# ---------------------------------------------------------------- voice
def build_voice(n):
    raw = decode(RAW, ch=1)[:, 0]
    xf = int(0.040 * SR)
    out = np.zeros(n + xf)
    # synthetic tails where the camera file clips a word: last ~25 ms of the
    # word through a short decaying diffuse tail (~120 ms), very low level
    tails = {}
    for tc in CLIPPED_TAILS:
        i = int(tc * SR)
        grain = raw[i - int(0.025 * SR): i] * np.hanning(int(0.025 * SR) * 2)[int(0.025 * SR):]
        ir_len = int(0.14 * SR)
        ir = rng.standard_normal(ir_len) * np.exp(-np.arange(ir_len) / (0.035 * SR))
        ir = signal.sosfilt(signal.butter(2, [300, 5000], "bandpass", fs=SR, output="sos"), ir)
        tail = np.convolve(grain, ir)[: ir_len]
        tail *= np.max(np.abs(grain)) * 0.55 / (np.max(np.abs(tail)) + 1e-9)
        tail *= np.linspace(1, 0, len(tail)) ** 1.5
        tails[i] = tail
    src = raw.copy()
    for i, tail in tails.items():
        seg = src[i: i + len(tail)]
        src[i: i + len(tail)] = seg + tail[: len(seg)]
    ramp = np.sin(np.linspace(0, np.pi / 2, xf)) ** 2
    for k, s in enumerate(SEG):
        a = zero_cross(src, int(s["src0"] * SR)) - xf // 2
        b = zero_cross(src, int(s["src1"] * SR)) + xf // 2
        piece = src[a:b].copy()
        if k > 0:
            piece[:xf] *= ramp
        if k < len(SEG) - 1:
            piece[-xf:] *= ramp[::-1]
        else:
            piece[-int(0.06 * SR):] *= np.linspace(1, 0, int(0.06 * SR))
        o = int(s["t0"] * SR) - (xf // 2 if k > 0 else 0)
        o = max(0, o)
        out[o: o + len(piece)] += piece[: len(out) - o]
    return out[:n]


def room_tone(n):
    """continuous bed from the file's own pauses, ~-45 dBFS RMS."""
    raw = decode(RAW, ch=1)[:, 0]
    spans = [(2.87, 2.99), (6.32, 6.56), (7.50, 7.74), (11.40, 11.58), (0.03, 0.14)]
    grains = [raw[int(a * SR): int(b * SR)] for a, b in spans]
    gl = int(0.08 * SR)
    hop = gl // 2
    win = np.hanning(gl)
    bed = np.zeros(n + gl)
    pos = 0
    while pos < n:
        g = grains[rng.integers(len(grains))]
        st = rng.integers(0, len(g) - gl)
        bed[pos: pos + gl] += g[st: st + gl] * win
        pos += hop
    bed = bed[:n]
    bed -= np.mean(bed)
    rms = np.sqrt(np.mean(bed ** 2))
    return bed * (10 ** (-45 / 20) / rms)


# ---------------------------------------------------------------- SFX synthesis
def stft_sweep(dur, f0, f1, bw=0.6, env=None, fmid=None):
    """noise whose spectral centre sweeps f0 -> (fmid) -> f1 (log), Gaussian band of bw octaves."""
    n = int(dur * SR)
    x = rng.standard_normal(n + 2048)
    f, t, Z = signal.stft(x, SR, nperseg=1024)
    tt = np.clip(t / dur, 0, 1)
    if fmid is None:
        fc = np.exp(np.log(f0) + (np.log(f1) - np.log(f0)) * tt)
    else:
        fc = np.where(tt < 0.5, np.exp(np.log(f0) + (np.log(fmid) - np.log(f0)) * tt * 2),
                      np.exp(np.log(fmid) + (np.log(f1) - np.log(fmid)) * (tt - 0.5) * 2))
    oct_ = np.log2(np.maximum(f[:, None], 1) / fc[None, :])
    Z *= np.exp(-0.5 * (oct_ / bw) ** 2)
    _, y = signal.istft(Z, SR, nperseg=1024)
    y = y[:n]
    if env is not None:
        y *= env
    return y / (np.max(np.abs(y)) + 1e-9)


def env_peak(n, peak_at, attack_pow=2.0, release_pow=1.6):
    t = np.linspace(0, 1, n)
    e = np.where(t < peak_at, (t / peak_at) ** attack_pow, ((1 - t) / (1 - peak_at)) ** release_pow)
    return e


def pan_lr(mono, p_from, p_to):
    p = np.linspace(p_from, p_to, len(mono))
    th = (p + 1) * np.pi / 4
    return np.stack([mono * np.cos(th), mono * np.sin(th)], 1)


def short_verb(x, t=0.25, wet=0.18):
    n = int(t * SR)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / (t * SR / 5))
    ir /= np.sqrt(np.sum(ir ** 2))
    if x.ndim == 1:
        return x + wet * np.convolve(x, ir)[: len(x)]
    return np.stack([x[:, c] + wet * np.convolve(x[:, c], ir)[: len(x)] for c in range(2)], 1)


def sfx_leaf(dur=0.8, peak=0.55, dirn=1):
    n = int(dur * SR)
    e = env_peak(n, peak)
    air = stft_sweep(dur, 500, 900, bw=0.9, env=e, fmid=3200)
    # foliage: sparse filtered grains whose density follows the envelope
    cr = np.zeros(n)
    k = int(0.004 * SR)
    for i in range(0, n - k, 60):
        if rng.random() < 0.25 * e[i] ** 1.5:
            cr[i: i + k] += rng.standard_normal(k) * np.exp(-np.arange(k) / (0.0012 * SR)) * rng.uniform(0.4, 1)
    cr = signal.sosfilt(signal.butter(2, [1800, 7500], "bandpass", fs=SR, output="sos"), cr)
    cr /= np.max(np.abs(cr)) + 1e-9
    mono = 0.75 * air + 0.45 * cr * e
    return short_verb(pan_lr(mono / np.max(np.abs(mono)), -0.7 * dirn, 0.7 * dirn), 0.3, 0.15)


def sfx_whip(dur=0.26, dirn=1):
    n = int(dur * SR)
    e = env_peak(n, 0.55, 2.4, 2.0)
    mono = stft_sweep(dur, 700, 1600, bw=0.7, env=e, fmid=4200)
    return short_verb(pan_lr(mono, -0.8 * dirn, 0.8 * dirn), 0.2, 0.12)


def sfx_swell(dur=0.42):
    n = int(dur * SR)
    e = env_peak(n, 0.75, 2.0, 1.2)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * (180 * t + 120 * t ** 2)) * 0.5
    air = stft_sweep(dur, 400, 1400, bw=0.8)
    mono = (tone + 0.6 * air) * e
    mono /= np.max(np.abs(mono))
    return short_verb(np.stack([mono, mono], 1), 0.3, 0.2)


def sfx_pop():
    n = int(0.09 * SR)
    t = np.arange(n) / SR
    f = 620 + 480 * (1 - np.exp(-t / 0.012))
    ph = 2 * np.pi * np.cumsum(f) / SR
    e = (1 - np.exp(-t / 0.003)) * np.exp(-t / 0.028)
    mono = np.sin(ph) * e + 0.25 * np.sin(2 * ph) * e
    mono /= np.max(np.abs(mono))
    return short_verb(np.stack([mono, mono], 1), 0.18, 0.15)


def sfx_tick(freq=2600, decay=0.010, length=0.05):
    n = int(length * SR)
    t = np.arange(n) / SR
    mono = np.sin(2 * np.pi * freq * t) * np.exp(-t / decay) * (1 - np.exp(-t / 0.0008))
    mono /= np.max(np.abs(mono))
    return short_verb(np.stack([mono, mono], 1), 0.15, 0.12)


def sfx_riser(dur=1.0):
    n = int(dur * SR)
    t = np.linspace(0, 1, n)
    e = t ** 2.2
    air = stft_sweep(dur, 300, 6000, bw=0.7, env=e)
    f = 140 * 2 ** (3 * t)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * e
    mono = 0.7 * air + 0.35 * tone
    mono *= np.minimum(1, (1 - t) / 0.03 + 0.0)        # tiny release so it hands over cleanly
    mono /= np.max(np.abs(mono))
    return short_verb(pan_lr(mono, 0.3, -0.3), 0.35, 0.18)


def sfx_hit(dur=0.7):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 46 + 34 * np.exp(-t / 0.05)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.18) * (1 - np.exp(-t / 0.002))
    click = signal.sosfilt(signal.butter(2, 3000, "lowpass", fs=SR, output="sos"),
                           rng.standard_normal(n)) * np.exp(-t / 0.006) * 0.35
    mono = body + click
    mono /= np.max(np.abs(mono))
    return short_verb(np.stack([mono, mono], 1), 0.4, 0.12)


def sfx_shimmer(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros((n, 2))
    for k, fq in enumerate([2093, 2637, 3136, 4186, 5274]):
        d = int(k * 0.035 * SR)
        e = np.zeros(n)
        e[d:] = np.exp(-(t[: n - d]) / 0.22) * (1 - np.exp(-t[: n - d] / 0.004))
        tone = np.sin(2 * np.pi * fq * t + rng.uniform(0, 6)) * e
        p = -0.6 + 1.2 * k / 4
        out[:, 0] += tone * np.cos((p + 1) * np.pi / 4)
        out[:, 1] += tone * np.sin((p + 1) * np.pi / 4)
    out /= np.max(np.abs(out))
    return short_verb(out, 0.5, 0.3)


def cue_list(tr, chips, shots):
    """(reel time of the sound's START, name, generator, peak dBFS, peak offset s, note)."""
    cues = []
    for x in tr:
        if x["kind"] == "whip":
            s = sfx_whip(0.26, -x["dir"])
            cues.append((x["tc"] - 0.143, "whip pan", s, -24, 0.143, "whoosh curto, pan segue o movimento"))
        if x["kind"] == "leaf":
            s = sfx_leaf(0.8, 0.55, x["dir"])
            cues.append((x["tc"] - 0.44, "folhas (cobertura)", s, -21, 0.44, "whoosh de folhagem, pico na tela 100% coberta"))
        if x["kind"] == "final":
            cues.append((x["tc"] - 1.0, "riser", sfx_riser(1.0), -19, 0.97, "sobe 1 s ate a cobertura"))
            s = sfx_leaf(0.8, 0.55, x["dir"])
            cues.append((x["tc"] - 0.44, "folhas (cobertura final)", s, -20, 0.44, "pico na cobertura total"))
            cues.append((x["tc"] + 0.12, "impacto grave", sfx_hit(0.7), -13, 0.01, "sub hit na revelacao da arte"))
            cues.append((x["tc"] + 0.42, "brilho do logo", sfx_shimmer(0.9), -26, 0.02, "quando o logo aterrissa"))
    for s in shots:
        if "rpunch" in s:
            cues.append((s["rpunch"] - 0.30, "swell (punch-in)", sfx_swell(0.42), -27, 0.31, "zoom de enfase ate 110%"))
    for c in chips:
        cues.append((c["in"], f"chip entra: {c['txt']}", sfx_pop(), -27, 0.03, "pop suave"))
        cues.append((c["out"] - 0.30, f"chip sai: {c['txt']}", sfx_tick(2200, 0.012), -32, 0.004, "tick leve"))
    for k in KEYWORDS:
        cues.append((r(k), "destaque de palavra", sfx_tick(3400, 0.007, 0.04), -34, 0.003, "micro-tick"))
    return cues


# ---------------------------------------------------------------- mix
def audio(tr, chips, shots):
    WORK.mkdir(parents=True, exist_ok=True)
    n = int(DURATION * SR)
    voice = build_voice(n)
    write_wav(WORK / "voice_cut.wav", voice)
    # gentle, natural chain (no de-esser, light denoise and compression)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(WORK / "voice_cut.wav"), "-af",
                    "highpass=f=80,afftdn=nr=5:nf=-32,equalizer=f=250:t=q:w=1.2:g=-1.5,"
                    "equalizer=f=3200:t=q:w=1.0:g=2,"
                    "acompressor=threshold=-22dB:ratio=2:attack=10:release=150,"
                    "loudnorm=I=-16:TP=-2:LRA=8", "-ar", str(SR), "-ac", "2",
                    str(WORK / "voice.wav")], check=True)
    v = decode(WORK / "voice.wav")
    v = np.concatenate([v, np.zeros((max(0, n - len(v)), 2))])[:n]
    bed = room_tone(n)
    v += np.stack([bed, bed], 1) * np.clip((FINAL_CUT + 0.4 - np.arange(n) / SR) / 0.4, 0, 1)[:, None]

    # voice activity (10 ms) for ducking
    hop = SR // 100
    env = np.sqrt(np.convolve(v[:, 0] ** 2, np.ones(hop) / hop, "same"))[::hop]
    d = db(env)
    active = d > (np.percentile(d[d > -90], 90) - 24)
    act = active.copy()
    gap = 0
    for i in range(len(act)):
        if active[i]:
            if 0 < gap < 25:
                act[i - gap:i] = True
            gap = 0
        else:
            gap += 1
    final_i = int(FINAL_CUT * 100) - 25

    # music: -20 dB under speech, -10 dB in pauses, full on the final; slow
    # release (0.9 s) so the music does not pump between words
    m = decode(SONG, ss=SONG_OFFSET, t=DURATION)
    m = np.concatenate([m, np.zeros((max(0, n - len(m)), 2))])[:n]
    write_wav(WORK / "music_raw.wav", m)
    I_m, _ = loudness(WORK / "music_raw.wav")
    m *= 10 ** ((-14 - I_m) / 20)
    tgt = np.where(act, -20.0, -10.0)
    tgt[final_i:] = 0.0
    g = smooth_env(tgt, 0.12, 0.9)
    gain = 10 ** (np.interp(np.arange(n) / SR, np.arange(len(g)) / 100, g) / 20)
    fade = np.clip((DURATION - np.arange(n) / SR) / 0.8, 0, 1)
    music = m * (gain * fade)[:, None]

    # SFX bus, ducked 6 dB under speech with the same slow release
    sfx = np.zeros((n, 2))
    cues = cue_list(tr, chips, shots)
    rows = []
    for t0, name, snd, peak_db, pk_off, note in cues:
        snd = snd / (np.max(np.abs(snd)) + 1e-9) * 10 ** (peak_db / 20)
        i = int(round(t0 * SR))
        a, b = max(0, i), min(n, i + len(snd))
        if b > a:
            sfx[a:b] += snd[a - i: b - i]
        rows.append((t0 + pk_off, name, peak_db, note))
    sg = smooth_env(np.where(act, -6.0, 0.0), 0.12, 0.9)
    sgain = 10 ** (np.interp(np.arange(n) / SR, np.arange(len(sg)) / 100, sg) / 20)
    sfx *= sgain[:, None]

    mix = v + music + sfx
    write_wav(WORK / "mix_pre.wav", mix)
    I, _ = loudness(WORK / "mix_pre.wav")
    k = 10 ** ((-14 - I) / 20)
    write_wav(WORK / "mix_gain.wav", mix * k)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(WORK / "mix_gain.wav"), "-af",
                    "alimiter=limit=0.83:attack=3:release=60:level=disabled", "-ar", str(SR),
                    str(WORK / "mix.wav")], check=True)
    I, tp = loudness(WORK / "mix.wav")

    # cue sheet (levels as they land in the master) + voice vs SFX peak check
    def peak_in(x, t, w=0.06):
        a, b = int(max(0, t - w) * SR), int(min(DURATION, t + w) * SR)
        return db(np.max(np.abs(x[a:b])) * k + 1e-12)
    vpk = [peak_in(v, t) for t in np.arange(0.2, FINAL_CUT - 0.2, 0.25)]
    v_peak = np.percentile(vpk, 90)
    lines = ["timestamp_s,evento,som,pico_no_master_dBFS,nota"]
    for t, name, pdb, note in sorted(rows):
        lvl = peak_in(sfx, t, 0.05)
        lines.append(f"{t:.2f},{name},{'sintetizado'},{lvl:.1f},{note}")
    (WORK / "cues.csv").write_text("\n".join(lines) + "\n", encoding="utf-8")
    speech_sfx = [peak_in(sfx, t, 0.05) for t, *_ in rows if t < FINAL_CUT - 0.5]
    print(f"mix: {I:.1f} LUFS, true peak {tp:.1f} dBTP, {DURATION:.2f} s, song offset {SONG_OFFSET:.3f} s")
    print(f"voice peaks (p90) {v_peak:.1f} dBFS, loudest SFX under speech {max(speech_sfx):.1f} dBFS "
          f"-> margin {v_peak - max(speech_sfx):.1f} dB")


def write_edl(tr, chips, shots):
    data = {"segments": SEG, "final_cut": FINAL_CUT, "approved_final": APPROVED_FINAL,
            "duration": DURATION, "song_offset": round(SONG_OFFSET, 4), "fps": FPS,
            "transitions": tr, "chips": chips, "shots": shots}
    (ROOT / "project" / "reel_edl.js").write_text("window.REEL=" + json.dumps(data, indent=1, ensure_ascii=False)
                                                   + ";\n", encoding="utf-8")
    for s in SEG:
        print(f"{s['t0']:6.2f}-{s['t1']:6.2f}  src {s['src0']:5.2f}-{s['src1']:5.2f}")
    for c in chips:
        print(f"chip {c['txt']:22s} {c['in']:6.2f}-{c['out']:6.2f}  ({c['out'] - c['in']:.2f} s)")
    print("final cut", FINAL_CUT, "duration", DURATION)


if __name__ == "__main__":
    what = sys.argv[1:] or ["frames", "audio"]
    tr, chips, shots = events()
    write_edl(tr, chips, shots)
    if "frames" in what:
        frames()
    if "audio" in what:
        audio(tr, chips, shots)
