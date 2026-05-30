"""Load canonical app/tray icon master (256px RGBA square)."""
from __future__ import annotations

from collections import deque
from pathlib import Path

try:
    from PIL import Image
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "Pillow is required. Install with `py -3 -m pip install Pillow`."
    ) from exc

from frame_import_common import is_black_bg
from icon_from_svg import compose_square_nearest, load_icon_master as load_icon_master_svg
from resolve_paths import app_icon_png_path, app_icon_svg_path, idle_frame_path

MASTER_PX = 256
ICON_PAD_RATIO = 0.06


def key_black_border(img: Image.Image, threshold: int = 32) -> Image.Image:
    """Flood-fill near-black border (corners) to transparent."""
    rgba = img.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()
    assert px is not None
    seen = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()

    def push(x: int, y: int) -> None:
        idx = y * w + x
        if seen[idx]:
            return
        r, g, b, a = px[x, y]
        if a < 8 or not is_black_bg(r, g, b, threshold):
            return
        seen[idx] = 1
        q.append((x, y))

    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(h):
        push(0, y)
        push(w - 1, y)

    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        if x > 0:
            push(x - 1, y)
        if x + 1 < w:
            push(x + 1, y)
        if y > 0:
            push(x, y - 1)
        if y + 1 < h:
            push(x, y + 1)

    return rgba


def _master_from_png(src: Path, master_px: int) -> Image.Image:
    img = key_black_border(Image.open(src))
    bbox = img.getbbox()
    if bbox is None:
        raise SystemExit(f"{src.name} has no visible pixels after background key")

    cropped = img.crop(bbox)
    pad = max(2, int(max(cropped.size) * ICON_PAD_RATIO))
    side = max(cropped.size) + pad * 2
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    ox = (side - cropped.size[0]) // 2
    oy = (side - cropped.size[1]) // 2
    square.paste(cropped, (ox, oy), cropped)
    return square.resize((master_px, master_px), Image.LANCZOS)


def _master_from_idle(master_px: int) -> Image.Image:
    src = idle_frame_path()
    if not src.exists():
        raise SystemExit(f"idle source not found: {src}")

    img = Image.open(src).convert("RGBA")
    bbox = img.getbbox()
    if bbox is None:
        raise SystemExit("idle.png is fully transparent; nothing to crop")
    cropped = img.crop(bbox)

    side = max(cropped.size)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    ox = (side - cropped.size[0]) // 2
    oy = (side - cropped.size[1]) // 2
    square.paste(cropped, (ox, oy), cropped)
    return square.resize((master_px, master_px), Image.LANCZOS)


def resolve_icon_source() -> Path:
    png = app_icon_png_path()
    if png.exists():
        return png
    svg = app_icon_svg_path()
    if svg.exists():
        return svg
    return idle_frame_path()


def load_icon_master(master_px: int = MASTER_PX) -> tuple[Image.Image, Path]:
    png = app_icon_png_path()
    if png.exists():
        return _master_from_png(png, master_px), png

    svg = app_icon_svg_path()
    if svg.exists():
        return load_icon_master_svg(svg, master_px), svg

    idle = idle_frame_path()
    return _master_from_idle(master_px), idle
