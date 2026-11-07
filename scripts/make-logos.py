"""Builds the web-sized logos from the originals in public/images/card-images/ (the originals stay untouched).
   public/images/card-logos/<name>.png        about 300 px: for the board squares
   public/images/card-logos/large/<name>.png  up to 900 px: for the hover card and the title deed
Transparent margins are trimmed; dark logos on a transparent background (ACT, ANI, AUA) get a light rounded backing.
Run: python3 scripts/make-logos.py   (needs Pillow; the one SVG is drawn with Playwright)"""
import io, os, sys
from PIL import Image, ImageDraw

SRC = 'public/images/card-images'
OUT = 'public/images/card-logos'
BACKED = {'act-college', 'ani', 'armenian-university-of-armenia'}   # dark on transparent: add a light backing
SMALL, LARGE = (300, 200), (900, 600)                              # max width, max height


def load(path):
    if path.endswith('.svg'):
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1000, 'height': 1000})
            pg.goto('file://' + os.path.abspath(path))   # the SVG itself, scaled to the viewport
            pg.evaluate("document.documentElement.style.cssText = 'width:1000px;height:1000px;background:transparent'; const s = document.querySelector('svg'); s.setAttribute('width', 1000); s.setAttribute('height', 1000);")
            pg.wait_for_timeout(300)
            png = pg.screenshot(omit_background=True); b.close()
        return Image.open(io.BytesIO(png)).convert('RGBA')
    return Image.open(path).convert('RGBA')


def trim(im):
    box = im.getchannel('A').point(lambda v: 255 if v > 12 else 0).getbbox()
    return im.crop(box) if box else im


def backing(im):
    pad = max(8, round(max(im.size) * 0.07))
    w, h = im.width + 2 * pad, im.height + 2 * pad
    card = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(card).rounded_rectangle((0, 0, w - 1, h - 1), radius=pad, fill=(245, 245, 240, 255))
    card.alpha_composite(im, (pad, pad))
    return card


def fit(im, box):
    im = im.copy(); im.thumbnail(box, Image.LANCZOS); return im


os.makedirs(OUT + '/large', exist_ok=True)
for f in sorted(os.listdir(SRC)):
    name, ext = os.path.splitext(f)
    if ext.lower() not in ('.png', '.jpg', '.jpeg', '.svg'):
        continue
    im = trim(load(os.path.join(SRC, f)))
    if name in BACKED:
        im = backing(im)
    for folder, box in ((OUT, SMALL), (OUT + '/large', LARGE)):
        out = fit(im, box)
        out.save(f'{folder}/{name}.png', optimize=True)
    print(f'{name:36} {im.width}x{im.height} -> {os.path.getsize(f"{OUT}/{name}.png")//1024} KB small, {os.path.getsize(f"{OUT}/large/{name}.png")//1024} KB large')
