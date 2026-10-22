"""Draws the app icons: a pickup truck with a heartbeat line, in Caylor Made
Technologies blue on navy.

Run once (or after changing the design):  python model/make_icons.py
Writes app/icons/icon-192.png, icon-512.png, apple-touch-icon.png (180)
and favicon-32.png.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / "app" / "icons"
NAVY = (11, 15, 20)
NAVY_2 = (18, 27, 44)
BLUE = (61, 139, 255)
BLUE_DEEP = (27, 99, 235)
WHITE = (255, 255, 255)

# Everything is drawn on a 0-1 grid, then scaled. The art stays inside the
# middle 80% so Android can crop it to a circle ("maskable") safely.

TRUCK = [  # side view outline of a pickup, facing right
    (0.20, 0.62), (0.20, 0.52), (0.24, 0.50), (0.46, 0.50), (0.46, 0.40),
    (0.52, 0.34), (0.66, 0.34), (0.73, 0.44), (0.80, 0.46), (0.82, 0.50),
    (0.82, 0.62),
]
WHEELS = [(0.31, 0.63), (0.70, 0.63)]
PULSE = [(0.14, 0.78), (0.36, 0.78), (0.41, 0.72), (0.46, 0.84),
         (0.52, 0.70), (0.57, 0.78), (0.86, 0.78)]


def draw(size):
    scale = 4  # draw big, then shrink, for smooth edges
    big = size * scale
    p = lambda pts: [(x * big, (y - 0.06) * big) for x, y in pts]

    img = Image.new("RGB", (big, big), NAVY)
    d = ImageDraw.Draw(img)

    # Soft blue glow in the middle.
    glow = Image.new("L", (big, big), 0)
    ImageDraw.Draw(glow).ellipse([big * 0.12, big * 0.12, big * 0.88, big * 0.88], fill=150)
    glow = glow.filter(ImageFilter.GaussianBlur(big * 0.12))
    img.paste(Image.new("RGB", (big, big), NAVY_2), (0, 0), glow)

    # Truck body (filled blue) with a window cut out.
    d.polygon(p(TRUCK), fill=BLUE_DEEP)
    d.polygon(p([(0.53, 0.38), (0.64, 0.38), (0.69, 0.45), (0.53, 0.45)]), fill=NAVY_2)
    d.line(p(TRUCK + [TRUCK[0]]), fill=BLUE, width=int(big * 0.018), joint="curve")

    # Wheels: navy hole, blue rim.
    for cx, cy in WHEELS:
        r = 0.075 * big
        cy -= 0.06
        d.ellipse([cx * big - r, cy * big - r, cx * big + r, cy * big + r], fill=NAVY, outline=BLUE, width=int(big * 0.022))
        r2 = 0.025 * big
        d.ellipse([cx * big - r2, cy * big - r2, cx * big + r2, cy * big + r2], fill=BLUE)

    # Heartbeat line under the truck, white so it pops.
    width = int(big * 0.038)
    d.line(p(PULSE), fill=WHITE, width=width, joint="curve")
    rr = width / 2
    for x, y in (p(PULSE)[0], p(PULSE)[-1]):
        d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=WHITE)

    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for name, size in (("icon-192.png", 192), ("icon-512.png", 512),
                       ("apple-touch-icon.png", 180), ("favicon-32.png", 32)):
        draw(size).save(OUT / name, optimize=True)
        print("wrote", OUT / name)
