"""Generate itch.io cover image from idle.png.

Usage:
    py -3 tools/template/itch-page/generate-cover.py

Output: tools/template/itch-page/cover.png (630×500 recommended for itch)
"""
from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError as exc:
    raise SystemExit("Pillow required: py -3 -m pip install Pillow") from exc

REPO = Path(__file__).resolve().parents[3]
IDLE = REPO / "src" / "companion" / "assets" / "frames" / "idle.png"
OUT = Path(__file__).resolve().parent / "cover.png"
W, H = 630, 500


def main() -> None:
    if not IDLE.exists():
        raise SystemExit(f"idle.png not found: {IDLE}")

    bg = Image.new("RGBA", (W, H), (24, 28, 36, 255))
    sprite = Image.open(IDLE).convert("RGBA")
    bbox = sprite.getbbox()
    if not bbox:
        raise SystemExit("idle.png has no visible pixels")
    cropped = sprite.crop(bbox)

    scale = min((W - 80) / cropped.width, (H - 80) / cropped.height)
    nw = max(1, int(cropped.width * scale))
    nh = max(1, int(cropped.height * scale))
    scaled = cropped.resize((nw, nh), Image.LANCZOS)
    x = (W - nw) // 2
    y = H - nh - 40
    bg.paste(scaled, (x, y), scaled)

    draw = ImageDraw.Draw(bg)
    draw.text((24, 24), "Desktop Companion", fill=(200, 210, 220, 255))

    bg.convert("RGB").save(OUT, format="PNG")
    print(f"[itch-cover] wrote {OUT}")


if __name__ == "__main__":
    main()
