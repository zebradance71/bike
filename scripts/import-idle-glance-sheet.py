"""Import idle glance sheet: look-left | (center skip) | look-right (1×3).

Does not replace idle-1 — hero base stays smoke-sheet TL (import-smoke-sheet bootstrap).
Only look-2 / look-3 are aligned to the current idle-1 hero canvas.

Usage:
  py -3 scripts/import-idle-glance-sheet.py [path-to-sheet.png]
"""
from __future__ import annotations

import importlib.util
import shutil
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FRAMES = ROOT / "src/companion/assets/frames"
DESIGN = ROOT / "design"
DEFAULT_SHEET = DESIGN / "idle-glance-sheet-source.png"

GLANCE_PANELS: list[tuple[str, int, str]] = [
    ("look-2", 0, "look-left"),
    ("look-3", 2, "look-right"),
]


def load_smoke_module():
    path = ROOT / "scripts" / "import-smoke-sheet.py"
    spec = importlib.util.spec_from_file_location("import_smoke_sheet", path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["import_smoke_sheet"] = mod
    spec.loader.exec_module(mod)
    return mod


def split_glance_cells(sheet: Image.Image) -> dict[str, Image.Image]:
    w, h = sheet.size
    col_w = w // 3
    out: dict[str, Image.Image] = {}
    for out_name, col, _label in GLANCE_PANELS:
        x0 = col * col_w
        x1 = w if col == 2 else x0 + col_w
        out[out_name] = sheet.crop((x0, 0, x1, h))
    return out


def resolve_sheet_path(argv: list[str]) -> Path:
    if len(argv) > 1:
        return Path(argv[1]).resolve()
    if DEFAULT_SHEET.exists():
        return DEFAULT_SHEET
    raise SystemExit("Pass path to idle glance sheet PNG")


def load_scale_base_proc(mod) -> Image.Image:
    """Scale reference — smoke-base (same family as idle-1 hero from smoke sheet TL)."""
    raw = FRAMES / "smoke-base-raw.png"
    if not raw.exists():
        raise SystemExit("Missing smoke-base-raw.png — run scripts/import-smoke-sheet.py first")
    return mod.process_cell(Image.open(raw).convert("RGB"))


def main() -> None:
    mod = load_smoke_module()
    if not (FRAMES / "idle-1.png").exists() and not (FRAMES / "idle-1-hero.png").exists():
        raise SystemExit("Missing idle-1 — run scripts/import-smoke-sheet.py first")

    sheet_path = resolve_sheet_path(sys.argv)
    FRAMES.mkdir(parents=True, exist_ok=True)
    DESIGN.mkdir(parents=True, exist_ok=True)

    dest = DESIGN / "idle-glance-sheet-source.png"
    if sheet_path.resolve() != dest.resolve():
        shutil.copy2(sheet_path, dest)

    sheet = mod.load_sheet_rgb(sheet_path)
    cells = split_glance_cells(sheet)

    processed: dict[str, Image.Image] = {}
    for out_name, _col, label in GLANCE_PANELS:
        cell = cells[out_name]
        raw_path = FRAMES / f"{label}-raw.png"
        cell.save(raw_path, "PNG", optimize=True)
        proc = mod.process_cell(cell)
        processed[out_name] = proc
        print(f"  {label}-raw -> {out_name} {proc.size[0]}x{proc.size[1]}")

    print("idle-1 hero ref (unchanged, smoke-sheet TL base)")
    _hero_w, _hero_h, foot_x, foot_y, ref_char_h = mod.idle_hero_layout()
    print(f"  ref foot=({foot_x},{foot_y}) char_h={ref_char_h}")

    base_proc = load_scale_base_proc(mod)
    items: list[tuple[str, Image.Image, int, int]] = []
    out_paths: dict[str, Path] = {}

    for out_name, _col, _label in GLANCE_PANELS:
        scaled = mod.scale_pose_for_hero(processed[out_name], base_proc, ref_char_h)
        fcx, fcy = mod.foot_center_from_crop(scaled)
        paste_x = foot_x - fcx
        paste_y = foot_y - fcy
        items.append((out_name, scaled, paste_x, paste_y))
        out_paths[out_name] = FRAMES / f"{out_name}.png"

    print("glance frames (idle-1 hero canvas, look-2 / look-3)")
    mod.compose_on_hero_canvas(items, out_paths)


if __name__ == "__main__":
    main()
