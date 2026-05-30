"""Import sit sheets (normal + meditation), normalized to idle-1 hero canvas.

Same footprint as walk / peek / smoke (scripts/restore-presence-frames.py first).

Usage:
  py -3 scripts/import-sit-sheet.py [normal-sheet] [med-sheet]
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
DEFAULT_NORMAL = DESIGN / "sit-normal-sheet-source.png"
DEFAULT_MED = DESIGN / "sit-meditation-sheet-source.png"
PAD = 4

NORMAL_PANELS: list[tuple[str, int]] = [
    ("sit-enter-1", 0),
    ("sit-rest", 1),
]

MED_PANELS: list[tuple[str, int]] = [
    ("sit-med-enter", 0),
    ("sit-med-a", 1),
    ("sit-med-b", 2),
]

OUT_NAMES = {
    "sit-enter-1": "sit-enter-1-tight",
    "sit-rest": "sit-rest-tight",
    "sit-med-enter": "sit-med-enter-tight",
    "sit-med-a": "sit-med-a-tight",
    "sit-med-b": "sit-med-b-tight",
}

COPY_ALIASES = {
    "sit-enter-2-tight": "sit-enter-1-tight",
    "sit-stand-return-tight": "sit-enter-1-tight",
}


def load_smoke_module():
    path = ROOT / "scripts/import-smoke-sheet.py"
    spec = importlib.util.spec_from_file_location("import_smoke_sheet", path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["import_smoke_sheet"] = mod
    spec.loader.exec_module(mod)
    return mod


def split_row(sheet: Image.Image, panels: list[tuple[str, int]]) -> dict[str, Image.Image]:
    w, h = sheet.size
    col_w = w // 3
    out: dict[str, Image.Image] = {}
    for name, col in panels:
        x0 = col * col_w
        x1 = w if col == 2 else x0 + col_w
        out[name] = sheet.crop((x0, 0, x1, h))
    return out


def scale_pose(
    mod,
    processed_pose: Image.Image,
    base_proc: Image.Image,
    ref_char_h: int,
) -> Image.Image:
    return mod.scale_pose_for_hero(processed_pose, base_proc, ref_char_h)


def save_sit_frames(mod, processed: dict[str, Image.Image], base_proc: Image.Image) -> None:
    _hero_w, _hero_h, anchor_foot_x, ref_foot_y, ref_char_h = mod.idle_hero_layout()

    items: list[tuple[str, Image.Image, int, int]] = []
    out_paths: dict[str, Path] = {}

    for name, proc in processed.items():
        scaled = scale_pose(mod, proc, base_proc, ref_char_h)
        fcx, fcy = mod.foot_center_from_crop(scaled)
        paste_x = anchor_foot_x - fcx
        paste_y = ref_foot_y - fcy
        out_name = OUT_NAMES[name]
        items.append((out_name, scaled, paste_x, paste_y))
        out_paths[out_name] = FRAMES / f"{out_name}.png"

    mod.compose_on_hero_canvas(items, out_paths)


def main() -> None:
    mod = load_smoke_module()
    if not (FRAMES / "idle-1.png").exists():
        raise SystemExit("Missing idle-1.png — run scripts/restore-presence-frames.py first")

    FRAMES.mkdir(parents=True, exist_ok=True)
    DESIGN.mkdir(parents=True, exist_ok=True)

    normal_path = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_NORMAL
    med_path = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else DEFAULT_MED

    if not normal_path.exists():
        raise SystemExit(f"Normal sit sheet not found: {normal_path}")
    if not med_path.exists():
        raise SystemExit(f"Meditation sit sheet not found: {med_path}")

    if normal_path != DEFAULT_NORMAL.resolve():
        shutil.copy2(normal_path, DEFAULT_NORMAL)
    if med_path != DEFAULT_MED.resolve():
        shutil.copy2(med_path, DEFAULT_MED)

    smoke_raw = FRAMES / "smoke-base-raw.png"
    base_proc = mod.process_cell(Image.open(smoke_raw).convert("RGB"))
    _w, _h, foot_x, foot_y, char_h = mod.idle_hero_layout()
    print(f"  ref idle-1 foot=({foot_x},{foot_y}) char_h={char_h}")

    processed: dict[str, Image.Image] = {}
    all_panels = [
        (normal_path, NORMAL_PANELS),
        (med_path, MED_PANELS),
    ]
    for sheet_path, panels in all_panels:
        cells = split_row(Image.open(sheet_path).convert("RGB"), panels)
        for name, cell in cells.items():
            raw_path = FRAMES / f"{name}-raw.png"
            cell.save(raw_path, "PNG", optimize=True)
            proc = mod.process_cell(cell)
            processed[name] = proc
            print(f"  {name}-raw.png -> {proc.size[0]}x{proc.size[1]}")

    print("sit frames (idle-1 hero canvas)")
    save_sit_frames(mod, processed, base_proc)

    print("aliases")
    for alias, source in COPY_ALIASES.items():
        for suffix in ("", *tuple(f"-h{h}" for h in mod.DISPLAY_SHIP_HEIGHTS)):
            src = FRAMES / f"{source}{suffix}.png"
            dst = FRAMES / f"{alias}{suffix}.png"
            shutil.copy2(src, dst)
        print(f"  {alias}.png <- {source}.png (+ display tiers)")


if __name__ == "__main__":
    main()
