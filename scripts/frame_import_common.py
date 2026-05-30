"""Ninja frame import — #FF00FF magenta workflow (see .cursor/rules/ninja-frame-import.mdc).

Generation (Cursor etc.):
  - Do NOT export transparent PNG.
  - Background MUST be solid #FF00FF only.

Import:
  1. If sheet is black: paint full sheet onto #FF00FF plate, save *-magenta.png
  2. Key magenta from borders only (preserve character fringe / soft FX)
  3. bbox + BBOX_PAD loose crop → scale to I/idle height → 512×512 canvas
"""
from __future__ import annotations

import sys
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FRAMES = ROOT / "src/companion/assets/frames"
MAGENTA_PLATES = ROOT / "assets" / "magenta-plates"

# Copy into image-generation prompts — do not skip.
GENERATION_PROMPT_SNIPPET = (
    "solid #FF00FF magenta background only, no transparency, no black, no checkerboard"
)

SIZE = 512
PAD_TOP = 80
PAD_BOTTOM = 56
PAD_SIDE = 40
BBOX_PAD = 36
FOOT_Y = SIZE - PAD_BOTTOM
MAGENTA = (255, 0, 255, 255)


def is_magenta_strict(r: int, g: int, b: int) -> bool:
    """True #FF00FF-style (look-2 chroma PNG borders)."""
    return g < 90 and r > 150 and b > 150 and abs(r - b) < 65


def is_magenta_key_pixel(r: int, g: int, b: int) -> bool:
    """
    #FF00FF plus JPEG halos around FX (e.g. 243,113,240 on swirl).
    Keeps cyan/light-blue mist (G/B lead) and white breath.
    """
    if is_magenta_strict(r, g, b):
        return True
    if min(r, g, b) > 235 and max(r, g, b) - min(r, g, b) < 40:
        return False
    if r < 80 or b < 80:
        return False
    # Cyan / light-blue energy (B,G high; R low)
    if b >= g and g >= r and b - r > 50:
        return False
    if g > r + 30 and b > r + 20:
        return False
    # Magenta / pink halo: R≈B, G lower (samples: 240–246, 90–130, 238–247)
    if abs(r - b) > 55:
        return False
    if g >= 220:
        return False
    if r > 195 and b > 195 and 75 <= g < 220:
        return True
    if r > 110 and b > 170 and 95 <= g < 220 and b > g + 15:
        return True
    if r > 215 and b > 215 and 155 <= g < 220 and abs(r - b) < 45:
        return True
    dr, dg, db = 255 - r, g, 255 - b
    if r > 130 and b > 130 and g < 220 and dr * dr + dg * dg + db * db <= 90 * 90:
        return True
    return False


def despill_magenta_fringe(img: Image.Image) -> Image.Image:
    """Light pink fringe on bright FX only — do not touch suit / skin."""
    out = img.convert("RGBA")
    px = out.load()
    w, h = out.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 8:
                continue
            if r < 120 or b < 120:
                continue
            if b >= g and g >= r and b - r > 50:
                continue
            pink_excess = (r + b) // 2 - g
            if pink_excess < 12:
                continue
            if r + g + b < 450:
                continue
            if r + b < g * 2 + 35:
                continue
            nr = max(g, r - (pink_excess * 3) // 4)
            nb = max(g, b - (pink_excess * 2) // 4)
            ng = min(255, g + pink_excess // 5)
            px[x, y] = (nr, ng, nb, a)
    return out


def is_black_bg(r: int, g: int, b: int, threshold: int = 32) -> bool:
    return r <= threshold and g <= threshold and b <= threshold


def _edge_pixels(img: Image.Image, margin: int = 4) -> list[tuple[int, int, int]]:
    w, h = img.size
    px = img.convert("RGBA").load()
    samples: list[tuple[int, int, int]] = []
    for x in range(w):
        for y in range(min(margin, h)):
            samples.append(px[x, y][:3])
        for y in range(max(0, h - margin), h):
            samples.append(px[x, y][:3])
    for y in range(h):
        for x in range(min(margin, w)):
            samples.append(px[x, y][:3])
        for x in range(max(0, w - margin), w):
            samples.append(px[x, y][:3])
    return samples


def sheet_border_is_magenta(sheet: Image.Image, margin: int = 4) -> bool:
    edge = _edge_pixels(sheet, margin)
    if not edge:
        return False
    return sum(1 for rgb in edge if is_magenta_strict(*rgb)) >= len(edge) * 0.55


def sheet_is_cursor_chroma(sheet: Image.Image) -> bool:
    """Cursor 'magenta' sheet: pink/purple interior (edges may be JPEG gray)."""
    if sheet_border_is_magenta(sheet):
        return True
    w, h = sheet.size
    px = sheet.convert("RGBA").load()
    top_samples = [px[w // 2, y][:3] for y in range(min(24, h))]
    hits = sum(1 for rgb in top_samples if is_magenta_strict(*rgb))
    return hits >= max(3, len(top_samples) // 4)


def paint_black_matte_to_magenta_plate(img: Image.Image) -> Image.Image:
    """Map black/near-black to #FF00FF; keep character RGBA. Not a transparency export."""
    src = img.convert("RGBA")
    w, h = src.size
    out = Image.new("RGBA", (w, h), MAGENTA)
    spx = src.load()
    opx = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = spx[x, y]
            if is_black_bg(r, g, b):
                continue
            if a == 0:
                continue
            opx[x, y] = (r, g, b, a)
    return out


def load_sheet_on_magenta(sheet_path: Path) -> Image.Image:
    """
    STEP 1 — Sheet must be chroma-backed (like look-2 / user reference).
    Pure black sheets are painted to #FF00FF plate first.
    """
    sheet = Image.open(sheet_path).convert("RGBA")

    if sheet_is_cursor_chroma(sheet):
        print("  [1/2] chroma sheet (Cursor #FF00FF style) - key only, no black paint")
        return sheet

    MAGENTA_PLATES.mkdir(parents=True, exist_ok=True)
    out_path = MAGENTA_PLATES / f"{sheet_path.stem}-magenta.png"
    painted = paint_black_matte_to_magenta_plate(sheet)
    painted.save(out_path, format="PNG")
    print("  [1/2] black sheet -> #FF00FF plate (interim; regenerate like look-2)")
    print(f"        saved: {out_path}")
    print(f"        prompt: {GENERATION_PROMPT_SNIPPET}")
    return painted


def key_chroma_border(img: Image.Image) -> Image.Image:
    """
    STEP 2 — Key magenta from borders, then remove trapped magenta in FX (e.g. swirl).
    Does not key white/cyan effect colours.
    """
    out = img.convert("RGBA")
    px = out.load()
    w, h = out.size
    vis = [[False] * h for _ in range(w)]
    q: deque[tuple[int, int]] = deque()

    for x in range(w):
        for y in (0, h - 1):
            if is_magenta_key_pixel(*px[x, y][:3]) and not vis[x][y]:
                vis[x][y] = True
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if is_magenta_key_pixel(*px[x, y][:3]) and not vis[x][y]:
                vis[x][y] = True
                q.append((x, y))

    while q:
        x, y = q.popleft()
        r, g, b, _a = px[x, y]
        px[x, y] = (r, g, b, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not vis[nx][ny]:
                if is_magenta_key_pixel(*px[nx, ny][:3]):
                    vis[nx][ny] = True
                    q.append((nx, ny))

    # Trapped pure magenta only (avoid punching white smoke / character AA)
    for y in range(h):
        for x in range(w):
            if is_magenta_strict(*px[x, y][:3]):
                px[x, y] = (*px[x, y][:3], 0)

    return despill_magenta_fringe(out)


def prepare_sheet_cell(cell: Image.Image, *, label: str = "cell") -> Image.Image:
    print(f"  [2/2] {label}: chroma border key")
    return key_chroma_border(cell.convert("RGBA"))


def split_columns(sheet: Image.Image, cols: int) -> list[Image.Image]:
    w, h = sheet.size
    col_w = w // cols
    cells: list[Image.Image] = []
    for i in range(cols):
        x0 = i * col_w
        x1 = w if i == cols - 1 else x0 + col_w
        cells.append(sheet.crop((x0, 0, x1, h)))
    return cells


def split_grid(sheet: Image.Image, cols: int, rows: int) -> list[Image.Image]:
    """Row-major cells: index = row * cols + col."""
    w, h = sheet.size
    col_w = w // cols
    row_h = h // rows
    cells: list[Image.Image] = []
    for row in range(rows):
        for col in range(cols):
            x0 = col * col_w
            y0 = row * row_h
            x1 = w if col == cols - 1 else x0 + col_w
            y1 = h if row == rows - 1 else y0 + row_h
            cells.append(sheet.crop((x0, y0, x1, y1)))
    return cells


def padded_bbox(img: Image.Image, pad: int) -> tuple[int, int, int, int] | None:
    bb = img.getbbox()
    if not bb:
        return None
    w, h = img.size
    return (
        max(0, bb[0] - pad),
        max(0, bb[1] - pad),
        min(w, bb[2] + pad),
        min(h, bb[3] + pad),
    )


def reference_char_height(frames_dir: Path) -> int:
    for name in ("look-2.png", "idle.png"):
        path = frames_dir / name
        if not path.exists():
            continue
        im = Image.open(path).convert("RGBA")
        bb = im.getbbox()
        if bb:
            return bb[3] - bb[1]
    return SIZE - PAD_TOP - PAD_BOTTOM


def compose_frame(
    keyed: Image.Image,
    *,
    target_char_h: int | None = None,
    frames_dir: Path | None = None,
) -> Image.Image:
    if frames_dir and target_char_h is None:
        target_char_h = reference_char_height(frames_dir)
    if target_char_h is None:
        target_char_h = reference_char_height(FRAMES)

    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    box = padded_bbox(keyed, BBOX_PAD)
    if not box:
        return canvas

    region = keyed.crop(box)
    inner = region.getbbox()
    if not inner:
        return canvas

    char = region.crop(inner)
    char_h = inner[3] - inner[1]
    if char_h <= 0:
        return canvas

    scale = target_char_h / char_h
    nw = max(1, int(round(char.width * scale)))
    nh = max(1, int(round(char.height * scale)))
    scaled = char.resize((nw, nh), Image.Resampling.LANCZOS)

    max_w = SIZE - PAD_SIDE * 2
    if nw > max_w:
        s = max_w / nw
        nw = max(1, int(round(nw * s)))
        nh = max(1, int(round(nh * s)))
        scaled = char.resize((nw, nh), Image.Resampling.LANCZOS)

    y = FOOT_Y - nh
    if y < PAD_TOP:
        s = (FOOT_Y - PAD_TOP) / nh
        nw = max(1, int(round(nw * s)))
        nh = max(1, int(round(nh * s)))
        scaled = char.resize((nw, nh), Image.Resampling.LANCZOS)
        y = FOOT_Y - nh

    x = (SIZE - nw) // 2
    canvas.paste(scaled, (x, y), scaled)
    return canvas


def import_magenta_cell(
    src_path: Path,
    out_name: str,
    *,
    frames_dir: Path | None = None,
) -> None:
    """Import one #FF00FF-backed PNG: chroma key from borders, then compose_frame."""
    out_dir = frames_dir or FRAMES
    out_dir.mkdir(parents=True, exist_ok=True)
    target_h = reference_char_height(out_dir)

    print(f"  import: {src_path.name} -> {out_name}")
    sheet = load_sheet_on_magenta(src_path)
    keyed = key_chroma_border(sheet)
    frame = compose_frame(keyed, target_char_h=target_h, frames_dir=out_dir)
    frame.save(out_dir / out_name, format="PNG")
    bb = frame.getbbox()
    ch = bb[3] - bb[1] if bb else 0
    print(
        f"        -> {out_name}  char_h={ch}  "
        f"top={bb[1] if bb else '?'}  foot_margin={frame.size[1] - bb[3] if bb else '?'}"
    )


def import_sheet_column(
    sheet_path: Path,
    outputs: dict[int, str],
    *,
    cols: int = 3,
    frames_dir: Path | None = None,
) -> None:
    out_dir = frames_dir or FRAMES
    out_dir.mkdir(parents=True, exist_ok=True)
    target_h = reference_char_height(out_dir)

    print(f"prompt snippet: {GENERATION_PROMPT_SNIPPET}")
    sheet = load_sheet_on_magenta(sheet_path)
    cells = split_columns(sheet, cols)

    for col, out_name in outputs.items():
        label = f"col{col}/{out_name}"
        keyed = prepare_sheet_cell(cells[col], label=label)
        frame = compose_frame(keyed, target_char_h=target_h, frames_dir=out_dir)
        frame.save(out_dir / out_name, format="PNG")
        bb = frame.getbbox()
        ch = bb[3] - bb[1] if bb else 0
        print(
            f"        -> {out_name}  char_h={ch}  "
            f"top={bb[1] if bb else '?'}  foot_margin={frame.size[1] - bb[3] if bb else '?'}"
        )
