"""Remove outer background + bottom beige only. Face/eyes/feet protected.

Source: char-concept-e-refined-original.png (never the broken output)
Run: py -3 scripts/process-ninja-sprite.py
"""
from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "design/char-concepts/images/char-concept-e-refined-original.png"
OUTPUTS = [
    ROOT / "src/companion/assets/char-concept-e-refined.png",
    ROOT / "design/char-concepts/images/char-concept-e-refined.png",
]

FLOOD_THRESH = 38
PAD = 3
SHADOW_ALPHA = 34
# Only the soft floor shadow band under the boots
FEET_ZONE_START = 0.9


def color_dist(rgb: tuple[int, int, int], bg: tuple[int, int, int]) -> float:
    return ((rgb[0] - bg[0]) ** 2 + (rgb[1] - bg[1]) ** 2 + (rgb[2] - bg[2]) ** 2) ** 0.5


def is_character_pixel(r: int, g: int, b: int) -> bool:
    """Navy boots, hood, mask — never delete."""
    if max(r, g, b) < 105:
        return True
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    if lum < 115:
        return True
    if r < 95 and g < 105 and b < 125:
        return True
    return False


def is_outer_background(r: int, g: int, b: int, bg: tuple[int, int, int]) -> bool:
    if is_character_pixel(r, g, b):
        return False
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    sat = max(r, g, b) - min(r, g, b)
    if color_dist((r, g, b), bg) < FLOOD_THRESH:
        return True
    if lum > 228 and sat < 35:
        return True
    return False


def is_floor_shadow_pixel(
    r: int, g: int, b: int, bg: tuple[int, int, int]
) -> bool:
    """Light cream/tan oval under feet only — not navy boots."""
    if is_character_pixel(r, g, b):
        return False
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    sat = max(r, g, b) - min(r, g, b)
    if lum < 168:
        return False
    if color_dist((r, g, b), bg) < 52:
        return True
    if lum > 188 and sat < 55 and min(r, g, b) > 115:
        return True
    return False


def flood_clear_outer_background(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    corners = [px[2, 2], px[w - 3, 2], px[2, h - 3], px[w - 3, h - 3]]
    bg = (
        sum(c[0] for c in corners) // 4,
        sum(c[1] for c in corners) // 4,
        sum(c[2] for c in corners) // 4,
    )

    visited = [[False] * w for _ in range(h)]
    q: deque[tuple[int, int]] = deque([(2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3)])

    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or visited[y][x]:
            continue
        visited[y][x] = True
        r, g, b, a = px[x, y]
        if a == 0 or not is_outer_background(r, g, b, bg):
            continue
        px[x, y] = (0, 0, 0, 0)
        q.append((x + 1, y))
        q.append((x - 1, y))
        q.append((x, y + 1))
        q.append((x, y - 1))

    return im


def strip_floor_shadow_only(im: Image.Image) -> Image.Image:
    """Bottom edge: remove light shadow, never dark boots."""
    px = im.load()
    w, h = im.size
    y_min = int(h * FEET_ZONE_START)
    bg = (
        (px[2, h - 3][0] + px[w - 3, h - 3][0]) // 2,
        (px[2, h - 3][1] + px[w - 3, h - 3][1]) // 2,
        (px[2, h - 3][2] + px[w - 3, h - 3][2]) // 2,
    )

    visited = [[False] * w for _ in range(h)]
    q: deque[tuple[int, int]] = deque()

    for x in range(w):
        y = h - 1
        r, g, b, a = px[x, y]
        if a and is_floor_shadow_pixel(r, g, b, bg):
            q.append((x, y))

    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or y < y_min or visited[y][x]:
            continue
        visited[y][x] = True
        r, g, b, a = px[x, y]
        if a == 0 or not is_floor_shadow_pixel(r, g, b, bg):
            continue
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y - 1)):
            if ny >= y_min:
                q.append((nx, ny))

    return im


def trim_and_pad(im: Image.Image) -> Image.Image:
    bbox = im.getbbox()
    if not bbox:
        return im
    im = im.crop(bbox)
    w, h = im.size
    out = Image.new("RGBA", (w + PAD * 2, h + PAD * 2), (0, 0, 0, 0))
    out.paste(im, (PAD, PAD), im)
    return out


def add_foot_shadow(im: Image.Image) -> Image.Image:
    w, h = im.size
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    draw.ellipse(
        (int(w * 0.2), h - 4, int(w * 0.8), h - 1),
        fill=(40, 48, 64, SHADOW_ALPHA),
    )
    return Image.alpha_composite(layer, im)


def process_source(src: Path, dst: Path) -> None:
    if not src.exists():
        raise FileNotFoundError(f"Missing source: {src}")
    im = Image.open(src)
    im = flood_clear_outer_background(im)
    im = strip_floor_shadow_only(im)
    im = trim_and_pad(im)
    im = add_foot_shadow(im)
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, "PNG", optimize=True)
    print(f"OK {dst.name} -> {im.size[0]}x{im.size[1]}")


def main() -> None:
    for out in OUTPUTS:
        process_source(SOURCE, out)


if __name__ == "__main__":
    main()
