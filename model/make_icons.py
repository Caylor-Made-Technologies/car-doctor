"""Draws the app icons: an orange heartbeat line on a dark background.

Run once (or after changing the design):  python model/make_icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "app" / "icons"
BG = (18, 20, 24)
ORANGE = (255, 138, 31)

# Heartbeat points on a 0-1 grid: flat, small bump, big spike, dip, flat.
POINTS = [(0.12, 0.55), (0.32, 0.55), (0.38, 0.47), (0.44, 0.55), (0.50, 0.55),
          (0.56, 0.25), (0.63, 0.78), (0.69, 0.55), (0.88, 0.55)]


def draw(size):
    scale = 4  # draw big, then shrink, for smooth edges
    big = size * scale
    img = Image.new("RGB", (big, big), BG)
    d = ImageDraw.Draw(img)
    pts = [(x * big, y * big) for x, y in POINTS]
    width = int(big * 0.055)
    d.line(pts, fill=ORANGE, width=width, joint="curve")
    r = width / 2
    for x, y in (pts[0], pts[-1]):  # round line ends
        d.ellipse([x - r, y - r, x + r, y + r], fill=ORANGE)
    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for size in (192, 512):
        draw(size).save(OUT / f"icon-{size}.png", optimize=True)
        print("wrote", OUT / f"icon-{size}.png")
