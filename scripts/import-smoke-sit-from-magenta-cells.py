"""Import smoke (S) frames from per-cell #FF00FF magenta PNGs.

Same workflow as import-shift-smoke-from-magenta-cells.py:
  1. Reference 3-column sheet -> generate 1 magenta PNG per pose
  2. py -3 scripts/import-smoke-sit-from-magenta-cells.py

Expects in assets/:
  smoke-sit-enter-magenta.png
  smoke-sit-rest-a-magenta.png
  smoke-sit-rest-b-magenta.png
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from frame_import_common import FRAMES, GENERATION_PROMPT_SNIPPET, import_magenta_cell

ASSETS = Path(
    r"C:\Users\strea\.cursor\projects\c-Users-strea-Develop-ToriiLabs-Ninja2\assets"
)

CELLS: tuple[tuple[str, str], ...] = (
    ("smoke-sit-enter-magenta.png", "smoke-sit-enter.png"),
    ("smoke-sit-rest-a-magenta.png", "smoke-sit-rest-a.png"),
    ("smoke-sit-rest-b-magenta.png", "smoke-sit-rest-b.png"),
)


def main() -> None:
    print(f"assets: {ASSETS}")
    print(f"out:    {FRAMES}")
    print(f"prompt: {GENERATION_PROMPT_SNIPPET}")
    for src_name, out_name in CELLS:
        src = ASSETS / src_name
        if not src.exists():
            raise SystemExit(f"Missing {src} — generate magenta cell from reference first.")
        import_magenta_cell(src, out_name)
    print("done")


if __name__ == "__main__":
    main()
