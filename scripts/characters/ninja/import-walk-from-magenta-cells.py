"""Import WALK frames from per-pose #FF00FF magenta PNGs."""
from __future__ import annotations

import _paths  # noqa: F401

from frame_import_common import FRAMES, GENERATION_PROMPT_SNIPPET, import_magenta_cell
from resolve_paths import resolve_assets_dir

CELLS: tuple[tuple[str, str], ...] = (
    ("walk-1-magenta.png", "walk-1.png"),
    ("walk-2-magenta.png", "walk-2.png"),
    ("walk-3-magenta.png", "walk-3.png"),
    ("walk-4-magenta.png", "walk-4.png"),
)


def main() -> None:
    assets = resolve_assets_dir("walk-1-magenta.png")
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
