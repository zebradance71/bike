"""Import KUNAI throw frames + flying fx from #FF00FF magenta PNGs."""
from __future__ import annotations

from pathlib import Path

import _paths  # noqa: F401

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
from resolve_paths import resolve_assets_dir

BODY_CELLS: tuple[tuple[str, str], ...] = (
    ("kunai-a-magenta.png", "kunai-a.png"),
    ("kunai-b-magenta.png", "kunai-b.png"),
    ("kunai-c-magenta.png", "kunai-c.png"),
)
FX_SRC = "kunai-fx-magenta.png"

FX_CANVAS_W = SIZE * 3
FX_CANVAS_H = SIZE
FX_HEIGHT_FRAC = 0.55
FX_CENTER_Y_FRAC = 0.46

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
    tip_x = int(round(FX_CANVAS_W * tip_x_frac))
    x = tip_x
    y = cy - nh // 2

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
    assets = resolve_assets_dir("kunai-a-magenta.png")
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
