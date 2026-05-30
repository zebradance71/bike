"""Import mission (M) from per-pose #FF00FF magenta PNGs."""
from __future__ import annotations

import _paths  # noqa: F401

from frame_import_common import FRAMES, GENERATION_PROMPT_SNIPPET, import_magenta_cell
from resolve_paths import resolve_assets_dir

CELLS: tuple[tuple[str, str], ...] = (
    ("mission-run-magenta.png", "mission-run.png"),
    ("mission-start-magenta.png", "mission-start.png"),
    ("smoke-only-magenta.png", "smoke-only.png"),
    ("smoke-big-magenta.png", "smoke-big.png"),
    ("mission-arrive-magenta.png", "mission-arrive.png"),
)


def main() -> None:
    assets = resolve_assets_dir("mission-run-magenta.png")
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
