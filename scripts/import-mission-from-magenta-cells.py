"""Import mission (M) from per-pose #FF00FF magenta PNGs (same workflow as S / Shift+S).

1. Reference 2×3 sheet → extract refs:
     py -3 scripts/extract-mission-cell-refs.py
2. Attach each *-ref.png; generate ONE magenta PNG per pose into assets/:
     mission-run-magenta.png, mission-start-magenta.png, smoke-only-magenta.png,
     smoke-big-magenta.png, mission-arrive-magenta.png
   Prompt: solid #FF00FF magenta background only, no transparency, no black, no checkerboard
3. Import:
     py -3 scripts/import-mission-from-magenta-cells.py

Log must show: chroma sheet - key only, no black paint
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
        if (candidate / "mission-run-magenta.png").exists():
            return candidate
    if CURSOR_ASSETS.exists():
        return CURSOR_ASSETS
    return ROOT / "assets"

CELLS: tuple[tuple[str, str], ...] = (
    ("mission-run-magenta.png", "mission-run.png"),
    ("mission-start-magenta.png", "mission-start.png"),
    ("smoke-only-magenta.png", "smoke-only.png"),
    ("smoke-big-magenta.png", "smoke-big.png"),
    ("mission-arrive-magenta.png", "mission-arrive.png"),
)


def main() -> None:
    assets = resolve_assets_dir()
    print(f"assets: {assets}")
    print(f"out:    {FRAMES}")
    print(f"prompt: {GENERATION_PROMPT_SNIPPET}")
    missing = [s for s, _ in CELLS if not (assets / s).exists()]
    if missing:
        raise SystemExit(
            "Missing magenta cells — generate from mission-ref/*-ref.png first:\n  "
            + "\n  ".join(missing)
        )
    for src_name, out_name in CELLS:
        import_magenta_cell(assets / src_name, out_name)
    print("done")


if __name__ == "__main__":
    main()
