"""Import 3-column shiftSmoke meditation sheet.

See .cursor/rules/ninja-frame-import.mdc
Generate: solid #FF00FF only (scripts/frame_import_common.GENERATION_PROMPT_SNIPPET)

Columns:
  0 -> shift-smoke-enter.png
  1 -> shift-smoke-rest-a.png
  2 -> shift-smoke-rest-b.png

Usage:
  py -3 scripts/import-shift-smoke-sheet.py [path-to-sheet.png]
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from frame_import_common import FRAMES, import_sheet_column

DEFAULT_SHEET = Path(
    r"C:\Users\strea\.cursor\projects\c-Users-strea-Develop-ToriiLabs-Ninja2\assets"
    r"\c__Users_strea_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_"
    r"ChatGPT_Image_2026_5_23__11_12_14-42cb7bef-8c9d-4147-876b-84d59479d64e.png"
)

OUTPUTS: dict[int, str] = {
    0: "shift-smoke-enter.png",
    1: "shift-smoke-rest-a.png",
    2: "shift-smoke-rest-b.png",
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
