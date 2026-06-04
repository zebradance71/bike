"""Align idle-vibrate-* (or other variants) to idle.png footprint — same bbox as hero."""
from __future__ import annotations

from pathlib import Path

import _paths  # noqa: F401

from PIL import Image

from resolve_paths import frames_dir

FRAMES = frames_dir()
HERO = "idle.png"
VARIANTS = (
    "idle-vibrate-a.png",
    "idle-vibrate-b.png",
    "block-run-a.png",
    "block-run-b.png",
    "block-run-c.png",
    "block-run-d.png",
)
SIZE = 512


def align_to_hero(hero_path: Path, variant_path: Path) -> None:
    hero = Image.open(hero_path).convert("RGBA")
    hero_bb = hero.getbbox()
    if not hero_bb:
        raise SystemExit(f"empty hero: {hero_path}")

    var = Image.open(variant_path).convert("RGBA")
    var_bb = var.getbbox()
    if not var_bb:
        raise SystemExit(f"empty variant: {variant_path}")

    hx0, hy0, hx1, hy1 = hero_bb
    hero_w, hero_h = hx1 - hx0, hy1 - hy0
    crop = var.crop(var_bb)
    scaled = crop.resize((hero_w, hero_h), Image.Resampling.NEAREST)

    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    canvas.paste(scaled, (hx0, hy0), scaled)
    canvas.save(variant_path, format="PNG")
    print(f"  aligned {variant_path.name} -> hero bbox {hero_bb}")


def main() -> None:
    hero_path = FRAMES / HERO
    if not hero_path.exists():
        raise SystemExit(f"Missing {hero_path}")
    for name in VARIANTS:
        path = FRAMES / name
        if path.exists():
            align_to_hero(hero_path, path)
    print("done")


if __name__ == "__main__":
    main()
