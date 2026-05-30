"""Import smoke (S) frames from per-cell #FF00FF magenta PNGs."""
from __future__ import annotations

import _paths  # noqa: F401

from frame_import_common import FRAMES, GENERATION_PROMPT_SNIPPET, import_magenta_cell
from resolve_paths import resolve_assets_dir

CELLS: tuple[tuple[str, str], ...] = (
    ("smoke-sit-enter-magenta.png", "smoke-sit-enter.png"),
    ("smoke-sit-rest-a-magenta.png", "smoke-sit-rest-a.png"),
    ("smoke-sit-rest-b-magenta.png", "smoke-sit-rest-b.png"),
)


def main() -> None:
    assets = resolve_assets_dir("smoke-sit-enter-magenta.png")
    print(f"assets: {assets}")
    print(f"out:    {FRAMES}")
    print(f"prompt: {GENERATION_PROMPT_SNIPPET}")
    for src_name, out_name in CELLS:
        src = assets / src_name
        if not src.exists():
            raise SystemExit(f"Missing {src} — generate magenta cell from reference first.")
        import_magenta_cell(src, out_name)
    print("done")


if __name__ == "__main__":
    main()
