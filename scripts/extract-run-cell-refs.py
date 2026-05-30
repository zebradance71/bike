"""Crop 2x2 RUN reference sheet into per-pose refs.

Mapping (row-major 2x2):
  index 0 (top-left)     = run-a
  index 1 (top-right)    = run-b
  index 2 (bottom-left)  = run-c   (base moving stem)
  index 3 (bottom-right) = run-d

Output: assets/run-ref/<stem>-ref.png
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from frame_import_common import split_grid
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CURSOR_ASSETS = Path(
    r"C:\Users\strea\.cursor\projects\c-Users-strea-Develop-ToriiLabs-Ninja2\assets"
)

DEFAULT_SHEET = (
    "c__Users_strea_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_"
    "ChatGPT_Image_2026_5_23__11_12_42-f38e65d9-5b81-4c15-8f63-dcde6297cbc0.png"
)

REFS: tuple[tuple[int, str], ...] = (
    (0, "run-a"),
    (1, "run-b"),
    (2, "run-c"),
    (3, "run-d"),
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

    out_dir = assets / "run-ref"
    out_dir.mkdir(parents=True, exist_ok=True)

    sheet = Image.open(sheet_path).convert("RGBA")
    cells = split_grid(sheet, cols=2, rows=2)
    if len(cells) != 4:
        raise SystemExit(f"Expected 4 cells, got {len(cells)}")

    print(f"sheet: {sheet_path}")
    print(f"out:   {out_dir}")
    for idx, stem in REFS:
        path = out_dir / f"{stem}-ref.png"
        cells[idx].save(path, format="PNG")
        print(f"  {path.name}")
    print("done - generate assets/<stem>-magenta.png from each ref")


if __name__ == "__main__":
    main()
