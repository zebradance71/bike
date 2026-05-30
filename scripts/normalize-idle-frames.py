"""Align presence frames to idle-1: same canvas, same character height, same foot anchor.

Prevents size jump when swapping idle / look / blink at 64px.

Run: py -3 scripts/normalize-idle-frames.py
"""
from __future__ import annotations

import importlib.util
import sys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FRAMES = ROOT / "src/companion/assets/frames"
BODY_REF = "idle-1"
BODY_NAMES = [
    "idle-2",
    "idle-3",
    "idle-4",
    "blink",
    "look-1",
    "look-2",
    "look-3",
    "look-4",
    "walk-1",
    "walk-2",
    "walk-3",
    "walk-4",
    "sit-1",
    "sit-2",
]
PEEK_REF = "peek-2"
PEEK_NAMES = ["peek-1", "peek-2", "peek-3"]
PAD = 4

# Same foot anchor + char height as idle-1 (no per-frame scale bump — causes dev I glance jump).
EXTRA_SCALE: dict[str, float] = {}


def load_smoke_module():
    path = ROOT / "scripts" / "import-smoke-sheet.py"
    spec = importlib.util.spec_from_file_location("import_smoke_sheet", path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["import_smoke_sheet"] = mod
    spec.loader.exec_module(mod)
    return mod


def load(name: str) -> Image.Image:
    return Image.open(FRAMES / f"{name}.png").convert("RGBA")


def crop_bbox(im: Image.Image) -> tuple[Image.Image, tuple[int, int, int, int]]:
    bbox = im.getbbox()
    if not bbox:
        return im, (0, 0, im.size[0], im.size[1])
    return im.crop(bbox), bbox


@dataclass
class FrameLayout:
    name: str
    scaled: Image.Image
    nw: int
    nh: int
    paste_x: int
    paste_y: int
    scale: float


def plan_layouts(
    names: list[str],
    ref_name: str,
    anchor_foot_x: int,
    anchor_foot_y: int,
    smoke,
) -> tuple[int, int, int, int, list[FrameLayout]]:
    ref_im = load(ref_name)
    _, ref_bbox = crop_bbox(ref_im)
    ref_h = ref_bbox[3] - ref_bbox[1]
    canvas_h = ref_im.size[1]

    print(f"  ref {ref_name}: char_h={ref_h} anchor=({anchor_foot_x},{anchor_foot_y})")

    planned: list[FrameLayout] = []
    for name in names:
        im = load(name)
        crop, bbox = crop_bbox(im)
        ch = bbox[3] - bbox[1]
        cw = bbox[2] - bbox[0]
        if ch < 1:
            continue

        scale = (ref_h / ch) * EXTRA_SCALE.get(name, 1.0)
        nh = ref_h
        nw = max(1, round(cw * scale))
        if (nw, nh) == crop.size:
            scaled = crop
        else:
            scaled = crop.resize((nw, nh), Image.Resampling.LANCZOS)
        paste_x = anchor_foot_x - nw // 2
        paste_y = anchor_foot_y - ref_h
        planned.append(FrameLayout(name, scaled, nw, nh, paste_x, paste_y, scale))

    min_x = min(f.paste_x for f in planned)
    max_x = max(f.paste_x + f.nw for f in planned)
    canvas_w = max_x - min_x + PAD * 2
    shift_x = PAD - min_x

    layouts: list[FrameLayout] = []
    for f in planned:
        layouts.append(
            FrameLayout(
                f.name,
                f.scaled,
                f.nw,
                f.nh,
                f.paste_x + shift_x,
                f.paste_y,
                f.scale,
            )
        )

    anchor_foot_x_out = anchor_foot_x + shift_x
    return canvas_w, canvas_h, anchor_foot_x_out, anchor_foot_y, layouts


def normalize_set(
    names: list[str],
    ref_name: str,
    anchor_foot_x: int,
    anchor_foot_y: int,
    smoke,
) -> tuple[int, int]:
    canvas_w, canvas_h, anchor_foot_x, anchor_foot_y, layouts = plan_layouts(
        names, ref_name, anchor_foot_x, anchor_foot_y, smoke
    )
    print(f"  canvas {canvas_w}x{canvas_h} foot=({anchor_foot_x},{anchor_foot_y})")

    for f in layouts:
        out = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        out.paste(f.scaled, (f.paste_x, f.paste_y), f.scaled)
        path = FRAMES / f"{f.name}.png"
        smoke.save_display_frame(out, path)
        print(
            f"  {f.name}.png scale={f.scale:.3f} paste=({f.paste_x},{f.paste_y}) size={f.nw}x{f.nh}"
        )

    return canvas_w, canvas_h


def main() -> None:
    smoke = load_smoke_module()
    body_ref = load(BODY_REF)
    _, body_bbox = crop_bbox(body_ref)
    anchor_foot_x = body_ref.size[0] // 2
    anchor_foot_y = body_bbox[3]

    print("body")
    body_canvas_w, body_canvas_h = normalize_set(
        BODY_NAMES, BODY_REF, anchor_foot_x, anchor_foot_y, smoke
    )

    print("peek")
    normalize_set(PEEK_NAMES, PEEK_REF, body_canvas_w // 2, anchor_foot_y, smoke)


if __name__ == "__main__":
    main()
