"""Render the app icon set from one vector mark: a tilted page and a big compass over it.

The mark lives below in a 100×100 coordinate space (the visible icon tile); the page and the
compass run past its edges, and the icon mask crops them. Every asset is a composition of it.
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

# An ink tile, a white page with grey details, and the compass in the lime accent: the needle's
# south half is a darker step of it.
INK = "#0B0D12"
PALE = "#C9CDD4"
LIME = "#C8F31D"
DEEP_LIME = "#8FAE14"
WHITE = "#FFFFFF"

# The page, drawn upright and then tilted. Its bottom runs off the tile unless `bottom` ends it.
TILT = "translate(0 3) rotate(-12 40 50)"
FOLD = "M48 8V18A6 6 0 0 0 54 24H64Z"
FOLD_EDGE = "M48 8V18A6 6 0 0 0 54 24H64"
LINES = [(22, 20, 18), (22, 29, 28)]  # x, y, width; 4.5 high
BLEED_BOTTOM = 130
WHOLE_BOTTOM = 96

# The compass: a lime ring and needle, cut out of the page with a gap around it.
CX, CY, R = 70, 76, 44
RING_WIDTH = 5.5
GAP = 3
# Short enough that the tip stays inside a circular adaptive-icon mask.
NEEDLE_LENGTH = 24.6
NEEDLE_WIDTH = 8.4


def page_path(bottom):
    return (
        f"M21 8H48L64 24V{bottom - 7}A7 7 0 0 1 57 {bottom}H21"
        f"A7 7 0 0 1 14 {bottom - 7}V15A7 7 0 0 1 21 8Z"
    )


def lines(fill):
    return "".join(
        f'<rect x="{x}" y="{y}" width="{w}" height="4.5" rx="2.25" fill="{fill}"/>'
        for x, y, w in LINES
    )


def compass_cut():
    """Mask that hides the page under the compass and in the gap around its ring."""
    cut = R + RING_WIDTH / 2 + GAP
    return (
        '<mask id="cut" maskUnits="userSpaceOnUse" x="-50" y="-50" width="200" height="200">'
        '<rect x="-50" y="-50" width="200" height="200" fill="#fff"/>'
        f'<circle cx="{CX}" cy="{CY}" r="{cut}" fill="#000"/></mask>'
    )


def page_layer(bottom=BLEED_BOTTOM):
    return (
        f"<defs>{compass_cut()}</defs>"
        f'<g mask="url(#cut)"><g transform="{TILT}">'
        f'<path d="{page_path(bottom)}" fill="{WHITE}"/><path d="{FOLD}" fill="{PALE}"/>'
        + lines(PALE)
        + "</g></g>"
    )


def ring_layer(stroke=WHITE):
    return (
        f'<circle cx="{CX}" cy="{CY}" r="{R}" fill="none" stroke="{stroke}" '
        f'stroke-width="{RING_WIDTH}"/>'
    )


def needle_points():
    tip = (CX + NEEDLE_LENGTH, CY - NEEDLE_LENGTH)
    tail = (CX - NEEDLE_LENGTH, CY + NEEDLE_LENGTH)
    side_a = (CX + NEEDLE_WIDTH, CY + NEEDLE_WIDTH)
    side_b = (CX - NEEDLE_WIDTH, CY - NEEDLE_WIDTH)
    path = lambda *points: "M" + "L".join(f"{x:g} {y:g}" for x, y in points) + "Z"
    return path(tip, side_a, side_b), path(tail, side_b, side_a)


def needle_layer():
    north, south = needle_points()
    return (
        f'<path d="{north}" fill="{LIME}"/><path d="{south}" fill="{DEEP_LIME}"/>'
        f'<circle cx="{CX}" cy="{CY}" r="3.4" fill="{INK}"/>'
    )


def mark(bottom=BLEED_BOTTOM):
    return page_layer(bottom) + ring_layer(LIME) + needle_layer()


def mono_mark(bottom=BLEED_BOTTOM):
    """One color with alpha only: page details are cut out, the needle keeps its north half."""
    cut = R + RING_WIDTH / 2 + GAP
    north, _ = needle_points()
    return (
        '<defs><mask id="mono" maskUnits="userSpaceOnUse" x="-50" y="-50" width="200" height="200">'
        f'<g transform="{TILT}"><path d="{page_path(bottom)}" fill="#fff"/>'
        f'<path d="{FOLD_EDGE}" fill="none" stroke="#000" stroke-width="2.5"/>'
        + lines("#000")
        + f'</g><circle cx="{CX}" cy="{CY}" r="{cut}" fill="#000"/></mask></defs>'
        f'<rect x="-50" y="-50" width="200" height="200" fill="{WHITE}" mask="url(#mono)"/>'
        + ring_layer()
        + f'<path d="{north}" fill="{WHITE}"/><circle cx="{CX}" cy="{CY}" r="3.4" fill="{WHITE}"/>'
    )


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


def save(image, path, size=None, opaque=False):
    if size:
        image = image.resize(size, Image.LANCZOS)
    if opaque:
        image = image.convert("RGB")
    image.save(path, optimize=True)
    print(f"{path.relative_to(ROOT)}: {image.size[0]}×{image.size[1]} {image.mode}")


def render(name, svg_text, width, height, work, **kwargs):
    save(rasterize(svg_text, width, height, work), IMAGES / name, **kwargs)


def render_whole(content, work, square=False):
    """The whole composition with nothing cropped, trimmed to its own bounds."""
    image = rasterize(svg(content, 1500, 1500, "-25 -25 150 150"), 1500, 1500, work)
    box = image.getbbox()
    if min(box[:2]) == 0 or max(box[2:]) == 1500:
        sys.exit("The whole mark touches the edge of its render: widen the view box")
    image = image.crop(box)
    if square:
        side = max(image.size)
        padded = Image.new("RGBA", (side, side))
        padded.paste(image, ((side - image.width) // 2, (side - image.height) // 2))
        image = padded
    return image


# The adaptive icon canvas is 108 dp and launchers show at most its middle 72 dp, so the tile
# is the middle two thirds; what bleeds past the tile shows only in parallax.
ADAPTIVE_VIEW_BOX = "-25 -25 150 150"


def main():
    if not shutil.which(CHROME):
        sys.exit(f"{CHROME} not found; set CHROME to a Chrome or Chromium binary")
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        background = f'<rect width="100" height="100" fill="{INK}"/>'
        # Full bleed: iOS and the stores round the corners themselves.
        render("icon.png", svg(background + mark(), 1024, 1024), 1024, 1024, work, opaque=True)
        render(
            "android-icon-foreground.png",
            svg(mark(), 1024, 1024, ADAPTIVE_VIEW_BOX),
            1024,
            1024,
            work,
        )
        render(
            "android-icon-monochrome.png",
            svg(mono_mark(), 1024, 1024, ADAPTIVE_VIEW_BOX),
            1024,
            1024,
            work,
        )
        # Splash and status bar show the mark on their own, so nothing is cropped there.
        whole = render_whole(mark(WHOLE_BOTTOM), work)
        save(whole, IMAGES / "splash-icon.png", size=(600, round(600 * whole.height / whole.width)))
        save(
            render_whole(mono_mark(WHOLE_BOTTOM), work, square=True),
            IMAGES / "notification-icon.png",
            size=(96, 96),
        )
        tile = f'<rect width="100" height="100" rx="22" fill="{INK}"/>'
        render(
            "favicon.png",
            svg(f'<clipPath id="tile">{tile}</clipPath><g clip-path="url(#tile)">'
                f"{background}{mark()}</g>", 1024, 1024),
            1024,
            1024,
            work,
            size=(48, 48),
        )

        # Icon Composer layers, all full canvas so they line up without offsets. The page is a
        # PNG because it is cut with a mask.
        IOS_ASSETS.mkdir(exist_ok=True)
        save(rasterize(svg(page_layer(), 1024, 1024), 1024, 1024, work), IOS_ASSETS / "page.png")
    for name, content in [("needle.svg", needle_layer()), ("ring.svg", ring_layer(LIME))]:
        (IOS_ASSETS / name).write_text(svg(content, 1024, 1024) + "\n")
        print(f"assets/expo.icon/Assets/{name}")


if __name__ == "__main__":
    main()
