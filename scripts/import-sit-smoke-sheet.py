"""Legacy 3-column sit sheet (cols 1–2 only). Prefer import-smoke-sit / import-shift-smoke.

Usage:
  py -3 scripts/import-sit-smoke-sheet.py [path-to-sheet.png]
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from frame_import_common import FRAMES, import_sheet_column

DEFAULT_SHEET = Path(
    r"C:\Users\strea\.cursor\projects\c-Users-strea-Develop-ToriiLabs-Ninja2\assets"
    r"\c__Users_strea_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_"
    r"ChatGPT_Image_2026_5_23__11_12_14-64d630a7-6363-47d6-889e-af97e2426cfd.png"
)

OUTPUTS: dict[int, str] = {
    1: "sit-rest-tight.png",
    2: "sit-med-a-tight.png",
}


def main() -> None:
    sheet_path = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_SHEET
    if not sheet_path.exists():
        raise SystemExit(f"Sheet not found: {sheet_path}")

    print(f"sheet:  {sheet_path}")
    print(f"out:    {FRAMES}")
    import_sheet_column(sheet_path, OUTPUTS)
    print("  col0 skipped (enter)")
    print("done")


if __name__ == "__main__":
    main()
