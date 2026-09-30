"""Gera o fundo Outubro Rosa: rosa claro + nuvem circular de ícones de saúde em traço branco.

Saídas (SVG vetorial, editável):
  icones_transparente.svg   só os ícones, fundo transparente (1080x1080)
  fundo_feed_1080x1080.svg  rosa + ícones
  fundo_feed_1080x1350.svg
  fundo_story_1080x1920.svg
Os PNGs são exportados por render_png.js.
"""
import math
import random
from pathlib import Path

OUT = Path(__file__).parent
random.seed(10)

# Paleta: um tom acima (mais claro) do rosa da referência
BG_EDGE = "#F4A3BF"
BG_CENTER = "#F8BCD0"
ICON = "#FFFFFF"
ICON_OPACITY = 0.5
STROKE = 5  # em unidades do ícone (caixa 100x100)

# Ícones em traço, desenhados numa caixa 100x100 centrada em (50,50)
ICONS = {
    "laco": '<path d="M32 90 L56 46 C66 28 62 10 50 10 C38 10 34 28 44 46 L68 90"/>',
    "cruz": '<path d="M38 12 H62 V38 H88 V62 H62 V88 H38 V62 H12 V38 H38 Z"/>',
    "coracao": '<path d="M50 86 C20 64 10 48 10 34 C10 20 21 12 32 12 C41 12 47 18 50 25 C53 18 59 12 68 12 C79 12 90 20 90 34 C90 48 80 64 50 86 Z"/>',
    "coracao_pulso": '<path d="M50 86 C20 64 10 48 10 34 C10 20 21 12 32 12 C41 12 47 18 50 25 C53 18 59 12 68 12 C79 12 90 20 90 34 C90 48 80 64 50 86 Z"/>'
                     '<path d="M18 48 H36 L42 36 L50 60 L57 42 L62 48 H82"/>',
    "capsula": '<g transform="rotate(-40 50 50)"><rect x="34" y="10" width="32" height="80" rx="16"/><path d="M34 50 H66"/></g>',
    "comprimido": '<circle cx="50" cy="50" r="34"/><path d="M26 74 L74 26"/>',
    "mulher": '<circle cx="50" cy="20" r="11"/><path d="M50 34 L28 76 H72 Z"/><path d="M42 76 V94 M58 76 V94"/>',
    "feminino": '<circle cx="50" cy="36" r="24"/><path d="M50 60 V94 M36 80 H64"/>',
    "flor": ''.join(
        f'<circle cx="{50 + 20 * math.cos(math.radians(a)):.1f}" cy="{50 + 20 * math.sin(math.radians(a)):.1f}" r="14"/>'
        for a in range(-90, 270, 72)) + '<circle cx="50" cy="50" r="7"/>',
    "estetoscopio": '<path d="M26 10 V40 C26 56 36 64 46 64 C56 64 66 56 66 40 V10"/>'
                    '<path d="M46 64 V76 C46 88 60 92 70 88 C78 84 80 76 80 70"/><circle cx="80" cy="62" r="8"/>',
    "maca": '<path d="M50 30 C40 22 20 22 16 42 C12 62 28 90 42 88 C46 87 48 85 50 85 C52 85 54 87 58 88 C72 90 88 62 84 42 C80 22 60 22 50 30 Z"/>'
            '<path d="M50 30 C50 22 52 14 58 10"/><path d="M54 20 C62 12 72 14 74 16 C70 22 62 24 54 20 Z"/>',
    "halter": '<path d="M28 50 H72"/><rect x="14" y="30" width="14" height="40" rx="4"/><rect x="72" y="30" width="14" height="40" rx="4"/>'
              '<path d="M8 40 V60 M92 40 V60"/>',
    "garrafa": '<rect x="30" y="28" width="40" height="64" rx="10"/><path d="M40 28 V16 H60 V28"/><path d="M36 10 H64"/><path d="M30 50 H70"/>',
    "folha": '<path d="M16 84 C16 40 44 16 86 14 C86 58 60 84 16 84 Z"/><path d="M16 84 L60 40"/>',
    "brilho": '<path d="M50 8 C54 36 64 46 92 50 C64 54 54 64 50 92 C46 64 36 54 8 50 C36 46 46 36 50 8 Z"/>',
    "frasco": '<rect x="26" y="30" width="48" height="60" rx="8"/><rect x="22" y="12" width="56" height="18" rx="4"/><path d="M40 60 H60 M50 50 V70"/>',
    "prancheta": '<rect x="18" y="14" width="64" height="80" rx="8"/><rect x="36" y="8" width="28" height="14" rx="4"/><path d="M32 56 L44 68 L68 42"/>',
    "calendario": '<rect x="12" y="20" width="76" height="70" rx="8"/><path d="M12 40 H88 M32 10 V28 M68 10 V28"/>'
                  '<path d="M40 64 L48 72 L62 54"/>',
}


def icon_group(name, x, y, size, rot):
    s = size / 100
    return (f'<g transform="translate({x:.1f} {y:.1f}) rotate({rot:.1f}) scale({s:.3f}) translate(-50 -50)" '
            f'stroke-width="{STROKE}">{ICONS[name]}</g>')


def pack_cluster(radius, count_target=160):
    """Espalha ícones dentro de um círculo sem sobreposição (amostragem por rejeição)."""
    names = list(ICONS)
    placed = []
    attempts = 0
    order = []
    while len(placed) < count_target and attempts < 300000:
        attempts += 1
        size = random.choice([72, 84, 96, 110])
        ang = random.uniform(0, 2 * math.pi)
        r = radius * math.sqrt(random.random())
        x, y = r * math.cos(ang), r * math.sin(ang)
        if r + size * 0.45 > radius:
            continue
        if any(math.hypot(x - px, y - py) < (size + ps) * 0.5 + 4 for px, py, ps, _, _ in placed):
            continue
        if not order:
            order = random.sample(names + ["laco", "laco", "coracao"], len(names) + 3)
        name = order.pop()
        placed.append((x, y, size, name, random.uniform(-25, 25)))
    return placed


CLUSTER = pack_cluster(radius=500)


def cluster_svg(cx, cy, scale=1.0):
    items = "".join(icon_group(n, x, y, s, rot) for x, y, s, n, rot in CLUSTER)
    return (f'<g id="icones" transform="translate({cx} {cy}) scale({scale})" fill="none" stroke="{ICON}" '
            f'stroke-opacity="{ICON_OPACITY}" stroke-linecap="round" stroke-linejoin="round">{items}</g>')


def doc(w, h, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
            f'{body}</svg>\n')


def background(w, h, cy):
    return (f'<defs><radialGradient id="bg" cx="{w / 2}" cy="{cy}" r="{max(w, h) * 0.8}" gradientUnits="userSpaceOnUse">'
            f'<stop offset="0" stop-color="{BG_CENTER}"/><stop offset="1" stop-color="{BG_EDGE}"/></radialGradient></defs>'
            f'<rect width="{w}" height="{h}" fill="url(#bg)"/>')


def main():
    (OUT / "icones_transparente.svg").write_text(doc(1080, 1080, cluster_svg(540, 540, 1.0)))
    for name, (w, h) in {"fundo_feed_1080x1080": (1080, 1080),
                         "fundo_feed_1080x1350": (1080, 1350),
                         "fundo_story_1080x1920": (1080, 1920)}.items():
        cy = h / 2
        scale = 1.0 if h <= 1350 else 1.12
        (OUT / f"{name}.svg").write_text(doc(w, h, background(w, h, cy) + cluster_svg(w / 2, cy, scale)))
    print(f"{len(CLUSTER)} ícones posicionados")


if __name__ == "__main__":
    main()
