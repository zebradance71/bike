"""Import idle-base + smoke frames from the 2×3 sheet (black BG → transparent).

Usage:
  py -3 scripts/import-smoke-sheet.py [path-to-sheet.png]

Grid (2×3):
  TL idle-base / smoke-base   TR smoke-start
  ML smoke-run                MR smoke-only
  BL reserve (skip)             BR smoke-arrive
"""
from __future__ import annotations

import shutil
import sys
from collections import deque
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
FRAMES = ROOT / "src/companion/assets/frames"
DESIGN = ROOT / "design"
DEFAULT_SHEET = DESIGN / "smoke-sheet-source.png"

PAD = 4
BLACK_MAX = 44
FLOOD_GRAY_MAX = 72
# spriteRenderPx tiers (48/64/96 * SPRITE_RENDER_SCALE 1.1) — PNG height must match to avoid browser speckles
DISPLAY_SHIP_HEIGHTS: tuple[int, ...] = (53, 70, 106)
IDLE_BASE_NAME = "idle-base"
IDLE_TIGHT_NAME = "idle-base-tight"
IDLE_REF_NAME = "idle-1"

CELLS: list[tuple[str, int, int]] = [
    ("smoke-base", 0, 0),
    ("smoke-start", 1, 0),
    ("smoke-run", 0, 1),
    ("smoke-only", 1, 1),
    ("smoke-arrive", 1, 2),
]

# Sheet cells with baked ninja — raw archive only, not used as M decor in app.
SMOKE_SHEET_NAMES = ["smoke-start", "smoke-run", "smoke-only", "smoke-arrive"]
SMOKE_DECOR_NAME = "smoke-only"


def strip_character_pixels(im: Image.Image) -> Image.Image:
    """Remove navy ninja silhouette from smoke decor (keep clouds / red wisps)."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 12:
                continue
            if is_dark_character(r, g, b):
                px[x, y] = (0, 0, 0, 0)
    return polish_sprite_edges(im)


def is_dark_character(r: int, g: int, b: int) -> bool:
    """Navy suit / ink — distinguish from neutral sheet black (#000)."""
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    mx = max(r, g, b)
    mn = min(r, g, b)
    sat = mx - mn
    if lum < 60:
        if sat >= 5:
            return True
        if b > r + 3 or g > r + 3:
            return True
        return False
    return lum < 105 or mx < 105


def is_smoke_or_character(r: int, g: int, b: int) -> bool:
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    sat = max(r, g, b) - min(r, g, b)
    if is_dark_character(r, g, b):
        return True
    if r > 108 and r > g * 1.28 and g < 125:
        return True
    if lum > 145 and sat < 55:
        return True
    return False


def is_sheet_background(r: int, g: int, b: int) -> bool:
    """Edge-connected sheet black / gray — removed by flood from borders."""
    if is_smoke_or_character(r, g, b):
        return False
    return max(r, g, b) <= FLOOD_GRAY_MAX


def is_peelable_halo(r: int, g: int, b: int) -> bool:
    """Gray anti-alias fringe only — never pure-black character outlines."""
    if is_smoke_or_character(r, g, b):
        return False
    mx = max(r, g, b)
    if mx <= BLACK_MAX:
        return False
    return mx <= FLOOD_GRAY_MAX


def flood_clear_black(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    visited = [[False] * w for _ in range(h)]
    q: deque[tuple[int, int]] = deque()

    for x in range(w):
        q.append((x, 0))
        q.append((x, h - 1))
    for y in range(1, h - 1):
        q.append((0, y))
        q.append((w - 1, y))

    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or visited[y][x]:
            continue
        visited[y][x] = True
        r, g, b, a = px[x, y]
        if a == 0 or not is_sheet_background(r, g, b):
            continue
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            q.append((nx, ny))
    return im


def peel_black_halo(im: Image.Image, passes: int = 5) -> Image.Image:
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    for _ in range(passes):
        to_clear: list[tuple[int, int]] = []
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a == 0 or not is_peelable_halo(r, g, b):
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


def resize_sprite(im: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Premultiplied upscale — keeps smooth alpha, no interior bleed."""
    im = im.convert("RGBA")
    if im.size == size:
        return polish_sprite_edges(im)

    w, h = im.size
    px = im.load()
    premul = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ppx = premul.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 8:
                continue
            k = a / 255.0
            ppx[x, y] = (int(r * k), int(g * k), int(b * k), a)

    scaled = premul.resize(size, Image.Resampling.LANCZOS)
    sw, sh = scaled.size
    spx = scaled.load()
    out = Image.new("RGBA", (sw, sh), (0, 0, 0, 0))
    opx = out.load()
    for y in range(sh):
        for x in range(sw):
            r, g, b, a = spx[x, y]
            if a < 6:
                continue
            k = a / 255.0
            opx[x, y] = (
                min(255, int(r / k)),
                min(255, int(g / k)),
                min(255, int(b / k)),
                a,
            )
    return polish_sprite_edges(out)


def remove_small_components(im: Image.Image, min_pixels: int = 20) -> Image.Image:
    """Drop stray blobs disconnected from the main silhouette."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    visited = [[False] * w for _ in range(h)]
    components: list[list[tuple[int, int]]] = []

    for y in range(h):
        for x in range(w):
            if visited[y][x] or px[x, y][3] < 128:
                continue
            q: deque[tuple[int, int]] = deque([(x, y)])
            visited[y][x] = True
            cells: list[tuple[int, int]] = []
            while q:
                cx, cy = q.popleft()
                cells.append((cx, cy))
                for nx, ny in (
                    (cx + 1, cy),
                    (cx - 1, cy),
                    (cx, cy + 1),
                    (cx, cy - 1),
                    (cx + 1, cy + 1),
                    (cx - 1, cy - 1),
                    (cx + 1, cy - 1),
                    (cx - 1, cy + 1),
                ):
                    if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx] and px[nx, ny][3] >= 128:
                        visited[ny][nx] = True
                        q.append((nx, ny))
            components.append(cells)

    if not components:
        return im
    components.sort(key=len, reverse=True)
    keep: set[tuple[int, int]] = set()
    for i, cells in enumerate(components):
        if i == 0 or len(cells) >= min_pixels:
            keep.update(cells)
    for y in range(h):
        for x in range(w):
            if px[x, y][3] >= 128 and (x, y) not in keep:
                px[x, y] = (0, 0, 0, 0)
    return im


def remove_isolated_opaque(im: Image.Image, min_neighbors: int = 4) -> Image.Image:
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    for _ in range(4):
        to_clear: list[tuple[int, int]] = []
        for y in range(1, h - 1):
            for x in range(1, w - 1):
                if px[x, y][3] < 128:
                    continue
                n = sum(
                    1
                    for nx, ny in (
                        (x + 1, y),
                        (x - 1, y),
                        (x, y + 1),
                        (x, y - 1),
                        (x + 1, y + 1),
                        (x - 1, y - 1),
                        (x + 1, y - 1),
                        (x - 1, y + 1),
                    )
                    if px[nx, ny][3] >= 128
                )
                if n < min_neighbors:
                    to_clear.append((x, y))
        if not to_clear:
            break
        for x, y in to_clear:
            px[x, y] = (0, 0, 0, 0)
    return im


def defringe_dark(im: Image.Image, passes: int = 3) -> Image.Image:
    """Remove dark sheet halos touching transparency (visible on white BG)."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    for _ in range(passes):
        to_clear: list[tuple[int, int]] = []
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a < 24:
                    continue
                lum = 0.299 * r + 0.587 * g + 0.114 * b
                sat = max(r, g, b) - min(r, g, b)
                if lum > 95 or sat >= 48:
                    continue
                if is_smoke_or_character(r, g, b) and lum > 55:
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


def straighten_alpha_rgba(
    im: Image.Image,
    matte: tuple[int, int, int] = (0, 0, 0),
) -> Image.Image:
    """Un-premultiply from sheet matte so transparency composites on any desktop BG."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    mr, mg, mb = matte
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 6:
                px[x, y] = (0, 0, 0, 0)
                continue
            if a >= 252:
                continue
            af = a / 255.0
            inv = 1.0 - af
            if af < 0.02:
                px[x, y] = (0, 0, 0, 0)
                continue
            nr = int((r - inv * mr) / af)
            ng = int((g - inv * mg) / af)
            nb = int((b - inv * mb) / af)
            px[x, y] = (
                max(0, min(255, nr)),
                max(0, min(255, ng)),
                max(0, min(255, nb)),
                a,
            )
    return im


def detect_matte_from_rgb(im: Image.Image) -> tuple[int, int, int]:
    """Matte color from sheet corners (before BG removal)."""
    im = im.convert("RGB")
    px = im.load()
    w, h = im.size
    pts = [(2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3)]
    rs = gs = bs = 0
    for x, y in pts:
        r, g, b = px[x, y]
        rs += r
        gs += g
        bs += b
    n = len(pts)
    return (rs // n, gs // n, bs // n)


def detect_corner_matte(im: Image.Image) -> tuple[int, int, int]:
    """Guess removal matte from transparent corners (white or black sheets)."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    samples: list[tuple[int, int, int]] = []
    for x, y in ((2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3)):
        r, g, b, a = px[x, y]
        if a < 32:
            continue
        samples.append((r, g, b))
    if not samples:
        return (0, 0, 0)
    lum_avg = sum(0.299 * r + 0.587 * g + 0.114 * b for r, g, b in samples) / len(
        samples
    )
    return (255, 255, 255) if lum_avg > 160 else (0, 0, 0)


def matte_for_frame(stem: str) -> tuple[int, int, int] | None:
    """Known matte per asset family; None = auto-detect from corners."""
    black_prefixes = (
        "smoke-",
        "sit-enter",
        "sit-rest",
        "sit-med",
        "sit-stand",
        "idle-glance",
        "idle-base",
    )
    if any(stem.startswith(p) for p in black_prefixes):
        return (0, 0, 0)
    return None


def feather_alpha(im: Image.Image, radius: float = 0.85) -> Image.Image:
    im = im.convert("RGBA")
    r, g, b, a = im.split()
    a = a.filter(ImageFilter.GaussianBlur(radius=radius))
    return Image.merge("RGBA", (r, g, b, a))


def is_black_matte(matte: tuple[int, int, int]) -> bool:
    return max(matte) < 40


def erode_matte_fringe(im: Image.Image, pixels: int = 2) -> Image.Image:
    """Shrink alpha mask to drop opaque black-matte halos (idle/sit/smoke on white desktop)."""
    im = im.convert("RGBA")
    r, g, b, a = im.split()
    for _ in range(max(1, pixels)):
        a = a.filter(ImageFilter.MinFilter(3))
    out = Image.merge("RGBA", (r, g, b, a))
    px = out.load()
    w, h = out.size
    for y in range(h):
        for x in range(w):
            if px[x, y][3] < 12:
                px[x, y] = (0, 0, 0, 0)
    return out


def strip_opaque_matte_fringe(
    im: Image.Image,
    max_lum: int = 108,
) -> Image.Image:
    """Remove fully-opaque dark pixels touching transparency (black sheet residue)."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    for _ in range(2):
        to_clear: list[tuple[int, int]] = []
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a < 200:
                    continue
                lum = 0.299 * r + 0.587 * g + 0.114 * b
                if lum > max_lum:
                    continue
                if is_smoke_or_character(r, g, b) and lum > 72:
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


def recolor_black_matte_fringe(im: Image.Image) -> Image.Image:
    """Semi-transparent black edges -> neighbor fabric RGB (straight alpha for any desktop).

    Only pixels touching transparency are recolored. Interior navy suit pixels must
    not be averaged from bright neighbors (that smears red/skin across the silhouette).
    """
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    for _ in range(3):
        for y in range(1, h - 1):
            for x in range(1, w - 1):
                r, g, b, a = px[x, y]
                if a < 10:
                    continue
                lum = 0.299 * r + 0.587 * g + 0.114 * b
                if lum > 95:
                    continue
                if is_smoke_or_character(r, g, b) and lum > 55:
                    continue
                touches_trans = False
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if px[nx, ny][3] == 0:
                        touches_trans = True
                        break
                if not touches_trans:
                    continue
                rs = gs = bs = n = 0
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    nr, ng, nb, na = px[nx, ny]
                    if na < 180:
                        continue
                    nlum = 0.299 * nr + 0.587 * ng + 0.114 * nb
                    if nlum < 90:
                        continue
                    rs += nr
                    gs += ng
                    bs += nb
                    n += 1
                if n >= 1:
                    px[x, y] = (rs // n, gs // n, bs // n, a)
    return im


def fix_black_matte_edges(im: Image.Image, matte: tuple[int, int, int]) -> Image.Image:
    if not is_black_matte(matte):
        return im
    im = strip_opaque_matte_fringe(im)
    im = recolor_black_matte_fringe(im)
    im = erode_matte_fringe(im, pixels=1)
    return recolor_black_matte_fringe(im)


def sanitize_display_alpha(im: Image.Image) -> Image.Image:
    """Remove dark alpha dust and hidden RGB for clean browser transparent compositing."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()

    # alpha 1–20 reads as black speckles when the browser downscales the sprite
    for y in range(h):
        for x in range(w):
            if px[x, y][3] < 24:
                px[x, y] = (0, 0, 0, 0)

    for _ in range(3):
        to_clear: list[tuple[int, int]] = []
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a < 24:
                    continue
                lum = 0.299 * r + 0.587 * g + 0.114 * b
                if a < 88 and lum < 58:
                    to_clear.append((x, y))
        if not to_clear:
            break
        for x, y in to_clear:
            px[x, y] = (0, 0, 0, 0)

    for _ in range(2):
        to_clear = []
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a < 24 or a > 200:
                    continue
                lum = 0.299 * r + 0.587 * g + 0.114 * b
                if lum > 72:
                    continue
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if not (0 <= nx < w and 0 <= ny < h):
                        continue
                    if px[nx, ny][3] < 24:
                        to_clear.append((x, y))
                        break
        if not to_clear:
            break
        for x, y in to_clear:
            px[x, y] = (0, 0, 0, 0)

    for _ in range(2):
        fills: list[tuple[int, int, int, int, int]] = []
        for y in range(1, h - 1):
            for x in range(1, w - 1):
                r, g, b, a = px[x, y]
                if a < 12 or a >= 252:
                    continue
                lum = 0.299 * r + 0.587 * g + 0.114 * b
                if lum > 72:
                    continue
                rs = gs = bs = n = 0
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    nr, ng, nb, na = px[nx, ny]
                    if na < 200:
                        continue
                    nlum = 0.299 * nr + 0.587 * ng + 0.114 * nb
                    if nlum < 75:
                        continue
                    rs += nr
                    gs += ng
                    bs += nb
                    n += 1
                if n >= 2:
                    fills.append((x, y, rs // n, gs // n, bs // n))
        if not fills:
            break
        for x, y, r, g, b in fills:
            px[x, y] = (r, g, b, 255)

    for _ in range(2):
        for y in range(1, h - 1):
            for x in range(1, w - 1):
                r, g, b, a = px[x, y]
                if a < 12:
                    continue
                lum = 0.299 * r + 0.587 * g + 0.114 * b
                if lum > 105:
                    continue
                touches_trans = False
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if px[nx, ny][3] < 24:
                        touches_trans = True
                        break
                if not touches_trans:
                    continue
                rs = gs = bs = n = 0
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    nr, ng, nb, na = px[nx, ny]
                    if na < 200:
                        continue
                    nlum = 0.299 * nr + 0.587 * ng + 0.114 * nb
                    if nlum < 80:
                        continue
                    rs += nr
                    gs += ng
                    bs += nb
                    n += 1
                if n >= 1:
                    px[x, y] = (rs // n, gs // n, bs // n, min(255, max(a, 220)))
                elif a < 200:
                    px[x, y] = (0, 0, 0, 0)

    return im


def clean_browser_speckles(im: Image.Image) -> Image.Image:
    """Remove edge pixels that read as dark dots after browser downscale."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for _ in range(6):
        to_clear: list[tuple[int, int]] = []
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a < 12:
                    continue
                lum = 0.299 * r + 0.587 * g + 0.114 * b
                touches_trans = False
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] < 12:
                        touches_trans = True
                        break
                if touches_trans and lum < 100 and a < 240:
                    to_clear.append((x, y))
        if not to_clear:
            break
        for x, y in to_clear:
            px[x, y] = (0, 0, 0, 0)
    return im


def bake_display_tier(im: Image.Image, ship_h: int) -> Image.Image:
    """Downscale composited hero canvas to a UI tier, then defringe at that pixel size."""
    cur = sanitize_display_alpha(im)
    for th in (512, 400, 280, 200, 135, ship_h):
        if cur.size[1] <= th:
            continue
        nw = max(1, round(cur.size[0] * th / cur.size[1]))
        cur = cur.resize((nw, th), Image.Resampling.LANCZOS)
        cur = clean_browser_speckles(cur)
    return sanitize_display_alpha(cur)


def save_display_frame(im: Image.Image, path: Path) -> Image.Image:
    """Write `-h53/-h70/-h106` tiers plus default `.png` (largest tier)."""
    stem = path.stem
    parent = path.parent
    largest: Image.Image | None = None
    for ship_h in DISPLAY_SHIP_HEIGHTS:
        baked = bake_display_tier(im, ship_h)
        baked.save(parent / f"{stem}-h{ship_h}.png", "PNG", optimize=True)
        largest = baked
    if largest is None:
        largest = bake_display_tier(im, DISPLAY_SHIP_HEIGHTS[-1])
    largest.save(path, "PNG", optimize=True)
    return largest


def finalize_frame(im: Image.Image) -> Image.Image:
    """Bake largest display tier (used before save_display_frame in compose)."""
    return bake_display_tier(im, DISPLAY_SHIP_HEIGHTS[-1])


def _polish_patch(im: Image.Image, matte: tuple[int, int, int] = (0, 0, 0)) -> Image.Image:
    """Edge polish on a tight crop (fast)."""
    im = remove_small_components(im)
    im = remove_isolated_opaque(im)
    im = defringe_dark(im)
    im = defringe_light(im)
    im = straighten_alpha_rgba(im, matte)
    if is_black_matte(matte):
        im = fix_black_matte_edges(im, matte)
    else:
        im = feather_alpha(im, radius=0.65)
    im = fill_character_holes(im)
    im = solidify_character_pixels(im)
    return sanitize_display_alpha(im)


def polish_sprite_edges(
    im: Image.Image,
    margin: int = 10,
    matte: tuple[int, int, int] | None = None,
) -> Image.Image:
    """Clean speckles, halos, and fix straight alpha for transparent window display."""
    im = im.convert("RGBA")
    matte = matte if matte is not None else detect_corner_matte(im)
    bbox = im.getbbox()
    if not bbox:
        return im
    x0 = max(0, bbox[0] - margin)
    y0 = max(0, bbox[1] - margin)
    x1 = min(im.size[0], bbox[2] + margin)
    y1 = min(im.size[1], bbox[3] + margin)
    patch = im.crop((x0, y0, x1, y1))
    polished = _polish_patch(patch, matte)
    out = im.copy()
    out.paste(polished, (x0, y0), polished)
    return out


def process_cell(im: Image.Image) -> Image.Image:
    im = flood_clear_black(im)
    im = peel_black_halo(im, passes=3)
    im = polish_sprite_edges(im)
    bbox = im.getbbox()
    if not bbox:
        return im
    im = im.crop(bbox)
    w, h = im.size
    out = Image.new("RGBA", (w + PAD * 2, h + PAD * 2), (0, 0, 0, 0))
    out.paste(im, (PAD, PAD), im)
    return out


def split_sheet(sheet: Image.Image) -> dict[str, Image.Image]:
    w, h = sheet.size
    col_w = w // 2
    row_h = h // 3
    out: dict[str, Image.Image] = {}
    for name, col, row in CELLS:
        x0 = col * col_w
        y0 = row * row_h
        x1 = x0 + col_w if col == 0 else w
        y1 = y0 + row_h if row < 2 else h
        out[name] = sheet.crop((x0, y0, x1, y1))
    return out


def crop_bbox(im: Image.Image) -> tuple[Image.Image, tuple[int, int, int, int]]:
    bbox = im.getbbox()
    if not bbox:
        return im, (0, 0, im.size[0], im.size[1])
    return im.crop(bbox), bbox


def foot_center_from_crop(crop: Image.Image) -> tuple[int, int]:
    _, bbox = crop_bbox(crop)
    return (bbox[0] + bbox[2]) // 2, bbox[3]


def defringe_light(im: Image.Image) -> Image.Image:
    """Remove near-white halos touching transparency."""
    w, h = im.size
    px = im.load()
    for _ in range(2):
        to_clear: list[tuple[int, int]] = []
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a < 24:
                    continue
                lum = 0.299 * r + 0.587 * g + 0.114 * b
                sat = max(r, g, b) - min(r, g, b)
                if lum < 175 or sat >= 62:
                    continue
                if r > 110 and r > g * 1.2 and g < 120:
                    continue
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                        to_clear.append((x, y))
                        break
        for x, y in to_clear:
            px[x, y] = (0, 0, 0, 0)
        if not to_clear:
            break
    return im


def defringe(im: Image.Image) -> Image.Image:
    """Full edge polish for raw sheet cells only."""
    return polish_sprite_edges(im)


def fill_character_holes(im: Image.Image) -> Image.Image:
    """Fill small transparent gaps inside the silhouette."""
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


def solidify_character_pixels(im: Image.Image) -> Image.Image:
    """Opaque interior pixels; keep anti-aliased edge alpha for light backgrounds."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 32 or a >= 255:
                continue
            touches_trans = False
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                    touches_trans = True
                    break
            if touches_trans:
                continue
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            sat = max(r, g, b) - min(r, g, b)
            if lum > 232 and sat < 30:
                continue
            px[x, y] = (r, g, b, 255)
    return im


@dataclass
class FrameLayout:
    name: str
    scaled: Image.Image
    nw: int
    nh: int
    paste_x: int
    paste_y: int


def build_idle_base_tight(processed_base: Image.Image) -> Image.Image:
    """Portrait tight idle for display — matches idle-1 contain scale at 64px."""
    ref_path = FRAMES / f"{IDLE_REF_NAME}.png"
    if ref_path.exists():
        ref_im = Image.open(ref_path).convert("RGBA")
        _, ref_bbox = crop_bbox(ref_im)
        ref_char_h = ref_bbox[3] - ref_bbox[1]
        canvas_h = ref_im.size[1]
        ref_foot_y = ref_bbox[3]
    else:
        ref_char_h = 890
        canvas_h = 898
        ref_foot_y = 894

    crop, bbox = crop_bbox(processed_base)
    ch = max(1, bbox[3] - bbox[1])
    scale = ref_char_h / ch
    nw = max(1, round(crop.size[0] * scale))
    nh = ref_char_h
    scaled = resize_sprite(crop, (nw, nh))

    canvas_w = nw + PAD * 2
    anchor_foot_x = canvas_w // 2
    anchor_foot_y = ref_foot_y
    fcx, fcy = foot_center_from_crop(scaled)
    paste_x = anchor_foot_x - fcx
    paste_y = anchor_foot_y - fcy

    out = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    out.paste(scaled, (paste_x, paste_y), scaled)
    return finalize_frame(out)


def display_ref_metrics() -> tuple[int, int, int]:
    """idle-1 display scale: char height, canvas height, foot y."""
    _w, h, _fx, foot_y, char_h = idle_hero_layout()
    return char_h, h, foot_y


# normalize-idle-frames body canvas (idle-1 hero) — used when bootstrapping from smoke sheet only
HERO_CANVAS_W = 1544
HERO_CANVAS_H = 1032
HERO_CHAR_H = 1024
HERO_FOOT_Y = 1028


def bootstrap_idle_hero_from_base(
    processed_base: Image.Image,
    *,
    force: bool = False,
) -> None:
    """Create idle-1.png from sheet TL (smoke-base) when restore-presence-frames was not run."""
    ref_path = FRAMES / f"{IDLE_REF_NAME}.png"
    hero_ref = FRAMES / f"{IDLE_REF_NAME}-hero.png"
    if not force and ref_path.exists() and hero_ref.exists():
        return

    scaled = scale_pose_for_hero(processed_base, processed_base, HERO_CHAR_H)
    fcx, fcy = foot_center_from_crop(scaled)
    foot_x = HERO_CANVAS_W // 2
    paste_x = foot_x - fcx
    paste_y = HERO_FOOT_Y - fcy
    out = Image.new("RGBA", (HERO_CANVAS_W, HERO_CANVAS_H), (0, 0, 0, 0))
    out.paste(scaled, (paste_x, paste_y), scaled)
    out = sanitize_display_alpha(out)
    hero_ref.parent.mkdir(parents=True, exist_ok=True)
    out.save(hero_ref, "PNG", optimize=True)
    save_display_frame(out, ref_path)
    print(
        f"  bootstrap {IDLE_REF_NAME}.png {HERO_CANVAS_W}x{HERO_CANVAS_H} "
        f"foot=({foot_x},{HERO_FOOT_Y}) char_h={HERO_CHAR_H}"
    )


def idle_hero_layout() -> tuple[int, int, int, int, int]:
    """Shared canvas for idle / walk / peek / sit / smoke (normalize-idle-frames)."""
    hero_ref = FRAMES / f"{IDLE_REF_NAME}-hero.png"
    ref_path = hero_ref if hero_ref.exists() else FRAMES / f"{IDLE_REF_NAME}.png"
    if not ref_path.exists():
        raise SystemExit(
            f"Missing {ref_path.name} — run scripts/restore-presence-frames.py "
            "or import-smoke-sheet.py (bootstraps from sheet TL)"
        )
    ref = Image.open(ref_path).convert("RGBA")
    _, bbox = crop_bbox(ref)
    foot_x = ref.size[0] // 2
    foot_y = bbox[3]
    char_h = bbox[3] - bbox[1]
    return ref.size[0], ref.size[1], foot_x, foot_y, char_h


def scale_pose_for_hero(
    processed_pose: Image.Image,
    base_proc: Image.Image,
    ref_char_h: int,
) -> Image.Image:
    """Match hero scale — LANCZOS only (premultiply resize_sprite breaks wind/smoke/glance)."""
    base_crop, base_bbox = crop_bbox(base_proc)
    base_ch = max(1, base_bbox[3] - base_bbox[1])
    gscale = ref_char_h / base_ch

    pose_crop, pose_bbox = crop_bbox(processed_pose)
    pose_ch = max(1, pose_bbox[3] - pose_bbox[1])
    pose_scale = base_ch / pose_ch
    nw = max(1, round(pose_crop.size[0] * pose_scale * gscale))
    nh = max(1, round(pose_crop.size[1] * pose_scale * gscale))
    if (nw, nh) == pose_crop.size:
        return pose_crop
    return pose_crop.resize((nw, nh), Image.Resampling.LANCZOS)


def compose_on_hero_canvas(
    items: list[tuple[str, Image.Image, int, int]],
    out_paths: dict[str, Path],
) -> None:
    """Paste scaled poses onto the idle-1 canvas (same footprint as walk/peek)."""
    hero_w, hero_h, foot_x, foot_y, _ref_char_h = idle_hero_layout()
    min_x = 0
    max_x = hero_w

    for _name, scaled, paste_x, paste_y in items:
        min_x = min(min_x, paste_x)
        max_x = max(max_x, paste_x + scaled.size[0])

    shift_x = PAD - min_x
    print(f"  hero canvas {hero_w}x{hero_h} foot=({foot_x},{foot_y}) shift_x={shift_x}")

    for name, scaled, paste_x, paste_y in items:
        out = Image.new("RGBA", (hero_w, hero_h), (0, 0, 0, 0))
        out.paste(scaled, (paste_x + shift_x, paste_y), scaled)
        path = out_paths[name]
        out = save_display_frame(out, path)
        b = out.getbbox()
        ch = b[3] - b[1] if b else 0
        print(f"  {path.name} {hero_w}x{hero_h} char_h={ch}")


def build_display_pose(
    processed_pose: Image.Image,
    processed_base: Image.Image,
    ref_char_h: int,
    canvas_h: int,
    ref_foot_y: int,
    anchor_foot_x: int,
) -> tuple[Image.Image, int]:
    """Portrait frame — same contain scale as idle-base-tight, shared foot anchor."""
    base_crop, base_bbox = crop_bbox(processed_base)
    base_ch = max(1, base_bbox[3] - base_bbox[1])
    gscale = ref_char_h / base_ch

    crop, bbox = crop_bbox(processed_pose)
    pose_ch = max(1, bbox[3] - bbox[1])
    pose_scale = base_ch / pose_ch
    nw = max(1, round(crop.size[0] * pose_scale * gscale))
    nh = max(1, round(crop.size[1] * pose_scale * gscale))
    scaled = resize_sprite(crop, (nw, nh))

    fcx, fcy = foot_center_from_crop(scaled)
    paste_x = anchor_foot_x - fcx
    paste_y = ref_foot_y - fcy
    canvas_w = max(nw + paste_x + PAD, anchor_foot_x + nw // 2 + PAD)

    out = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    out.paste(scaled, (paste_x, paste_y), scaled)
    return finalize_frame(out), canvas_w


def save_smoke_decor_frame(processed: dict[str, Image.Image]) -> None:
    """Write smoke-only.png tiers — decor only, ninja stripped."""
    _hero_w, _hero_h, anchor_foot_x, ref_foot_y, ref_char_h = idle_hero_layout()
    decor = strip_character_pixels(processed[SMOKE_DECOR_NAME].copy())
    scaled = scale_pose_for_hero(decor, processed["smoke-base"], ref_char_h)
    fcx, fcy = foot_center_from_crop(scaled)
    paste_x = anchor_foot_x - fcx
    paste_y = ref_foot_y - fcy
    compose_on_hero_canvas(
        [(SMOKE_DECOR_NAME, scaled, paste_x, paste_y)],
        {SMOKE_DECOR_NAME: FRAMES / f"{SMOKE_DECOR_NAME}.png"},
    )
    print(
        f"  {SMOKE_DECOR_NAME}.png (decor only; app ignores smoke-start/run/arrive)"
    )


def plan_frame_layouts(
    processed: dict[str, Image.Image],
) -> tuple[int, int, int, int, list[FrameLayout]]:
    base_crop, base_bbox = crop_bbox(processed["smoke-base"])
    ref_h = max(1, base_bbox[3] - base_bbox[1])

    names = [IDLE_BASE_NAME, *SMOKE_SHEET_NAMES]
    planned: list[FrameLayout] = []

    for name in names:
        src = processed["smoke-base"] if name == IDLE_BASE_NAME else processed[name]
        crop, bbox = crop_bbox(src)
        ch = max(1, bbox[3] - bbox[1])
        pose_scale = 1.0 if name == IDLE_BASE_NAME else ref_h / ch
        nw = max(1, round(crop.size[0] * pose_scale))
        nh = max(1, round(crop.size[1] * pose_scale))
        scaled = (
            crop.copy()
            if pose_scale == 1.0
            else resize_sprite(crop, (nw, nh))
        )
        fcx, fcy = foot_center_from_crop(scaled)
        planned.append(FrameLayout(name, scaled, nw, nh, -fcx, ref_h - fcy))

    anchor_foot_x = 0
    anchor_foot_y = ref_h

    for p in planned:
        fcx, fcy = foot_center_from_crop(p.scaled)
        p.paste_x = anchor_foot_x - fcx
        p.paste_y = anchor_foot_y - fcy

    min_x = min(p.paste_x for p in planned)
    min_y = min(p.paste_y for p in planned)
    shift_x = PAD - min_x
    shift_y = PAD - min_y if min_y < PAD else 0

    canvas_w = max(p.paste_x + p.nw for p in planned) - min_x + PAD * 2
    canvas_h = max(p.paste_y + p.nh for p in planned) - min_y + PAD * 2
    foot_x = anchor_foot_x + shift_x
    foot_y = anchor_foot_y + shift_y

    for p in planned:
        p.paste_x += shift_x
        p.paste_y += shift_y

    return canvas_w, canvas_h, foot_x, foot_y, planned


def save_layouts(
    planned: list[FrameLayout],
    canvas_w: int,
    canvas_h: int,
) -> None:
    for p in planned:
        out = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        out.paste(p.scaled, (p.paste_x, p.paste_y), p.scaled)
        out = defringe(out)
        path = FRAMES / f"{p.name}.png"
        out.save(path, "PNG", optimize=True)
        print(
            f"  {p.name}.png {canvas_w}x{canvas_h} "
            f"paste=({p.paste_x},{p.paste_y}) size={p.nw}x{p.nh}"
        )


def resolve_sheet_path(argv: list[str]) -> Path:
    if len(argv) > 1:
        return Path(argv[1]).resolve()
    if DEFAULT_SHEET.exists():
        return DEFAULT_SHEET
    raise SystemExit("Pass path to smoke sheet PNG (or place design/smoke-sheet-source.png)")


def load_sheet_rgb(path: Path) -> Image.Image:
    """RGBA removebg sheets → composite on black matte for process_cell."""
    im = Image.open(path)
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, (0, 0, 0))
        bg.paste(im, mask=im.split()[3])
        return bg
    return im.convert("RGB")


def main() -> None:
    sheet_path = resolve_sheet_path(sys.argv)
    FRAMES.mkdir(parents=True, exist_ok=True)
    DESIGN.mkdir(parents=True, exist_ok=True)

    dest = DESIGN / "smoke-sheet-source.png"
    if sheet_path.resolve() != dest.resolve():
        shutil.copy2(sheet_path, dest)

    sheet = load_sheet_rgb(sheet_path)
    cells = split_sheet(sheet)

    processed: dict[str, Image.Image] = {}
    for name, cell in cells.items():
        raw_path = FRAMES / f"{name}-raw.png"
        cell.save(raw_path, "PNG", optimize=True)
        proc = process_cell(cell)
        processed[name] = proc
        print(f"  {name}-raw.png -> {proc.size[0]}x{proc.size[1]}")

    print("idle-base-tight (portrait, idle-1 display scale)")
    tight = build_idle_base_tight(processed["smoke-base"])
    tight_path = FRAMES / f"{IDLE_TIGHT_NAME}.png"
    tight.save(tight_path, "PNG", optimize=True)
    _, tb = crop_bbox(tight)
    anchor_foot_x = tight.size[0] // 2
    print(
        f"  {IDLE_TIGHT_NAME}.png {tight.size[0]}x{tight.size[1]} "
        f"char_h={tb[3]-tb[1]} foot_x={anchor_foot_x}"
    )

    print(f"{IDLE_REF_NAME} hero ref (from sheet TL if missing)")
    bootstrap_idle_hero_from_base(processed["smoke-base"])

    print("smoke decor (smoke-only cell, ninja stripped)")
    save_smoke_decor_frame(processed)

    print("align refs (wide canvas, dev only)")
    canvas_w, canvas_h, foot_x, foot_y, planned = plan_frame_layouts(processed)
    print(f"  canvas {canvas_w}x{canvas_h} foot=({foot_x},{foot_y})")
    for p in planned:
        if p.name == IDLE_BASE_NAME:
            out = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
            out.paste(p.scaled, (p.paste_x, p.paste_y), p.scaled)
            out = defringe(out)
            out.save(FRAMES / f"{p.name}.png", "PNG", optimize=True)
            print(f"  {p.name}.png (align) {canvas_w}x{canvas_h}")
            break


if __name__ == "__main__":
    main()
