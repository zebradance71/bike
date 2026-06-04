"""Bake rear-tire smoke into block-run-*.png (block chase animation)."""
from __future__ import annotations

import importlib.util
from pathlib import Path

import _paths  # noqa: F401

from PIL import Image

from frame_import_common import SIZE, key_chroma_border, load_sheet_on_magenta
from resolve_paths import frames_dir

FRAMES = frames_dir()
BIKE_ASSETS = (
    Path(__file__).resolve().parents[3]
    / "src"
    / "companion"
    / "characters"
    / "bike"
    / "assets"
)

DISPLAY_TIRE_A = (70, 48)
DISPLAY_TIRE_B = (88, 58)

RUN_FRAMES = (
    ("block-run-a.png", "block-tire-smoke-a-smoke-only-magenta.png", DISPLAY_TIRE_A),
    ("block-run-b.png", "block-tire-smoke-b-smoke-only-magenta.png", DISPLAY_TIRE_B),
    ("block-run-c.png", "block-tire-smoke-a-smoke-only-magenta.png", DISPLAY_TIRE_A),
    ("block-run-d.png", "block-tire-smoke-b-smoke-only-magenta.png", DISPLAY_TIRE_B),
)


def _load_exhaust_helpers():
    path = Path(__file__).with_name("composite-exhaust-on-idle.py")
    spec = importlib.util.spec_from_file_location("composite_exhaust_on_idle", path)
    if not spec or not spec.loader:
        raise RuntimeError("composite-exhaust-on-idle.py not found")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def rear_wheel_anchor(hero_bb: tuple[int, int, int, int]) -> tuple[int, int]:
    hx0, hy0, hx1, hy1 = hero_bb
    w = hx1 - hx0
    h = hy1 - hy0
    ax = hx0 + max(10, int(w * 0.20))
    ay = hy1 - max(8, int(h * 0.11))
    return ax, ay


def composite_tire_smoke_on_frame(
    frame_path: Path,
    smoke_magenta_path: Path,
    display_size: tuple[int, int],
    helpers,
) -> None:
    hero = Image.open(frame_path).convert("RGBA")
    hero_bb = hero.getbbox()
    if not hero_bb:
        raise SystemExit(f"empty frame: {frame_path}")

    wheel_x, wheel_y = rear_wheel_anchor(hero_bb)
    hx0, _, hx1, _ = hero_bb
    front_limit_x = hx0 + int((hx1 - hx0) * 0.55)

    keyed = key_chroma_border(load_sheet_on_magenta(smoke_magenta_path))
    smoke = helpers.smoke_crop_from_keyed(keyed)
    if smoke is None:
        raise SystemExit(f"no smoke in {smoke_magenta_path.name}")

    smoke = helpers.scale_smoke_to_display(smoke, display_size[0], display_size[1])
    sw, sh = smoke.size
    paste_x = wheel_x - int(sw * 0.72)
    paste_y = wheel_y - int(sh * 0.5)

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
            if la < 16 or not helpers.is_smoke_pixel(lr, lg, lb):
                continue
            hr, hg, hb, ha = rpx[x, y]
            if ha < 16:
                rpx[x, y] = (lr, lg, lb, min(255, la + 56))
            else:
                a = min(1.0, (la + 64) / 255.0)
                rpx[x, y] = (
                    int(lr * a + hr * (1 - a)),
                    int(lg * a + hg * (1 - a)),
                    int(lb * a + hb * (1 - a)),
                    min(255, max(ha, la + 28)),
                )
            placed += 1

    result.save(frame_path, format="PNG")
    print(
        f"  tire smoke {smoke_magenta_path.name} -> {frame_path.name}  "
        f"wheel=({wheel_x},{wheel_y}) paste=({paste_x},{paste_y}) px={placed}"
    )


def main() -> None:
    helpers = _load_exhaust_helpers()
    for frame_name, smoke_name, size in RUN_FRAMES:
        frame_path = FRAMES / frame_name
        smoke_path = BIKE_ASSETS / smoke_name
        if not frame_path.exists():
            raise SystemExit(f"Missing {frame_path} — run import-block-run first")
        if not smoke_path.exists():
            raise SystemExit(f"Missing {smoke_path}")
        composite_tire_smoke_on_frame(frame_path, smoke_path, size, helpers)
    print("done")


if __name__ == "__main__":
    main()
