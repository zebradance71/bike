"""Import WALK frames from per-pose #FF00FF magenta PNGs.

Workflow:
1. Generate ONE magenta PNG per pose (#FF00FF background, no transparency):
     assets/walk-1-magenta.png
     assets/walk-2-magenta.png
     assets/walk-3-magenta.png
     assets/walk-4-magenta.png
2. py -3 scripts/import-walk-from-magenta-cells.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from frame_import_common import FRAMES, GENERATION_PROMPT_SNIPPET, import_magenta_cell

ROOT = Path(__file__).resolve().parents[1]
CURSOR_ASSETS = Path(
    r"C:\Users\strea\.cursor\projects\c-Users-strea-Develop-ToriiLabs-Ninja2\assets"
)


def resolve_assets_dir() -> Path:
    for candidate in (CURSOR_ASSETS, ROOT / "assets"):
        if (candidate / "walk-1-magenta.png").exists():
            return candidate
    if CURSOR_ASSETS.exists():
        return CURSOR_ASSETS
    return ROOT / "assets"


CELLS: tuple[tuple[str, str], ...] = (
    ("walk-1-magenta.png", "walk-1.png"),
    ("walk-2-magenta.png", "walk-2.png"),
    ("walk-3-magenta.png", "walk-3.png"),
    ("walk-4-magenta.png", "walk-4.png"),
)


def main() -> None:
    assets = resolve_assets_dir()
    print(f"assets: {assets}")
    print(f"out:    {FRAMES}")
    print(f"prompt: {GENERATION_PROMPT_SNIPPET}")
    missing = [s for s, _ in CELLS if not (assets / s).exists()]
    if missing:
        raise SystemExit(
            "Missing magenta cells - generate walk-{1,2,3,4}-magenta.png first:\n  "
            + "\n  ".join(missing)
        )
    for src_name, out_name in CELLS:
        import_magenta_cell(assets / src_name, out_name)
    print("done")


if __name__ == "__main__":
    main()
