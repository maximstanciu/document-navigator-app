"""Render the app icon set from one vector mark: a page with a compass needle.

The mark lives below in a 100×100 coordinate space; every asset is a composition of it.
Rasterizes through headless Chrome and downscales with Pillow, so it needs both:

    python3 scripts/icons/render_icons.py            # CHROME=/path/to/chrome to override

Writes the PNGs in assets/images/ and the layers of the iOS Icon Composer bundle
(assets/expo.icon/Assets/). app.json points at these files.
"""

import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
IMAGES = ROOT / "assets" / "images"
IOS_ASSETS = ROOT / "assets" / "expo.icon" / "Assets"
CHROME = os.environ.get("CHROME", "google-chrome")

# Tint from src/constants/theme.ts (light) and two lighter steps of it.
BLUE = "#0860BF"
PALE = "#B5D4F4"
MID = "#85B7EB"
WHITE = "#FFFFFF"

PAGE = "M31 16H59L75 32V78A6 6 0 0 1 69 84H31A6 6 0 0 1 25 78V22A6 6 0 0 1 31 16Z"
FOLD = "M59 16V27A5 5 0 0 0 64 32H75Z"
FOLD_EDGE = "M59 16V27A5 5 0 0 0 64 32H75"
NEEDLE_NORTH = "M59 53L53.5 65.5L46.5 58.5Z"
NEEDLE_SOUTH = "M41 71L46.5 58.5L53.5 65.5Z"
LINES = [(32, 27, 18), (32, 34, 26)]  # x, y, width; 3.5 high
RING = (50, 62, 15)  # cx, cy, r; 2.5 stroke


def lines(fill):
    return "".join(
        f'<rect x="{x}" y="{y}" width="{w}" height="3.5" rx="1.75" fill="{fill}"/>'
        for x, y, w in LINES
    )


def ring(stroke):
    cx, cy, r = RING
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{stroke}" stroke-width="2.5"/>'


def page_layer():
    return (
        f'<path d="{PAGE}" fill="{WHITE}"/><path d="{FOLD}" fill="{PALE}"/>'
        + lines(PALE)
        + ring(PALE)
    )


def needle_layer():
    return (
        f'<path d="{NEEDLE_NORTH}" fill="{BLUE}"/><path d="{NEEDLE_SOUTH}" fill="{MID}"/>'
        f'<circle cx="{RING[0]}" cy="{RING[1]}" r="2" fill="{WHITE}"/>'
    )


def mark():
    return page_layer() + needle_layer()


def mono_mark():
    """One color with alpha only: details are cut out of the page silhouette."""
    return (
        '<defs><mask id="cut" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">'
        f'<path d="{PAGE}" fill="#fff"/>'
        f'<path d="{FOLD_EDGE}" fill="none" stroke="#000" stroke-width="2.5"/>'
        + lines("#000")
        + ring("#000")
        + f'<path d="{NEEDLE_NORTH}" fill="#000"/>'
        "</mask></defs>"
        f'<rect width="100" height="100" fill="{WHITE}" mask="url(#cut)"/>'
    )


def scaled(content, scale):
    return f'<g transform="translate(50 50) scale({scale}) translate(-50 -50)">{content}</g>'


def svg(content, width, height, view_box="0 0 100 100"):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="{view_box}">{content}</svg>'
    )


def rasterize(svg_text, width, height, work):
    html = work / "page.html"
    out = work / "shot.png"
    html.write_text(
        '<!doctype html><html><body style="margin:0;background:transparent">'
        f"{svg_text}</body></html>"
    )
    subprocess.run(
        [
            CHROME,
            "--headless=new",
            "--disable-gpu",
            "--hide-scrollbars",
            "--force-device-scale-factor=1",
            "--default-background-color=00000000",
            f"--user-data-dir={work / 'profile'}",
            f"--window-size={width},{height}",
            f"--screenshot={out}",
            html.as_uri(),
        ],
        check=True,
        capture_output=True,
    )
    image = Image.open(out).convert("RGBA")
    if image.size != (width, height):
        sys.exit(f"Chrome returned {image.size}, expected {(width, height)}")
    return image


def render(name, svg_text, width, height, work, size=None, opaque=False):
    image = rasterize(svg_text, width, height, work)
    if size:
        image = image.resize(size, Image.LANCZOS)
    if opaque:
        image = image.convert("RGB")
    image.save(IMAGES / name, optimize=True)
    print(f"{name}: {image.size[0]}×{image.size[1]} {image.mode}")


# Adaptive icons are masked to anything from a circle to a square: keep the mark inside the
# 66 dp safe circle of the 108 dp canvas.
ADAPTIVE_SCALE = 0.72


def main():
    if not shutil.which(CHROME):
        sys.exit(f"{CHROME} not found; set CHROME to a Chrome or Chromium binary")
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        background = f'<rect width="100" height="100" fill="{BLUE}"/>'
        # Full bleed: iOS and the stores round the corners themselves.
        render("icon.png", svg(background + mark(), 1024, 1024), 1024, 1024, work, opaque=True)
        render(
            "android-icon-foreground.png",
            svg(scaled(mark(), ADAPTIVE_SCALE), 1024, 1024),
            1024,
            1024,
            work,
        )
        render(
            "android-icon-monochrome.png",
            svg(scaled(mono_mark(), ADAPTIVE_SCALE), 1024, 1024),
            1024,
            1024,
            work,
        )
        # Tight around the page; app.json sets its width and the blue background.
        render("splash-icon.png", svg(mark(), 600, 816, "25 16 50 68"), 600, 816, work)
        render(
            "notification-icon.png",
            svg(mono_mark(), 384, 384, "14 14 72 72"),
            384,
            384,
            work,
            size=(96, 96),
        )
        tile = f'<rect width="100" height="100" rx="22" fill="{BLUE}"/>'
        render("favicon.png", svg(tile + mark(), 1024, 1024), 1024, 1024, work, size=(48, 48))

    # Icon Composer layers: full-canvas SVGs, so they line up without offsets.
    IOS_ASSETS.mkdir(exist_ok=True)
    for name, content in [("needle.svg", needle_layer()), ("page.svg", page_layer())]:
        (IOS_ASSETS / name).write_text(svg(content, 1024, 1024) + "\n")
        print(f"expo.icon/Assets/{name}")


if __name__ == "__main__":
    main()
