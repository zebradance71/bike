"""Import RUN frames from per-pose #FF00FF magenta PNGs."""
from __future__ import annotations

import _paths  # noqa: F401

from frame_import_common import FRAMES, GENERATION_PROMPT_SNIPPET, import_magenta_cell
from resolve_paths import resolve_assets_dir

CELLS: tuple[tuple[str, str], ...] = (
    ("run-a-magenta.png", "run-a.png"),
    ("run-b-magenta.png", "run-b.png"),
    ("run-c-magenta.png", "run-c.png"),
    ("run-d-magenta.png", "run-d.png"),
)


def main() -> None:
    assets = resolve_assets_dir("run-c-magenta.png")
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
