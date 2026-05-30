"""Import Shift+S frames from per-cell #FF00FF magenta PNGs.

Generate first (reference-based, one file per pose), then run:

  py -3 scripts/import-shift-smoke-from-magenta-cells.py

Expects in assets/:
  shift-smoke-enter-magenta.png
  shift-smoke-rest-a-magenta.png
  shift-smoke-rest-b-magenta.png
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from frame_import_common import FRAMES, GENERATION_PROMPT_SNIPPET, import_magenta_cell

ASSETS = Path(__file__).resolve().parents[1].parent / "assets"
if not ASSETS.exists():
    ASSETS = Path(
        r"C:\Users\strea\.cursor\projects\c-Users-strea-Develop-ToriiLabs-Ninja2\assets"
    )

CELLS: tuple[tuple[str, str], ...] = (
    ("shift-smoke-enter-magenta.png", "shift-smoke-enter.png"),
    ("shift-smoke-rest-a-magenta.png", "shift-smoke-rest-a.png"),
    ("shift-smoke-rest-b-magenta.png", "shift-smoke-rest-b.png"),
)


def main() -> None:
    print(f"assets: {ASSETS}")
    print(f"out:    {FRAMES}")
    print(f"prompt: {GENERATION_PROMPT_SNIPPET}")
    for src_name, out_name in CELLS:
        src = ASSETS / src_name
        if not src.exists():
            raise SystemExit(f"Missing {src} — generate magenta cell first.")
        import_magenta_cell(src, out_name)
    print("done")


if __name__ == "__main__":
    main()
