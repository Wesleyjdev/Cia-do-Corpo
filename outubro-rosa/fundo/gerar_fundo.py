"""Gera o fundo Outubro Rosa: rosa claro + colagem circular de pictogramas de saúde.

Estilo da referência: pictogramas profissionais, maioria sólidos e alguns vazados,
sobrepostos em camadas, em branco com transparência baixa, formando um grande círculo.
Ícones: Phosphor (MIT) e Tabler (MIT), em ./icones.

Saídas (SVG vetorial, editável):
  icones_transparente.svg   só a colagem, fundo transparente (1200x1200)
  fundo_feed_1080x1080.svg  rosa + colagem
  fundo_feed_1080x1350.svg
  fundo_story_1080x1920.svg
Os PNGs são exportados por render_png.js.
"""
import math
import random
import re
from pathlib import Path

HERE = Path(__file__).parent
ICONS_DIR = HERE / "icones"
random.seed(7)

# Paleta: um tom acima (mais claro) do rosa da referência
BG_TOP = "#F7B6CC"
BG_BOTTOM = "#F29BB9"
ICON = "#FFFFFF"
ICON_OPACITY = 0.26  # por ícone; sobreposições somam, como na referência

# Phosphor: nome -> peso relativo na colagem
PHOSPHOR = {
    "heart": 5, "flower": 5, "first-aid": 4, "plus": 3, "pill": 4, "drop": 3, "asterisk": 4,
    "flower-lotus": 2, "flower-tulip": 2, "sparkle": 2, "flask": 2, "stethoscope": 2,
    "hand-heart": 2, "gender-female": 2, "calendar-heart": 1, "heartbeat": 2, "butterfly": 2,
    "leaf": 2, "first-aid-kit": 2, "barbell": 1, "person-simple-tai-chi": 1, "shield-plus": 1,
    "drop-half": 1,
}
SOLID_SHARE = 0.62  # parcela de ícones sólidos; o resto vazado
# a versão sólida destes vira um bloco quadrado ou circular, então entram só vazados
OUTLINE_ONLY = {"plus", "asterisk", "gender-female", "calendar-heart", "shield-plus"}


def inner(svg_text):
    body = re.search(r"<svg[^>]*>(.*)</svg>", svg_text, re.S).group(1)
    return re.sub(r'<path stroke="none" d="M0 0h24v24H0z" fill="none"\s*/>', "", body).strip()


def load_library():
    lib = []  # (nome, sólido, markup normalizado em caixa 0..100, peso)
    for name, w in PHOSPHOR.items():
        for solid in ((False,) if name in OUTLINE_ONLY else (True, False)):
            f = ICONS_DIR / "phosphor" / (f"{name}-fill.svg" if solid else f"{name}.svg")
            g = f'<g transform="scale({100 / 256})" fill="{ICON}">{inner(f.read_text())}</g>'
            lib.append((name, solid, g, w))
    woman = inner((ICONS_DIR / "tabler" / "woman-filled.svg").read_text())
    lib.append(("mulher", True, f'<g transform="scale({100 / 24})" fill="{ICON}">{woman}</g>', 8))
    ribbon = re.search(r'd="(M7 21[^"]+)"', (ICONS_DIR / "tabler" / "ribbon-health.svg").read_text()).group(1)
    # laço sólido: faixa larga. O vazado usa a mesma faixa recortada por uma fina (máscara em icon_group)
    rib = (f'<g transform="scale({100 / 24})"><path d="{ribbon}" fill="none" stroke="{ICON}" '
           f'stroke-width="3.6" stroke-linejoin="round"/></g>')
    lib.append(("laco", True, rib, 6))
    lib.append(("laco", False, rib, 3))
    return lib, ribbon


LIB, RIBBON_D = load_library()


def pick():
    solid = random.random() < SOLID_SHARE
    pool = [item for item in LIB if item[1] == solid]
    r = random.uniform(0, sum(item[3] for item in pool))
    for item in pool:
        r -= item[3]
        if r <= 0:
            return item
    return pool[-1]


def pack(radius):
    """Colagem: grandes primeiro, depois médios e pequenos preenchendo, com sobreposição leve."""
    placed = []
    tiers = [(170, 210, 8), (115, 150, 30), (80, 105, 70), (54, 72, 120)]
    for lo, hi, n in tiers:
        got = tries = 0
        while got < n and tries < 40000:
            tries += 1
            size = random.uniform(lo, hi)
            ang = random.uniform(0, 2 * math.pi)
            r = radius * math.sqrt(random.random())
            x, y = r * math.cos(ang), r * math.sin(ang)
            if r + size * 0.35 > radius:
                continue
            if any(math.hypot(x - px, y - py) < (size + ps) * 0.36 for px, py, ps, *_ in placed):
                continue
            name, solid, g, _ = pick()
            placed.append((x, y, size, name, solid, g, random.uniform(-28, 28)))
            got += 1
    random.shuffle(placed)  # camadas misturadas
    return placed


CLUSTER = pack(radius=560)


def icon_group(i, x, y, size, name, solid, g, rot):
    tr = f'translate({x:.1f} {y:.1f}) rotate({rot:.1f}) scale({size / 100:.3f}) translate(-50 -50)'
    if name == "laco" and not solid:
        mask = (f'<mask id="m{i}" maskUnits="userSpaceOnUse" x="-20" y="-20" width="140" height="140">'
                f'<rect x="-20" y="-20" width="140" height="140" fill="#fff"/>'
                f'<g transform="scale({100 / 24})"><path d="{RIBBON_D}" fill="none" stroke="#000" '
                f'stroke-width="1.9" stroke-linejoin="round"/></g></mask>')
        g = f'{mask}<g mask="url(#m{i})">{g}</g>'
    return f'<g opacity="{ICON_OPACITY}" transform="{tr}">{g}</g>'


def cluster_svg(cx, cy, scale):
    items = "".join(icon_group(i, *c) for i, c in enumerate(CLUSTER))
    return f'<g id="colagem" transform="translate({cx} {cy}) scale({scale})">{items}</g>'


def doc(w, h, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
            f'{body}</svg>\n')


def background(w, h):
    return (f'<defs><linearGradient id="bg" x1="0" y1="0" x2="{w}" y2="{h}" gradientUnits="userSpaceOnUse">'
            f'<stop offset="0" stop-color="{BG_TOP}"/><stop offset="1" stop-color="{BG_BOTTOM}"/>'
            f'</linearGradient></defs><rect width="{w}" height="{h}" fill="url(#bg)"/>')


def main():
    (HERE / "icones_transparente.svg").write_text(doc(1200, 1200, cluster_svg(600, 600, 0.98)))
    for name, (w, h, scale) in {"fundo_feed_1080x1080": (1080, 1080, 0.98),
                                "fundo_feed_1080x1350": (1080, 1350, 1.0),
                                "fundo_story_1080x1920": (1080, 1920, 1.05)}.items():
        (HERE / f"{name}.svg").write_text(doc(w, h, background(w, h) + cluster_svg(w / 2, h / 2, scale)))
    print(f"{len(CLUSTER)} ícones posicionados")


if __name__ == "__main__":
    main()
