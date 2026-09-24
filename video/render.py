"""Render the branded "Semana do Cliente" reel for Cia do Corpo Gym.

Pipeline: HLG/HDR iPhone footage -> SDR tone map + colour grade (ffmpeg)
          + animated RGBA overlay generated here (piped as raw frames)
          -> H.264 1080x1920 MP4 ready for Instagram/WhatsApp.

Usage: python3 render.py <input.MOV> <output.mp4>
"""
import math
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent
FONTS = HERE / "assets" / "fonts"
LOGO = Image.open(HERE / "assets" / "logo_cia_do_corpo.png").convert("RGBA")

W, H, FPS = 1080, 1920, 30
CUT = 9.30          # footage -> end card
DUR = 11.0          # total length

# Brand palette
ORANGE = (243, 112, 33)
ORANGE_DK = (206, 84, 14)
WHITE = (255, 255, 255)
GRAPHITE = (28, 28, 30)
GRAY = (160, 160, 165)

DISCLAIMER = ("Planos anuais no cartão de crédito, contratação convencional em 11x.",
              "Não válido para planos recorrentes e Cia do Corpo Concept.")


def font(weight, size):
    return ImageFont.truetype(str(FONTS / f"Montserrat-{weight}.ttf"), size)


F_HEAD = font("900i", 104)
F_HEAD_S = font("900i", 84)
F_TAG = font("800n", 44)
F_PRICE = font("900i", 210)
F_RS = font("900i", 64)
F_PLAN_S = font("700n", 30)
F_PLAN = font("900i", 48)
F_TAXA = font("900i", 50)
F_DISC = font("500n", 22)
F_END_1 = font("900i", 70)
F_END_2 = font("700n", 42)
F_END_3 = font("600n", 34)


# ---------------------------------------------------------------- easing
def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def prog(t, start, dur):
    return clamp((t - start) / dur)


def ease_out(x):
    return 1 - (1 - x) ** 3


def ease_in(x):
    return x ** 3


def back_out(x, s=1.9):
    x -= 1
    return x * x * ((s + 1) * x + s) + 1


# ---------------------------------------------------------------- helpers
def text_size(f, s):
    l, t, r, b = f.getbbox(s)
    return r - l, b - t, l, t


def tag(text, f, fg, bg, pad=(26, 16)):
    """Solid label block with text, returned as an RGBA image."""
    tw, th, ox, oy = text_size(f, text)
    im = Image.new("RGBA", (tw + pad[0] * 2, th + pad[1] * 2), bg + (255,))
    ImageDraw.Draw(im).text((pad[0] - ox, pad[1] - oy), text, font=f, fill=fg)
    return im


def reveal(canvas, im, x, y, p, alpha=1.0):
    """Wipe an element in from the left (p: 0..1) with a leading orange edge."""
    if p <= 0 or alpha <= 0:
        return
    w = int(im.width * ease_out(p))
    if w <= 0:
        return
    part = im.crop((0, 0, w, im.height))
    if alpha < 1:
        part.putalpha(part.getchannel("A").point(lambda v: int(v * alpha)))
    canvas.alpha_composite(part, (int(x), int(y)))
    if p < 1:
        edge = Image.new("RGBA", (10, im.height), ORANGE + (int(255 * alpha),))
        canvas.alpha_composite(edge, (int(x) + w - 5, int(y)))


def paste_scaled(canvas, im, cx, cy, scale, alpha=1.0):
    if scale <= 0.01 or alpha <= 0:
        return
    s = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.LANCZOS)
    if alpha < 1:
        s.putalpha(s.getchannel("A").point(lambda v: int(v * alpha)))
    canvas.alpha_composite(s, (int(cx - s.width / 2), int(cy - s.height / 2)))


def exit_slide(t, start, dur=0.28):
    """Offset (px) + alpha for elements leaving to the left."""
    p = ease_in(prog(t, start, dur))
    return -900 * p, 1 - p


# ---------------------------------------------------------------- static assets
IM_SEMANA = tag("SEMANA", F_HEAD_S, WHITE, GRAPHITE, pad=(30, 18))
IM_CLIENTE = tag("DO CLIENTE", F_HEAD, WHITE, ORANGE, pad=(32, 22))
IM_MENS = tag("1ª MENSALIDADE", F_TAG, WHITE, GRAPHITE, pad=(24, 14))


def build_price():
    rw, rh, rox, roy = text_size(F_RS, "R$")
    pw, ph, pox, poy = text_size(F_PRICE, "9,99")
    pad_x, pad_y, gap = 30, 30, 12
    w, h = pad_x * 2 + rw + gap + pw, pad_y * 2 + ph
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, w, h), fill=ORANGE)
    d.rectangle((0, h - 12, w, h), fill=ORANGE_DK)  # depth strip
    d.text((pad_x - rox, pad_y - roy + 12), "R$", font=F_RS, fill=WHITE)
    d.text((pad_x + rw + gap - pox, pad_y - poy), "9,99", font=F_PRICE, fill=WHITE)
    return im


IM_PRICE = build_price()


def build_plans():
    a, b = "NOS PLANOS", "PLUS E VIP"
    aw, ah, aox, aoy = text_size(F_PLAN_S, a)
    bw, bh, box, boy = text_size(F_PLAN, b)
    w, h = max(aw, bw) + 8, ah + 14 + bh + 8
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for dx, dy in ((3, 3),):  # soft shadow for legibility on bright walls
        d.text((dx - aox, dy - aoy), a, font=F_PLAN_S, fill=(0, 0, 0, 150))
        d.text((dx - box, ah + 14 + dy - boy), b, font=F_PLAN, fill=(0, 0, 0, 150))
    d.text((-aox, -aoy), a, font=F_PLAN_S, fill=WHITE)
    d.text((-box, ah + 14 - boy), b, font=F_PLAN, fill=WHITE)
    # orange underline under PLUS E VIP
    d.rectangle((0, h - 8, bw, h), fill=ORANGE)
    return im


IM_PLANS = build_plans()


def build_taxa():
    a, b = "SEM TAXA", " DE MATRÍCULA"
    aw, ah, aox, aoy = text_size(F_TAXA, a)
    bw, bh, box, boy = text_size(F_TAXA, b)
    icon = 58
    pad_x, pad_y = 22, 18
    w = pad_x + icon + 18 + aw + bw + pad_x + 10
    h = max(ah, bh, icon) + pad_y * 2
    im = Image.new("RGBA", (w, h), WHITE + (255,))
    d = ImageDraw.Draw(im)
    # check badge
    cy = h // 2
    d.ellipse((pad_x, cy - icon // 2, pad_x + icon, cy + icon // 2), fill=ORANGE)
    d.line([(pad_x + 15, cy + 1), (pad_x + 25, cy + 12), (pad_x + 44, cy - 12)], fill=WHITE, width=8, joint="curve")
    x = pad_x + icon + 18
    d.text((x - aox, (h - ah) // 2 - aoy), a, font=F_TAXA, fill=ORANGE)
    d.text((x + aw - box, (h - ah) // 2 - aoy), b, font=F_TAXA, fill=GRAPHITE)
    return im


IM_TAXA = build_taxa()


def build_disclaimer():
    band_h = 118
    im = Image.new("RGBA", (W, band_h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, W, band_h), fill=GRAPHITE + (205,))
    d.rectangle((0, 0, W, 5), fill=ORANGE)
    icon = LOGO.crop((0, 0, LOGO.width, int(LOGO.height * 0.60)))
    icon = icon.crop(icon.getbbox())
    icon = icon.resize((int(icon.width * 70 / icon.height), 70), Image.LANCZOS)
    im.alpha_composite(icon, (44, 5 + (band_h - 5 - 70) // 2))
    tx = 44 + icon.width + 26
    y = 36
    for line in DISCLAIMER:
        d.text((tx, y), line, font=F_DISC, fill=(235, 235, 235))
        y += 32
    return im


IM_DISC = build_disclaimer()
DISC_Y = 1672

END_LOGO = LOGO.resize((int(LOGO.width * 520 / LOGO.width), int(LOGO.height * 520 / LOGO.width)), Image.LANCZOS)


def build_end_bg():
    """Graphite background with a soft orange glow and brand diagonals."""
    bg = Image.new("RGBA", (W, H), GRAPHITE + (255,))
    glow = Image.new("L", (W // 4, H // 4), 0)
    gd = ImageDraw.Draw(glow)
    cx, cy = W // 8, H // 8 - 30
    for r in range(260, 0, -4):
        gd.ellipse((cx - r, cy - r, cx + r, cy + r), fill=int(70 * (1 - r / 260) ** 1.6))
    glow = glow.resize((W, H), Image.BICUBIC)
    layer = Image.new("RGBA", (W, H), ORANGE + (0,))
    layer.putalpha(glow)
    bg.alpha_composite(layer)
    d = ImageDraw.Draw(bg)
    # diagonal accent stripes, bottom-left and top-right corners
    for i, (off, a) in enumerate(((0, 255), (60, 120))):
        d.polygon([(-40 + off, H), (220 + off, H), (-40 + off, H - 260)], fill=ORANGE + (a,))
        d.polygon([(W + 40 - off, 0), (W - 220 - off, 0), (W + 40 - off, 260)], fill=ORANGE + (a,))
    return bg


END_BG = build_end_bg()
IM_END_1 = tag("SEMANA DO CLIENTE", F_END_1, WHITE, ORANGE, pad=(30, 20))


def build_end_lines():
    lines = [("1ª mensalidade R$ 9,99", F_END_2, WHITE),
             ("Sem taxa de matrícula", F_END_2, ORANGE),
             ("Planos PLUS e VIP", F_END_3, GRAY)]
    sizes = [text_size(f, s) for s, f, _ in lines]
    w = max(s[0] for s in sizes) + 10
    h = sum(s[1] for s in sizes) + 22 * (len(lines) - 1) + 10
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    y = 0
    for (s, f, c), (tw, th, ox, oy) in zip(lines, sizes):
        d.text(((w - tw) // 2 - ox, y - oy), s, font=f, fill=c)
        y += th + 22
    return im


IM_END_LINES = build_end_lines()


# ---------------------------------------------------------------- timeline
X0 = 56          # left margin
T_HEAD, T_HEAD_OUT = 1.05, 2.95
T_OFFER = 3.05
T_PLANS = 4.60
T_TAXA = 6.10
T_WIPE = 8.95    # orange wipe into end card


def frame(t):
    c = Image.new("RGBA", (W, H), (0, 0, 0, 0))

    if t < CUT:
        # top progress bar
        pw = int(W * clamp(t / CUT))
        ImageDraw.Draw(c).rectangle((0, 0, pw, 9), fill=ORANGE)

        # --- act 1: SEMANA DO CLIENTE
        if T_HEAD <= t < T_HEAD_OUT + 0.3:
            dx, a = exit_slide(t, T_HEAD_OUT)
            y = 250
            reveal(c, IM_SEMANA, X0 + dx, y, prog(t, T_HEAD, 0.35), a)
            reveal(c, IM_CLIENTE, X0 + dx, y + IM_SEMANA.height + 10, prog(t, T_HEAD + 0.18, 0.40), a)

        # --- act 2: offer
        if t >= T_OFFER:
            dx, a = exit_slide(t, T_WIPE - 0.25, 0.25)
            y = 215
            reveal(c, IM_MENS, X0 + dx, y, prog(t, T_OFFER, 0.30), a)
            py = y + IM_MENS.height + 12
            s = back_out(prog(t, T_OFFER + 0.15, 0.40))
            paste_scaled(c, IM_PRICE, X0 + dx + IM_PRICE.width / 2, py + IM_PRICE.height / 2, s, a)
            # plans, to the right of the price block
            if t >= T_PLANS:
                pp = ease_out(prog(t, T_PLANS, 0.35))
                px = X0 + IM_PRICE.width + 22 + (1 - pp) * 60 + dx
                pim = IM_PLANS.copy()
                pim.putalpha(pim.getchannel("A").point(lambda v: int(v * pp * a)))
                c.alpha_composite(pim, (int(px), int(py + (IM_PRICE.height - IM_PLANS.height) / 2)))
            # sem taxa de matrícula
            if t >= T_TAXA:
                s = back_out(prog(t, T_TAXA, 0.38), 2.4)
                ty = py + IM_PRICE.height + 22
                paste_scaled(c, IM_TAXA, X0 + dx + IM_TAXA.width / 2, ty + IM_TAXA.height / 2, s, a)

        # --- legal band (whole footage section)
        p = ease_out(prog(t, 0.6, 0.4))
        if p > 0:
            c.alpha_composite(IM_DISC, (0, int(DISC_Y + (1 - p) * 140)))

        # --- transition wipe (orange sweep from left)
        if t >= T_WIPE:
            p = ease_in(prog(t, T_WIPE, CUT - T_WIPE))
            xw = int(-400 + p * (W + 800))
            d = ImageDraw.Draw(c)
            d.polygon([(xw - 900, 0), (xw, 0), (xw - 400, H), (xw - 1300, H)], fill=GRAPHITE + (255,))
            d.polygon([(xw - 180, 0), (xw + 60, 0), (xw - 340, H), (xw - 580, H)], fill=ORANGE + (255,))
        return c

    # --- end card
    te = t - CUT
    c.alpha_composite(END_BG)
    # orange sweep exiting to the right
    if te < 0.3:
        p = ease_out(te / 0.3)
        xw = int(W - 340 + p * 1200)
        ImageDraw.Draw(c).polygon([(xw - 180, 0), (xw + 60, 0), (xw - 340, H), (xw - 580, H)], fill=ORANGE + (255,))
    s = 0.85 + 0.15 * back_out(prog(te, 0.05, 0.5))
    a = ease_out(prog(te, 0.05, 0.35))
    paste_scaled(c, END_LOGO, W / 2, 760, s, a)
    reveal(c, IM_END_1, (W - IM_END_1.width) / 2, 1110, prog(te, 0.35, 0.35))
    p = ease_out(prog(te, 0.6, 0.35))
    if p > 0:
        im = IM_END_LINES.copy()
        im.putalpha(im.getchannel("A").point(lambda v: int(v * p)))
        c.alpha_composite(im, (int((W - im.width) / 2), int(1250 + (1 - p) * 30)))
    # small legal line on end card too
    d = ImageDraw.Draw(c)
    for i, line in enumerate(DISCLAIMER):
        tw = text_size(F_DISC, line)[0]
        d.text(((W - tw) / 2, 1700 + i * 32), line, font=F_DISC, fill=(150, 150, 155))
    # fade to black in the last 0.25s
    fo = prog(t, DUR - 0.25, 0.25)
    if fo > 0:
        c.alpha_composite(Image.new("RGBA", (W, H), (0, 0, 0, int(255 * fo))))
    return c


# ---------------------------------------------------------------- render
TONEMAP = ("zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,"
           "tonemap=mobius:param=0.4:desat=0,zscale=t=bt709:m=bt709:r=tv")
GRADE = ("colorbalance=rs=0.06:bs=-0.14:rm=0.05:bm=-0.12:gm=0.02:rh=0.03:bh=-0.06,"
         "eq=contrast=1.12:saturation=0.9:gamma=1.03,vignette=PI/6")


def sfx_graph():
    """Subtle whoosh on the transition and a soft hit on the price pop."""
    return (
        f"anoisesrc=d=0.6:c=pink:a=0.5,highpass=f=300,lowpass=f=3500,"
        f"afade=t=in:d=0.35,afade=t=out:st=0.35:d=0.25,volume=0.35,"
        f"adelay={int((T_WIPE - 0.05) * 1000)}|{int((T_WIPE - 0.05) * 1000)}[wh];"
        f"sine=f=90:d=0.25,afade=t=out:d=0.25,volume=0.5,"
        f"adelay={int((T_OFFER + 0.15) * 1000)}|{int((T_OFFER + 0.15) * 1000)}[hit]"
    )


def main(src, dst):
    n = int(DUR * FPS)
    fc = (
        f"[0:v]{TONEMAP},{GRADE},format=yuv420p,trim=0:{CUT},setpts=PTS-STARTPTS,"
        f"tpad=stop_mode=clone:stop_duration={DUR - CUT + 0.1},format=rgba[bg];"
        f"[bg][1:v]overlay=format=auto:shortest=1,format=yuv420p[v];"
        f"[0:a]atrim=0:{DUR},afade=t=out:st=9.55:d=0.4,apad[voice];"
        f"{sfx_graph()};"
        f"[voice][wh][hit]amix=inputs=3:normalize=0:duration=first,"
        f"atrim=0:{DUR},loudnorm=I=-14:TP=-1.5:LRA=11[a]"
    )
    cmd = [
        "ffmpeg", "-y", "-v", "error",
        "-i", src,
        "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
        "-filter_complex", fc, "-map", "[v]", "-map", "[a]",
        "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-profile:v", "high",
        "-pix_fmt", "yuv420p", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
        "-r", str(FPS), "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
        "-movflags", "+faststart", "-t", str(DUR), dst,
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for i in range(n):
        proc.stdin.write(frame(i / FPS).tobytes())
    proc.stdin.close()
    sys.exit(proc.wait())


if __name__ == "__main__":
    if len(sys.argv) == 3:
        main(sys.argv[1], sys.argv[2])
    else:  # preview frames: python3 render.py t1 t2 ...
        for t in map(float, sys.argv[1:]):
            frame(t).save(f"preview_{t:05.2f}.png")
