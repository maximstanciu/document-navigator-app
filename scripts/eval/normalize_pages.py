"""Re-encodes photos and image files the way the app does before the upload (CAP-4,
src/features/capture/normalize-image.ts): EXIF orientation applied, the long side at most 2048 px,
JPEG at quality 80. The eval runner (run-eval.ts) calls it, so the model gets what the app would
send. HEIC needs pillow_heif from requirements.txt.

Usage: scripts/eval/.venv/bin/python scripts/eval/normalize_pages.py OUT_DIR IMAGE...
Writes OUT_DIR/page-1.jpg, page-2.jpg... in the order given.
"""

import sys
from pathlib import Path

from PIL import Image, ImageOps
from pillow_heif import register_heif_opener

PAGE_MAX_SIDE = 2048
JPEG_QUALITY = 80


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    register_heif_opener()
    for number, path in enumerate(sys.argv[2:], start=1):
        with Image.open(path) as image:
            page = ImageOps.exif_transpose(image).convert("RGB")
        page.thumbnail((PAGE_MAX_SIDE, PAGE_MAX_SIDE), Image.Resampling.LANCZOS)
        page.save(out / f"page-{number}.jpg", "JPEG", quality=JPEG_QUALITY)


if __name__ == "__main__":
    main()
