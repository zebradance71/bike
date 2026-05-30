"""Import Shift+S frames from per-cell #FF00FF magenta PNGs."""
from __future__ import annotations

import _paths  # noqa: F401

from frame_import_common import FRAMES, GENERATION_PROMPT_SNIPPET, import_magenta_cell
from resolve_paths import resolve_assets_dir

CELLS: tuple[tuple[str, str], ...] = (
    ("shift-smoke-enter-magenta.png", "shift-smoke-enter.png"),
    ("shift-smoke-rest-a-magenta.png", "shift-smoke-rest-a.png"),
    ("shift-smoke-rest-b-magenta.png", "shift-smoke-rest-b.png"),
)


def main() -> None:
    assets = resolve_assets_dir("shift-smoke-enter-magenta.png")
    print(f"assets: {assets}")
    print(f"out:    {FRAMES}")
    print(f"prompt: {GENERATION_PROMPT_SNIPPET}")
    for src_name, out_name in CELLS:
        src = assets / src_name
        if not src.exists():
            raise SystemExit(f"Missing {src} — generate magenta cell first.")
        import_magenta_cell(src, out_name)
    print("done")


if __name__ == "__main__":
    main()
