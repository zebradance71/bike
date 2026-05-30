"""Crop 3-column pose (P) reference sheet into per-pose refs.

Output: assets/pose-ref/peek-N-ref.png — attach each when generating *-magenta.png.

Usage:
  py -3 scripts/extract-pose-cell-refs.py [sheet.png]
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from frame_import_common import split_columns
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CURSOR_ASSETS = Path(
    r"C:\Users\strea\.cursor\projects\c-Users-strea-Develop-ToriiLabs-Ninja2\assets"
)

DEFAULT_SHEET = (
    "c__Users_strea_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_"
    "ChatGPT_Image_2026_5_23__11_12_03-99173832-8c91-4acd-b775-5d7a80f27bea.png"
)

REFS: tuple[tuple[int, str], ...] = (
    (0, "peek-1"),
    (1, "peek-2"),
    (2, "peek-3"),
)


def resolve_assets_dir() -> Path:
    if CURSOR_ASSETS.exists():
        return CURSOR_ASSETS
    return ROOT / "assets"


def main() -> None:
    assets = resolve_assets_dir()
    sheet_name = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SHEET
    sheet_path = Path(sheet_name)
    if not sheet_path.is_absolute():
        sheet_path = assets / sheet_name
    if not sheet_path.exists():
        raise SystemExit(f"Sheet not found: {sheet_path}")

    out_dir = assets / "pose-ref"
    out_dir.mkdir(parents=True, exist_ok=True)

    sheet = Image.open(sheet_path).convert("RGBA")
    cells = split_columns(sheet, 3)
    print(f"sheet: {sheet_path}")
    print(f"out:   {out_dir}")
    for idx, stem in REFS:
        path = out_dir / f"{stem}-ref.png"
        cells[idx].save(path, format="PNG")
        print(f"  {path.name}")
    print("done - generate assets/<stem>-magenta.png from each ref")


if __name__ == "__main__":
    main()
