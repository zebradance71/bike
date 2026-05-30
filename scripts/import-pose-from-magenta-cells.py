"""Import pose (P / peek) frames from #FF00FF magenta cells.

Workflow (same as S / Shift+S / M):
  1. py -3 scripts/extract-pose-cell-refs.py  -> assets/pose-ref/peek-N-ref.png
  2. Attach each *-ref.png and generate ONE magenta PNG per pose:
       assets/peek-1-magenta.png, peek-2-magenta.png, peek-3-magenta.png
     Prompt: solid #FF00FF magenta background only, no transparency, no black, no checkerboard
  3. py -3 scripts/import-pose-from-magenta-cells.py

Peek-specific compose:
  - The head should appear at the BOTTOM of the 512x512 canvas (looks like the
    ninja is peeking up from below the window edge).
  - Scale head width to a fixed fraction of idle char width (no idle-height stretch).
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from frame_import_common import (
    BBOX_PAD,
    FRAMES,
    GENERATION_PROMPT_SNIPPET,
    SIZE,
    despill_magenta_fringe,
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

CELLS: tuple[tuple[str, str], ...] = (
    ("peek-1-magenta.png", "peek-1.png"),
    ("peek-2-magenta.png", "peek-2.png"),
    ("peek-3-magenta.png", "peek-3.png"),
)

PEEK_HEAD_W_FRAC = 1.50
PEEK_BOTTOM_MARGIN = 6


def resolve_assets_dir() -> Path:
    for candidate in (CURSOR_ASSETS, ROOT / "assets"):
        if (candidate / "peek-1-magenta.png").exists():
            return candidate
    if CURSOR_ASSETS.exists():
        return CURSOR_ASSETS
    return ROOT / "assets"


def reference_char_width(frames_dir: Path) -> int:
    for name in ("idle.png",):
        path = frames_dir / name
        if not path.exists():
            continue
        im = Image.open(path).convert("RGBA")
        bb = im.getbbox()
        if bb:
            return bb[2] - bb[0]
    return SIZE // 2


def compose_peek(keyed: Image.Image, *, target_w: int) -> Image.Image:
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    box = padded_bbox(keyed, BBOX_PAD)
    if not box:
        return canvas

    region = keyed.crop(box)
    inner = region.getbbox()
    if not inner:
        return canvas

    head = region.crop(inner)
    if head.width <= 0 or head.height <= 0:
        return canvas

    scale = target_w / head.width
    nw = max(1, int(round(head.width * scale)))
    nh = max(1, int(round(head.height * scale)))
    scaled = head.resize((nw, nh), Image.Resampling.LANCZOS)

    y_bottom = SIZE - PEEK_BOTTOM_MARGIN
    y = y_bottom - nh
    x = (SIZE - nw) // 2
    canvas.paste(scaled, (x, y), scaled)
    return canvas


def import_peek_cell(src_path: Path, out_name: str, *, target_w: int) -> None:
    print(f"  import: {src_path.name} -> {out_name}")
    sheet = load_sheet_on_magenta(src_path)
    keyed = key_chroma_border(sheet)
    frame = compose_peek(keyed, target_w=target_w)
    frame = despill_magenta_fringe(frame)
    frame.save(FRAMES / out_name, format="PNG")
    bb = frame.getbbox()
    ch = bb[3] - bb[1] if bb else 0
    print(
        f"        -> {out_name}  head_h={ch}  top={bb[1] if bb else '?'}  "
        f"foot_margin={frame.size[1] - bb[3] if bb else '?'}"
    )


def main() -> None:
    assets = resolve_assets_dir()
    print(f"assets: {assets}")
    print(f"out:    {FRAMES}")
    print(f"prompt: {GENERATION_PROMPT_SNIPPET}")

    idle_w = reference_char_width(FRAMES)
    idle_h = reference_char_height(FRAMES)
    target_w = max(1, int(round(idle_w * PEEK_HEAD_W_FRAC)))
    print(f"idle char wxh = {idle_w}x{idle_h}  peek head_w = {target_w}")

    missing = [s for s, _ in CELLS if not (assets / s).exists()]
    if missing:
        raise SystemExit(
            "Missing magenta cells - generate from pose-ref/*-ref.png first:\n  "
            + "\n  ".join(missing)
        )

    for src_name, out_name in CELLS:
        import_peek_cell(assets / src_name, out_name, target_w=target_w)

    print("done")


if __name__ == "__main__":
    main()
