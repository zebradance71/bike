"""Generate itch.io cover image from the canonical app icon SVG.

Usage:
    py -3 scripts/pack-tools/build-itch-cover.py

Output: design/icon/itch-cover.png (630×500, itch recommended)
"""
from __future__ import annotations

import json
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError as exc:
    raise SystemExit("Pillow required: py -3 -m pip install Pillow") from exc

from icon_master import load_icon_master
from resolve_paths import REPO_ROOT

OUT = REPO_ROOT / "design" / "icon" / "itch-cover.png"
W, H = 630, 500
BG = (24, 28, 36, 255)


def _load_branding() -> dict:
    path = REPO_ROOT / "branding.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    png = REPO_ROOT / "design" / "icon" / "app-icon-source.png"
    svg = REPO_ROOT / "design" / "icon" / "app-icon.svg"
    if not png.exists() and not svg.exists():
        raise SystemExit("app icon source not found under design/icon/")

    branding = _load_branding()
    title = branding.get("productName") or branding.get("appName") or "Companion"
    tagline = branding.get("description") or "Desktop Companion"

    bg = Image.new("RGBA", (W, H), BG)
    icon, _source = load_icon_master(master_px=256)
    scale = min((W - 120) / icon.width, (H - 160) / icon.height)
    nw = max(1, int(icon.width * scale))
    nh = max(1, int(icon.height * scale))
    scaled = icon.resize((nw, nh), Image.LANCZOS)
    x = (W - nw) // 2
    y = H - nh - 48
    bg.paste(scaled, (x, y), scaled)

    draw = ImageDraw.Draw(bg)
    draw.text((32, 36), title, fill=(235, 240, 248, 255))
    draw.text((32, 72), tagline, fill=(150, 165, 180, 255))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    bg.convert("RGB").save(OUT, format="PNG")
    print(f"[itch-cover] wrote {OUT}")


if __name__ == "__main__":
    main()
