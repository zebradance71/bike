"""Generate a minimal idle.png placeholder for a new character pack.

Usage (from repo root):
    py -3 tools/template/character-pack/generate-placeholder-idle.py

Writes src/companion/assets/frames/idle.png — a simple centered blob on
transparent 512x512 canvas, foot-aligned like imported frames.
"""
from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError as exc:
    raise SystemExit("Pillow required: py -3 -m pip install Pillow") from exc

REPO = Path(__file__).resolve().parents[3]
OUT = REPO / "src" / "companion" / "assets" / "frames" / "idle.png"
SIZE = 512
FOOT_Y = SIZE - 56
CHAR_H = 280


def main() -> None:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx = SIZE // 2
    top = FOOT_Y - CHAR_H
    draw.ellipse(
        (cx - 90, top + 20, cx + 90, top + 200),
        fill=(80, 160, 220, 255),
    )
    draw.ellipse(
        (cx - 55, top - 40, cx + 55, top + 60),
        fill=(80, 160, 220, 255),
    )
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, format="PNG")
    print(f"[placeholder] wrote {OUT}")


if __name__ == "__main__":
    main()
