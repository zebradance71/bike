"""Crop 2×3 mission reference sheet into per-pose refs (skip top-left cell only).

Output: assets/mission-ref/<stem>-ref.png — attach each when generating *-magenta.png.

Usage:
  py -3 scripts/extract-mission-cell-refs.py [sheet.png]
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from frame_import_common import split_grid
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
if not (ASSETS / "mission-ref").exists():
    ASSETS = Path(
        r"C:\Users\strea\.cursor\projects\c-Users-strea-Develop-ToriiLabs-Ninja2\assets"
    )

DEFAULT_SHEET = (
    "c__Users_strea_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_"
    "ChatGPT_Image_2026_5_23__11_13_55-00377573-2ebc-4b71-b005-c9d208f13528.png"
)

# row-major 2×3; skip index 0 (top-left sheet cell — not used for M stems)
REFS: tuple[tuple[int, str], ...] = (
    (1, "mission-run"),
    (2, "mission-start"),
    (3, "smoke-only"),
    (4, "smoke-big"),
    (5, "mission-arrive"),
)


def main() -> None:
    sheet_name = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SHEET
    sheet_path = Path(sheet_name)
    if not sheet_path.is_absolute():
        sheet_path = ASSETS / sheet_name
    if not sheet_path.exists():
        raise SystemExit(f"Sheet not found: {sheet_path}")

    out_dir = ASSETS / "mission-ref"
    out_dir.mkdir(parents=True, exist_ok=True)

    sheet = Image.open(sheet_path).convert("RGBA")
    cells = split_grid(sheet, cols=2, rows=3)
    print(f"sheet: {sheet_path}")
    print(f"out:   {out_dir}")
    for idx, stem in REFS:
        path = out_dir / f"{stem}-ref.png"
        cells[idx].save(path, format="PNG")
        print(f"  {path.name}")
    print("done - generate assets/<stem>-magenta.png from each ref")


if __name__ == "__main__":
    main()
