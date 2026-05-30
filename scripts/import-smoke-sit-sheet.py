"""Import 3-column smoke (S) sit sheet.

Source sheet MUST be generated on #FF00FF (not transparent PNG, not black matte).

Columns:
  0 -> smoke-sit-enter.png
  1 -> smoke-sit-rest-a.png
  2 -> smoke-sit-rest-b.png

Usage:
  py -3 scripts/import-smoke-sit-sheet.py [path-to-sheet.png]
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from frame_import_common import FRAMES, import_sheet_column

DEFAULT_SHEET = Path(
    r"C:\Users\strea\.cursor\projects\c-Users-strea-Develop-ToriiLabs-Ninja2\assets"
    r"\c__Users_strea_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_"
    r"ChatGPT_Image_2026_5_23__11_12_18-2e82c5db-47ff-4a69-aae2-ff1e9a780550.png"
)

OUTPUTS: dict[int, str] = {
    0: "smoke-sit-enter.png",
    1: "smoke-sit-rest-a.png",
    2: "smoke-sit-rest-b.png",
}


def main() -> None:
    sheet_path = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_SHEET
    if not sheet_path.exists():
        raise SystemExit(f"Sheet not found: {sheet_path}")

    print(f"sheet:  {sheet_path}")
    print(f"out:    {FRAMES}")
    import_sheet_column(sheet_path, OUTPUTS)
    print("done")


if __name__ == "__main__":
    main()
