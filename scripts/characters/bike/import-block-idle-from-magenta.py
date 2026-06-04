"""Import BIKE block-idle from #FF00FF magenta PNG."""
from __future__ import annotations

from pathlib import Path

import _paths  # noqa: F401

from frame_import_common import FRAMES, GENERATION_PROMPT_SNIPPET, import_magenta_cell

REPO_ROOT = Path(__file__).resolve().parents[3]
BIKE_ASSETS = REPO_ROOT / "src" / "companion" / "characters" / "bike" / "assets"


def main() -> None:
    src = BIKE_ASSETS / "block-idle-magenta.png"
    if not src.exists():
        raise SystemExit(f"Missing {src}")
    print(f"assets: {BIKE_ASSETS}")
    print(f"out:    {FRAMES}")
    print(f"prompt: {GENERATION_PROMPT_SNIPPET}")
    import_magenta_cell(src, "block-idle.png")
    print("done")


if __name__ == "__main__":
    main()
