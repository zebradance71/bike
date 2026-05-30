"""Import KUNAI throw frames + flying fx from #FF00FF magenta PNGs.

Workflow:
1. Generate magenta source PNGs (#FF00FF background, ninja FACING LEFT):
     assets/kunai-a-magenta.png    # 構え (windup, body only)
     assets/kunai-b-magenta.png    # 投擲 release (body only, NO weapon, NO fx)
     assets/kunai-c-magenta.png    # 残心 follow-through (body only)
     assets/kunai-fx-magenta.png   # flying kunai + speed lines (NO character)
2. py -3 scripts/import-kunai-from-magenta-cells.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from frame_import_common import (
    BBOX_PAD,
    FOOT_Y,
    FRAMES,
    GENERATION_PROMPT_SNIPPET,
    PAD_SIDE,
    SIZE,
    despill_magenta_fringe,
    import_magenta_cell,
    key_chroma_border,
    load_sheet_on_magenta,
    padded_bbox,
    reference_char_height,
)
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CURSOR_ASSETS = Path(
    r"C:\Users\strea\.cursor\projects\c-Users-strea-Develop-ToriiLabs-Ninja2\assets"
)


def resolve_assets_dir() -> Path:
    for candidate in (CURSOR_ASSETS, ROOT / "assets"):
        if (candidate / "kunai-a-magenta.png").exists():
            return candidate
    if CURSOR_ASSETS.exists():
        return CURSOR_ASSETS
    return ROOT / "assets"


BODY_CELLS: tuple[tuple[str, str], ...] = (
    ("kunai-a-magenta.png", "kunai-a.png"),
    ("kunai-b-magenta.png", "kunai-b.png"),
    ("kunai-c-magenta.png", "kunai-c.png"),
)
FX_SRC = "kunai-fx-magenta.png"

# fx is rendered onto a WIDE canvas (3x normal width). At runtime the image is
# CSS object-fit:contain'd into a viewport whose width grows by ~2× sprite
# render-px during the kunai action, so the kunai can fly far to the LEFT
# beyond the original sprite tile without changing other actions' assets.
FX_CANVAS_W = SIZE * 3  # 1536
FX_CANVAS_H = SIZE  # 512

# Big chunky kunai (大げさ): vertical span ~ 55% of idle char height.
FX_HEIGHT_FRAC = 0.55
# Hand height in idle-char-space (relative to char_top).
FX_CENTER_Y_FRAC = 0.46

# Flight frames produced from the SAME magenta source. Each frame shifts the
# kunai's tip LEFT and fades alpha to suggest the kunai vanishing.
# tip_x_frac is in WIDE-canvas-fraction (0.0 = left edge of 1536px canvas,
# which corresponds to the LEFT edge of the expanded viewport at runtime).
# alpha is the global multiplier applied to the rendered fx (0..1).
FX_FLIGHT: tuple[tuple[str, float, float], ...] = (
    ("kunai-fx-1.png", 0.44, 1.00),
    ("kunai-fx-2.png", 0.28, 1.00),
    ("kunai-fx-3.png", 0.12, 0.85),
    ("kunai-fx-4.png", 0.02, 0.40),
)


def compose_kunai_fx(
    keyed: Image.Image, *, idle_h: int, tip_x_frac: float, alpha: float
) -> Image.Image:
    canvas = Image.new("RGBA", (FX_CANVAS_W, FX_CANVAS_H), (0, 0, 0, 0))
    box = padded_bbox(keyed, BBOX_PAD)
    if not box:
        return canvas
    region = keyed.crop(box)
    inner = region.getbbox()
    if not inner:
        return canvas
    fx = region.crop(inner)
    if fx.width <= 0 or fx.height <= 0:
        return canvas

    # Scale by HEIGHT against idle-char-height so fx feels physical.
    target_h = max(1, int(round(idle_h * FX_HEIGHT_FRAC)))
    scale = target_h / fx.height
    nw = max(1, int(round(fx.width * scale)))
    nh = max(1, int(round(fx.height * scale)))
    scaled = fx.resize((nw, nh), Image.Resampling.LANCZOS)

    if alpha < 0.999:
        a = scaled.split()[-1]
        a = a.point(lambda v: int(v * max(0.0, min(1.0, alpha))))
        scaled.putalpha(a)

    char_top = FOOT_Y - idle_h
    cy = char_top + int(round(idle_h * FX_CENTER_Y_FRAC))

    # Tip is the LEFT edge of fx bbox (kunai points left). tip_x_frac maps
    # directly into runtime viewport-x via object-fit:contain, so the same
    # frac is the kunai's horizontal position in the visible viewport too.
    tip_x = int(round(FX_CANVAS_W * tip_x_frac))
    x = tip_x
    y = cy - nh // 2

    # Clip paste box to canvas so PIL doesn't error on negative x.
    if x + nw <= 0 or x >= FX_CANVAS_W:
        return canvas
    canvas.paste(scaled, (x, y), scaled)
    return canvas


def import_kunai_fx(src_path: Path, *, idle_h: int) -> None:
    sheet = load_sheet_on_magenta(src_path)
    keyed = key_chroma_border(sheet)
    for out_name, tip_x_frac, alpha in FX_FLIGHT:
        print(
            f"  import: {src_path.name} -> {out_name}"
            f"  tip_x={tip_x_frac:+.2f}  alpha={alpha:.2f}"
        )
        frame = compose_kunai_fx(
            keyed, idle_h=idle_h, tip_x_frac=tip_x_frac, alpha=alpha
        )
        frame = despill_magenta_fringe(frame)
        frame.save(FRAMES / out_name, format="PNG")
        bb = frame.getbbox()
        print(f"        -> {out_name}  fx_bbox={bb}")


def main() -> None:
    assets = resolve_assets_dir()
    print(f"assets: {assets}")
    print(f"out:    {FRAMES}")
    print(f"prompt: {GENERATION_PROMPT_SNIPPET}")

    missing = [s for s, _ in BODY_CELLS if not (assets / s).exists()]
    if not (assets / FX_SRC).exists():
        missing.append(FX_SRC)
    if missing:
        raise SystemExit(
            "Missing magenta cells - generate first:\n  " + "\n  ".join(missing)
        )

    for src_name, out_name in BODY_CELLS:
        import_magenta_cell(assets / src_name, out_name)

    idle_h = reference_char_height(FRAMES)
    import_kunai_fx(assets / FX_SRC, idle_h=idle_h)
    print("done")


if __name__ == "__main__":
    main()
