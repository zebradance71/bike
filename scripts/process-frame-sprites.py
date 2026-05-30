"""Remove outer white background from generated frame PNGs.

Run: py -3 scripts/process-frame-sprites.py
"""
from __future__ import annotations

import importlib.util
import sys
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FRAMES = ROOT / "src/companion/assets/frames"

FLOOD_THRESH = 38
PAD = 4


def color_dist(rgb: tuple[int, int, int], bg: tuple[int, int, int]) -> float:
    return ((rgb[0] - bg[0]) ** 2 + (rgb[1] - bg[1]) ** 2 + (rgb[2] - bg[2]) ** 2) ** 0.5


def is_character_pixel(r: int, g: int, b: int) -> bool:
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    mx = max(r, g, b)
    if mx < 105:
        return True
    if lum < 120:
        return True
    if r < 95 and g < 105 and b < 125:
        return True
    return False


def solidify_character_pixels(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 32:
                continue
            if a >= 255:
                continue
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            sat = max(r, g, b) - min(r, g, b)
            if lum > 232 and sat < 30:
                continue
            px[x, y] = (r, g, b, 255)
    return im


def is_removable_background(r: int, g: int, b: int, bg: tuple[int, int, int]) -> bool:
    """White / gray studio BG, leg-gap fill, and resize halos — not cloth or eyes."""
    if is_character_pixel(r, g, b):
        return False
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    sat = max(r, g, b) - min(r, g, b)
    if color_dist((r, g, b), bg) < FLOOD_THRESH:
        return True
    # Leg-gap / floor shadow (often lum 155–175, barely below old cutoff)
    if lum > 152 and sat < 62:
        return True
    if lum > 228 and sat < 35:
        return True
    return False


def is_outer_background(r: int, g: int, b: int, bg: tuple[int, int, int]) -> bool:
    return is_removable_background(r, g, b, bg)


def sample_bg_color(im: Image.Image) -> tuple[int, int, int]:
    px = im.load()
    w, h = im.size
    corners = [px[2, 2], px[w - 3, 2], px[2, h - 3], px[w - 3, h - 3]]
    return (
        sum(c[0] for c in corners) // 4,
        sum(c[1] for c in corners) // 4,
        sum(c[2] for c in corners) // 4,
    )


def _flood_background_from_seeds(im: Image.Image, seeds: list[tuple[int, int]]) -> Image.Image:
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    bg = sample_bg_color(im)
    visited = [[False] * w for _ in range(h)]
    q: deque[tuple[int, int]] = deque(seeds)

    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or visited[y][x]:
            continue
        visited[y][x] = True
        r, g, b, a = px[x, y]
        if a == 0 or not is_outer_background(r, g, b, bg):
            continue
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            q.append((nx, ny))
    return im


def flood_clear(im: Image.Image) -> Image.Image:
    w, h = im.size
    seeds: list[tuple[int, int]] = []
    for x in range(w):
        seeds.append((x, 0))
        seeds.append((x, h - 1))
    for y in range(1, h - 1):
        seeds.append((0, y))
        seeds.append((w - 1, y))
    return _flood_background_from_seeds(im, seeds)


def clear_stray_light_pixels(im: Image.Image) -> Image.Image:
    """Drop light gray pixels trapped inside the silhouette (leg gaps, etc.)."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    bg = sample_bg_color(im)
    visited = [[False] * w for _ in range(h)]

    for y in range(h):
        for x in range(w):
            if visited[y][x]:
                continue
            r, g, b, a = px[x, y]
            if a == 0 or not is_removable_background(r, g, b, bg):
                continue
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            if lum < 140:
                continue

            component: list[tuple[int, int]] = []
            touches_edge = False
            q: deque[tuple[int, int]] = deque([(x, y)])
            visited[y][x] = True

            while q:
                cx, cy = q.popleft()
                component.append((cx, cy))
                if cx == 0 or cy == 0 or cx == w - 1 or cy == h - 1:
                    touches_edge = True
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if nx < 0 or ny < 0 or nx >= w or ny >= h or visited[ny][nx]:
                        continue
                    nr, ng, nb, na = px[nx, ny]
                    if na == 0 or not is_removable_background(nr, ng, nb, bg):
                        continue
                    nlum = 0.299 * nr + 0.587 * ng + 0.114 * nb
                    if nlum < 140:
                        continue
                    visited[ny][nx] = True
                    q.append((nx, ny))

            if not touches_edge:
                for cx, cy in component:
                    px[cx, cy] = (0, 0, 0, 0)

    return im


def peel_stray_background(im: Image.Image, passes: int = 4) -> Image.Image:
    """Remove background pixels touching transparency (halos / leg gaps)."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    bg = sample_bg_color(im)

    for _ in range(passes):
        to_clear: list[tuple[int, int]] = []
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a == 0 or not is_removable_background(r, g, b, bg):
                    continue
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                        to_clear.append((x, y))
                        break
        if not to_clear:
            break
        for x, y in to_clear:
            px[x, y] = (0, 0, 0, 0)
    return im


def clear_enclosed_pockets(im: Image.Image) -> Image.Image:
    """Remove background trapped between legs/arms (not reachable from corners)."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    bg = sample_bg_color(im)
    visited = [[False] * w for _ in range(h)]

    for y in range(h):
        for x in range(w):
            if visited[y][x]:
                continue
            r, g, b, a = px[x, y]
            if a == 0 or not is_removable_background(r, g, b, bg):
                continue
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            if lum < 140:
                continue

            component: list[tuple[int, int]] = []
            touches_edge = False
            q: deque[tuple[int, int]] = deque([(x, y)])
            visited[y][x] = True

            while q:
                cx, cy = q.popleft()
                component.append((cx, cy))
                if cx == 0 or cy == 0 or cx == w - 1 or cy == h - 1:
                    touches_edge = True
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if nx < 0 or ny < 0 or nx >= w or ny >= h or visited[ny][nx]:
                        continue
                    nr, ng, nb, na = px[nx, ny]
                    if na == 0 or not is_removable_background(nr, ng, nb, bg):
                        continue
                    nlum = 0.299 * nr + 0.587 * ng + 0.114 * nb
                    if nlum < 140:
                        continue
                    visited[ny][nx] = True
                    q.append((nx, ny))

            if not touches_edge:
                for cx, cy in component:
                    px[cx, cy] = (0, 0, 0, 0)

    return im


def load_smoke_module():
    path = ROOT / "scripts" / "import-smoke-sheet.py"
    spec = importlib.util.spec_from_file_location("import_smoke_sheet", path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["import_smoke_sheet"] = mod
    spec.loader.exec_module(mod)
    return mod


def process_image(
    im: Image.Image,
    mod,
    matte: tuple[int, int, int],
) -> Image.Image:
    im = flood_clear(im)
    im = clear_enclosed_pockets(im)
    im = clear_stray_light_pixels(im)
    im = peel_stray_background(im)
    im = fill_interior_holes(im)
    im = mod.straighten_alpha_rgba(im, matte)
    return mod.polish_sprite_edges(im, matte=matte)


def fill_interior_holes(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    bbox = im.getbbox()
    if not bbox:
        return im
    x0, y0, x1, y1 = bbox
    for _ in range(3):
        fills: list[tuple[int, int, int, int, int]] = []
        for y in range(y0, y1):
            for x in range(x0, x1):
                if px[x, y][3] > 0:
                    continue
                rs = gs = bs = n = 0
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if x0 <= nx < x1 and y0 <= ny < y1 and px[nx, ny][3] > 128:
                        r, g, b, _a = px[nx, ny]
                        rs += r
                        gs += g
                        bs += b
                        n += 1
                if n >= 3:
                    fills.append((x, y, rs // n, gs // n, bs // n))
        if not fills:
            break
        for x, y, r, g, b in fills:
            px[x, y] = (r, g, b, 255)
    return im


def trim_pad(im: Image.Image) -> Image.Image:
    bbox = im.getbbox()
    if not bbox:
        return im
    im = im.crop(bbox)
    w, h = im.size
    out = Image.new("RGBA", (w + PAD * 2, h + PAD * 2), (0, 0, 0, 0))
    out.paste(im, (PAD, PAD), im)
    return out


SKIP_RAW_STEMS = frozenset({"idle-base", "sit-rest"})
SKIP_RAW_PREFIXES = (
    "smoke-",
    "idle-glance-",
    "sit-enter-",
    "sit-med-",
)


def should_process_raw(raw: Path) -> bool:
    stem = raw.name.removesuffix("-raw.png")
    if stem in SKIP_RAW_STEMS:
        return False
    return not any(stem.startswith(p) for p in SKIP_RAW_PREFIXES)
def main() -> None:
    mod = load_smoke_module()
    FRAMES.mkdir(parents=True, exist_ok=True)
    for raw in sorted(FRAMES.glob("*-raw.png")):
        if not should_process_raw(raw):
            continue
        out = FRAMES / raw.name.replace("-raw", "")
        im = Image.open(raw)
        matte = mod.detect_matte_from_rgb(im.convert("RGB"))
        im = process_image(im, mod, matte)
        im.save(out, "PNG", optimize=True)
        print(f"  {out.name} <- {raw.name} ({im.size[0]}x{im.size[1]})")


if __name__ == "__main__":
    main()
