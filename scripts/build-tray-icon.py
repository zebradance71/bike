"""Generate Tray icon assets from the existing idle sprite.

Outputs (under repo `assets/`):
  - tray-{16,24,32,48,64,128,256}.png   single-size PNGs
  - tray.png                            32-px square (Electron default)
  - tray.ico                            multi-size ICO (Windows preferred)

Idempotent: re-run after editing idle.png to refresh the tray icon.

Usage:
    py -3 scripts/build-tray-icon.py
"""
from __future__ import annotations

from pathlib import Path

try:
    from PIL import Image
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "Pillow is required. Install with `py -3 -m pip install Pillow`."
    ) from exc


REPO = Path(__file__).resolve().parent.parent
SRC = REPO / "src" / "companion" / "assets" / "frames" / "idle.png"
OUT = REPO / "assets"

# Tray icons need a tight crop around the visible sprite so the small
# rendered pixels show the ninja, not a sea of transparency. We crop to
# the alpha bounding box, then center-pad to a square.
PNG_SIZES = [16, 24, 32, 48, 64, 128, 256]
ICO_SIZES = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"idle source not found: {SRC}")

    OUT.mkdir(parents=True, exist_ok=True)

    img = Image.open(SRC).convert("RGBA")

    bbox = img.getbbox()
    if bbox is None:
        raise SystemExit("idle.png is fully transparent; nothing to crop")
    cropped = img.crop(bbox)

    # Square-pad so resizing is symmetric (no horizontal squish at small px).
    side = max(cropped.size)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    ox = (side - cropped.size[0]) // 2
    oy = (side - cropped.size[1]) // 2
    square.paste(cropped, (ox, oy), cropped)

    # Per-size resampled PNGs.
    resized: dict[int, Image.Image] = {}
    for px in PNG_SIZES:
        out = square.resize((px, px), Image.LANCZOS)
        resized[px] = out
        out.save(OUT / f"tray-{px}.png")

    # Default 32px PNG (used by Electron when ICO is unavailable).
    resized[32].save(OUT / "tray.png")

    # Multi-size ICO for Windows. Pillow needs a list of (w, h) sizes; it
    # uses the source's largest mip and downscales internally.
    square.save(OUT / "tray.ico", format="ICO", sizes=ICO_SIZES)

    print("[tray-icon] wrote", OUT)
    for px in PNG_SIZES:
        print(f"  - tray-{px}.png")
    print("  - tray.png")
    print("  - tray.ico")


if __name__ == "__main__":
    main()
