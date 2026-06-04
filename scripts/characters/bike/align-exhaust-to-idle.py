"""Align idle-exhaust-* display PNGs to idle.png wheelbase / foot anchor.

Exhaust magenta art often draws the bike slightly smaller; compose fixes height
loosely but foot-aligned rescale to the idle hero bbox removes the wheelbase jump.

Run after import-idle-from-magenta.py:
  py -3 scripts/characters/bike/align-exhaust-to-idle.py
"""
from __future__ import annotations

from pathlib import Path

import _paths  # noqa: F401

from PIL import Image

from resolve_paths import frames_dir

FRAMES = frames_dir()
HERO = "idle.png"
EXHAUST = ("idle-exhaust-a.png", "idle-exhaust-b.png")
SIZE = 512


def main() -> None:
    hero_path = FRAMES / HERO
    if not hero_path.exists():
        raise SystemExit(f"Missing {hero_path}")

    hero = Image.open(hero_path).convert("RGBA")
    hero_bb = hero.getbbox()
    if not hero_bb:
        raise SystemExit(f"{HERO} has empty bbox")

    hx0, hy0, hx1, hy1 = hero_bb
    hero_h = hy1 - hy0
    hero_cx = (hx0 + hx1) // 2
    print(f"hero {HERO}: bbox={hero_bb} char_h={hero_h} foot_y={hy1}")

    for name in EXHAUST:
        path = FRAMES / name
        if not path.exists():
            print(f"  skip missing {name}")
            continue

        im = Image.open(path).convert("RGBA")
        bb = im.getbbox()
        if not bb:
            print(f"  skip empty {name}")
            continue

        crop = im.crop(bb)
        cw, ch = crop.size
        if ch < 1:
            continue

        scale = hero_h / ch
        nw = max(1, int(round(cw * scale)))
        nh = hero_h
        scaled = crop.resize((nw, nh), Image.Resampling.NEAREST)

        canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        paste_x = hero_cx - nw // 2
        paste_y = hy1 - nh
        canvas.paste(scaled, (paste_x, paste_y), scaled)
        canvas.save(path, format="PNG")

        out_bb = canvas.getbbox()
        och = out_bb[3] - out_bb[1] if out_bb else 0
        print(
            f"  {name}: scale={scale:.3f} paste=({paste_x},{paste_y}) "
            f"out_bbox top={out_bb[1] if out_bb else '?'} char_h={och}"
        )

    print("done")


if __name__ == "__main__":
    main()
