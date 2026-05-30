"""Polish existing walk-1..4 frames (geometry + readable micro-expressions).

Preserves pose and character art; adjusts head bob, COG, eyes, headband tails.

Run: py -3 scripts/polish-walk-frames.py
"""
from __future__ import annotations

import importlib.util
import sys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FRAMES = ROOT / "src/companion/assets/frames"

PAD = 4
HEAD_UP = -3  # paste_y offset (negative = head higher on canvas)
HEAD_DOWN = 3
BODY_SINK = 2
HEADBAND_SHIFT = 2


@dataclass
class FrameSpec:
    name: str
    head_dy: int
    body_extra_dy: int
    eye_mode: str  # "focus" | "calm"
    headband: str  # "left" | "down" | "right"


SPECS = [
    FrameSpec("walk-1", HEAD_UP, 0, "focus", "left"),
    FrameSpec("walk-2", HEAD_DOWN, BODY_SINK, "calm", "down"),
    FrameSpec("walk-3", HEAD_UP, 0, "focus", "right"),
    FrameSpec("walk-4", HEAD_DOWN, BODY_SINK, "calm", "down"),
]


def is_eye_pixel(r: int, g: int, b: int, a: int) -> bool:
    if a < 40:
        return False
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    return lum < 72 and max(r, g, b) - min(r, g, b) < 55


def is_headband_pixel(r: int, g: int, b: int, a: int) -> bool:
    if a < 40:
        return False
    return r > 115 and r > g * 1.35 and r > b * 1.35 and g < 120


def find_eye_boxes(im: Image.Image) -> list[tuple[int, int, int, int]]:
    w, h = im.size
    px = im.load()
    y0, y1 = int(h * 0.12), int(h * 0.52)
    xs: list[int] = []
    for y in range(y0, y1):
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_eye_pixel(r, g, b, a):
                xs.append(x)
    if not xs:
        return []
    mid = (min(xs) + max(xs)) // 2
    boxes: list[tuple[int, int, int, int]] = []
    for side in ("left", "right"):
        bx0, bx1 = (0, mid) if side == "left" else (mid, w)
        found = False
        x_min, x_max, y_min, y_max = w, 0, h, 0
        for y in range(y0, y1):
            for x in range(bx0, bx1):
                r, g, b, a = px[x, y]
                if is_eye_pixel(r, g, b, a):
                    found = True
                    x_min, x_max = min(x_min, x), max(x_max, x)
                    y_min, y_max = min(y_min, y), max(y_max, y)
        if found:
            pad = 3
            boxes.append(
                (
                    max(0, x_min - pad),
                    max(0, y_min - pad),
                    min(w, x_max + pad + 1),
                    min(h, y_max + pad + 1),
                )
            )
    return boxes


def eye_pixel_mask(patch: Image.Image) -> Image.Image:
    mask = Image.new("L", patch.size, 0)
    mpx = mask.load()
    ppx = patch.load()
    for y in range(patch.size[1]):
        for x in range(patch.size[0]):
            r, g, b, a = ppx[x, y]
            if is_eye_pixel(r, g, b, a) and a > 40:
                mpx[x, y] = min(255, a)
    return mask


def adjust_eyes(im: Image.Image, mode: str) -> None:
    boxes = find_eye_boxes(im)
    if len(boxes) < 2:
        return
    if mode == "focus":
        scale_x, shift_x = 0.82, 4
    else:
        scale_x, shift_x = 1.06, 0

    overlay = Image.new("RGBA", im.size, (0, 0, 0, 0))
    for x0, y0, x1, y1 in boxes:
        patch = im.crop((x0, y0, x1, y1))
        pw, ph = patch.size
        nw = max(4, int(pw * scale_x))
        scaled = patch.resize((nw, ph), Image.Resampling.LANCZOS)
        mask = eye_pixel_mask(scaled)
        ox = x0 + (pw - nw) // 2 + shift_x
        overlay.paste(scaled, (ox, y0), mask)
    im.alpha_composite(overlay)


def sway_headband(im: Image.Image, direction: str) -> None:
    """Shift headband knot/tails slightly (overlay only — no erase)."""
    w, h = im.size
    px = im.load()
    bx0, by0, bx1, by1 = w, h, 0, 0
    found = False
    for y in range(int(h * 0.34)):
        for x in range(int(w * 0.38)):
            r, g, b, a = px[x, y]
            if is_headband_pixel(r, g, b, a):
                found = True
                bx0, by0 = min(bx0, x), min(by0, y)
                bx1, by1 = max(bx1, x + 1), max(by1, y + 1)
    if not found:
        return

    box = (max(0, bx0 - 2), max(0, by0 - 2), min(w, bx1 + 2), min(h, by1 + 2))
    dx, dy = 0, 0
    if direction == "left":
        dx = -HEADBAND_SHIFT
    elif direction == "right":
        dx = HEADBAND_SHIFT
    elif direction == "down":
        dy = HEADBAND_SHIFT

    tail_patch = im.crop(box)
    mask = Image.new("L", tail_patch.size, 0)
    mpx = mask.load()
    tpx = tail_patch.load()
    for y in range(tail_patch.size[1]):
        for x in range(tail_patch.size[0]):
            r, g, b, a = tpx[x, y]
            if is_headband_pixel(r, g, b, a) and a > 40:
                mpx[x, y] = min(255, a)

    layer = Image.new("RGBA", im.size, (0, 0, 0, 0))
    layer.paste(tail_patch, (box[0] + dx, box[1] + dy), mask)
    im.alpha_composite(layer)


def foot_anchor_metrics(im: Image.Image) -> tuple[int, int, int, int]:
    bbox = im.getbbox()
    if not bbox:
        return im.size[0] // 2, im.size[1], 0, 0
    return (bbox[0] + bbox[2]) // 2, bbox[3], bbox[0], bbox[1]


def polish_frame(im: Image.Image, spec: FrameSpec) -> Image.Image:
    backup = im.copy()
    adjust_eyes(im, spec.eye_mode)
    sway_headband(im, spec.headband)

    dy = spec.head_dy + spec.body_extra_dy
    bbox = im.getbbox()
    if not bbox:
        return im
    cropped = im.crop(bbox)
    cw, ch = cropped.size
    foot_cx, _, _, _ = foot_anchor_metrics(im)
    foot_cx_rel = foot_cx - bbox[0]

    out_h = ch + abs(dy) + PAD * 2
    out_w = cw + PAD * 2
    out = Image.new("RGBA", (out_w, out_h), (0, 0, 0, 0))
    paste_x = PAD + (cw // 2 - foot_cx_rel)
    paste_y = out_h - PAD - ch + dy
    out.paste(cropped, (paste_x, paste_y), cropped)
    return out


def normalize_cycle(frames: list[Image.Image]) -> list[Image.Image]:
    metrics = [foot_anchor_metrics(f) for f in frames]
    max_w = max(f.size[0] for f in frames)
    max_h = max(f.size[1] for f in frames)
    foot_x = max(m[0] for m in metrics)
    foot_bottom = max(m[1] for m in metrics)

    unified: list[Image.Image] = []
    for im, (fcx, fbot, _, _) in zip(frames, metrics):
        bbox = im.getbbox()
        if not bbox:
            unified.append(im)
            continue
        cropped = im.crop(bbox)
        cw, ch = cropped.size
        canvas = Image.new("RGBA", (max_w, max_h), (0, 0, 0, 0))
        paste_x = foot_x - fcx
        paste_y = foot_bottom - fbot
        canvas.paste(cropped, (paste_x, paste_y), cropped)
        unified.append(canvas)
    return unified


def load_smoke_module():
    path = ROOT / "scripts" / "import-smoke-sheet.py"
    spec = importlib.util.spec_from_file_location("import_smoke_sheet", path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["import_smoke_sheet"] = mod
    spec.loader.exec_module(mod)
    return mod


def main() -> None:
    mod = load_smoke_module()
    FRAMES.mkdir(parents=True, exist_ok=True)
    polished: list[Image.Image] = []

    for spec in SPECS:
        path = FRAMES / f"{spec.name}.png"
        backup_path = FRAMES / f"{spec.name}-pre-polish.png"
        src_path = backup_path if backup_path.exists() else path
        im = Image.open(src_path).convert("RGBA")
        if not backup_path.exists():
            im.save(backup_path, optimize=True)
        out = polish_frame(im, spec)
        polished.append(out)
        print(f"  polished {spec.name} ({out.size[0]}x{out.size[1]}) dy={spec.head_dy + spec.body_extra_dy} eyes={spec.eye_mode} band={spec.headband}")

    unified = normalize_cycle(polished)
    for spec, im in zip(SPECS, unified):
        out_path = FRAMES / f"{spec.name}.png"
        clean = mod.finalize_frame(im)
        clean.save(out_path, optimize=True)
        print(f"  saved {out_path.name} ({clean.size[0]}x{clean.size[1]})")

    for name in ["peek-1", "peek-2", "peek-3"]:
        path = FRAMES / f"{name}.png"
        im = mod.finalize_frame(Image.open(path).convert("RGBA"))
        im.save(path, optimize=True)
        print(f"  sanitized {name}.png")


if __name__ == "__main__":
    main()
