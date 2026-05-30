"""Import RUN frames from per-pose #FF00FF magenta PNGs.

1. py -3 scripts/extract-run-cell-refs.py
2. Generate ONE magenta PNG per pose (#FF00FF background):
     assets/run-a-magenta.png, run-b-magenta.png, run-c-magenta.png, run-d-magenta.png
3. py -3 scripts/import-run-from-magenta-cells.py
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
        if (candidate / "run-c-magenta.png").exists():
            return candidate
    if CURSOR_ASSETS.exists():
        return CURSOR_ASSETS
    return ROOT / "assets"


CELLS: tuple[tuple[str, str], ...] = (
    ("run-a-magenta.png", "run-a.png"),
    ("run-b-magenta.png", "run-b.png"),
    ("run-c-magenta.png", "run-c.png"),
    ("run-d-magenta.png", "run-d.png"),
)


def main() -> None:
    assets = resolve_assets_dir()
    print(f"assets: {assets}")
    print(f"out:    {FRAMES}")
    print(f"prompt: {GENERATION_PROMPT_SNIPPET}")
    missing = [s for s, _ in CELLS if not (assets / s).exists()]
    if missing:
        raise SystemExit(
            "Missing magenta cells - generate from run-ref/*-ref.png first:\n  "
            + "\n  ".join(missing)
        )
    for src_name, out_name in CELLS:
        import_magenta_cell(assets / src_name, out_name)
    print("done")


if __name__ == "__main__":
    main()
