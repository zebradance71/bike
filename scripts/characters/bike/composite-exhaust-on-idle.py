"""Build idle-exhaust-* = idle.png + smoke-only overlay at rear muffler.

Bike faces RIGHT: muffler is rear-left. Smoke billows further LEFT.
Never pastes bike pixels from exhaust art (prevents ghost/double bike).
"""
from __future__ import annotations

from pathlib import Path

import _paths  # noqa: F401

from PIL import Image

from frame_import_common import (
    SIZE,
    compose_frame,
    key_chroma_border,
    load_sheet_on_magenta,
    reference_char_height,
)
from resolve_paths import frames_dir

FRAMES = frames_dir()
HERO = "idle.png"
# Display size when pasted on idle (design PNG unchanged; scale at composite).
DISPLAY_SMOKE_A = (96, 68)
DISPLAY_SMOKE_B = (120, 84)

EXHAUST_SOURCES: tuple[tuple[str, str], ...] = (
    (
        "idle-exhaust-a.png",
        ("idle-exhaust-a-smoke-only-magenta.png", "idle-exhaust-a-magenta.png"),
    ),
    (
        "idle-exhaust-b.png",
        ("idle-exhaust-b-smoke-only-magenta.png", "idle-exhaust-b-magenta.png"),
    ),
)


def is_smoke_pixel(r: int, g: int, b: int) -> bool:
    if r < 35 and g < 35 and b < 35:
        return False
    if r > 140 and g < 90 and b < 90:
        return False
    if max(r, g, b) - min(r, g, b) < 55 and r > 90 and g > 90 and b > 90:
        return True
    if b > r + 15 and b > g + 10 and b > 110:
        return True
    return False


def is_bike_pixel(r: int, g: int, b: int) -> bool:
    if r > 120 and g < 100 and b < 100:
        return True
    if r > 180 and g > 180 and b > 180:
        return True
    if r < 55 and g < 55 and b < 55:
        return True
    return False


def muffler_anchor(hero_bb: tuple[int, int, int, int]) -> tuple[int, int]:
    """Rear muffler tail on side view (bike faces right): a bit right of rear wheel, mid-low."""
    hx0, hy0, hx1, hy1 = hero_bb
    w = hx1 - hx0
    h = hy1 - hy0
    # Tune: x rightward, y upward from old 8% / 20%.
    ax = hx0 + max(12, int(w * 0.15))
    ay = hy1 - max(12, int(h * 0.28))
    return ax, ay


def smoke_crop_from_keyed(keyed: Image.Image) -> Image.Image | None:
    w, h = keyed.size
    xs: list[int] = []
    ys: list[int] = []
    px = keyed.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 16:
                continue
            if is_bike_pixel(r, g, b):
                continue
            if is_smoke_pixel(r, g, b):
                xs.append(x)
                ys.append(y)
    if not xs:
        return None
    return keyed.crop((min(xs), min(ys), max(xs) + 1, max(ys) + 1))


def scale_smoke_to_display(
    smoke: Image.Image, max_w: int, max_h: int
) -> Image.Image:
    """Upscale (or downscale) smoke art to the on-screen puff size."""
    sw, sh = smoke.size
    if sw < 1 or sh < 1:
        return smoke
    scale = min(max_w / sw, max_h / sh)
    nw = max(1, int(round(sw * scale)))
    nh = max(1, int(round(sh * scale)))
    if (nw, nh) == (sw, sh):
        return smoke
    return smoke.resize((nw, nh), Image.Resampling.NEAREST)


def composite_exhaust_on_hero(
    hero_path: Path,
    exhaust_magenta_path: Path,
    out_path: Path,
) -> None:
    hero = Image.open(hero_path).convert("RGBA")
    hero_bb = hero.getbbox()
    if not hero_bb:
        raise SystemExit(f"empty hero bbox: {hero_path}")

    muffler_x, muffler_y = muffler_anchor(hero_bb)
    hx0, _, hx1, _ = hero_bb
    front_limit_x = hx0 + int((hx1 - hx0) * 0.42)

    sheet = load_sheet_on_magenta(exhaust_magenta_path)
    keyed = key_chroma_border(sheet)
    smoke = smoke_crop_from_keyed(keyed)
    if smoke is None:
        framed = compose_frame(keyed, target_char_h=reference_char_height())
        smoke = smoke_crop_from_keyed(framed)
    if smoke is None:
        raise SystemExit(f"no smoke pixels in {exhaust_magenta_path.name}")

    max_w, max_h = (
        DISPLAY_SMOKE_B if "exhaust-b" in out_path.name else DISPLAY_SMOKE_A
    )
    smoke = scale_smoke_to_display(smoke, max_w, max_h)
    sw, sh = smoke.size
    # Right edge of puff at muffler exit; bias up so plume rises from pipe.
    paste_x = muffler_x - sw + int(sw * 0.06)
    is_b = "exhaust-b" in out_path.name
    v_bias = 0.72 if is_b else 0.64
    paste_y = muffler_y - int(sh * v_bias)
    paste_y -= 18 if is_b else 10

    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    layer.paste(smoke, (paste_x, paste_y), smoke)

    result = hero.copy()
    rpx = result.load()
    lpx = layer.load()

    placed = 0
    for y in range(SIZE):
        for x in range(SIZE):
            if x > front_limit_x:
                continue
            lr, lg, lb, la = lpx[x, y]
            if la < 16 or not is_smoke_pixel(lr, lg, lb):
                continue
            hr, hg, hb, ha = rpx[x, y]
            if ha < 16:
                rpx[x, y] = (lr, lg, lb, min(255, la + 64))
            else:
                a = min(1.0, (la + 72) / 255.0)
                rpx[x, y] = (
                    int(lr * a + hr * (1 - a)),
                    int(lg * a + hg * (1 - a)),
                    int(lb * a + hb * (1 - a)),
                    min(255, max(ha, la + 32)),
                )
            placed += 1

    result.save(out_path, format="PNG")
    out_bb = result.getbbox()
    print(
        f"  composite {exhaust_magenta_path.name} -> {out_path.name}  "
        f"muffler=({muffler_x},{muffler_y}) paste=({paste_x},{paste_y}) "
        f"smoke={sw}x{sh} px={placed}"
    )


def resolve_src(assets: Path, candidates: tuple[str, ...]) -> Path:
    for name in candidates:
        path = assets / name
        if path.exists():
            return path
    raise SystemExit(f"Missing exhaust source (tried {candidates})")


def main() -> None:
    hero_path = FRAMES / HERO
    if not hero_path.exists():
        raise SystemExit(f"Missing {hero_path} — import idle-magenta first")

    assets = (
        Path(__file__).resolve().parents[3]
        / "src"
        / "companion"
        / "characters"
        / "bike"
        / "assets"
    )

    print(f"hero: {hero_path}")
    for out_name, candidates in EXHAUST_SOURCES:
        src = resolve_src(assets, candidates)
        composite_exhaust_on_hero(hero_path, src, FRAMES / out_name)
    print("done")


if __name__ == "__main__":
    main()
