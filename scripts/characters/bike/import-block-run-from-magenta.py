"""Import BIKE block-run 2x2 from per-pose #FF00FF magenta PNGs."""
from __future__ import annotations

import importlib.util
from pathlib import Path

import _paths  # noqa: F401

from frame_import_common import FRAMES, GENERATION_PROMPT_SNIPPET, import_magenta_cell

REPO_ROOT = Path(__file__).resolve().parents[3]
BIKE_ASSETS = REPO_ROOT / "src" / "companion" / "characters" / "bike" / "assets"

CELLS: tuple[tuple[str, str], ...] = (
    ("block-run-a-magenta.png", "block-run-a.png"),
    ("block-run-b-magenta.png", "block-run-b.png"),
    ("block-run-c-magenta.png", "block-run-c.png"),
    ("block-run-d-magenta.png", "block-run-d.png"),
)


def main() -> None:
    missing = [s for s, _ in CELLS if not (BIKE_ASSETS / s).exists()]
    if missing:
        raise SystemExit(
            "Missing in src/companion/characters/bike/assets:\n  " + "\n  ".join(missing)
        )
    print(f"assets: {BIKE_ASSETS}")
    print(f"out:    {FRAMES}")
    print(f"prompt: {GENERATION_PROMPT_SNIPPET}")
    for src_name, out_name in CELLS:
        import_magenta_cell(BIKE_ASSETS / src_name, out_name)

    align_path = Path(__file__).with_name("align-variant-to-idle.py")
    spec = importlib.util.spec_from_file_location("align_variant_to_idle", align_path)
    if spec and spec.loader:
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        hero = FRAMES / "block-idle.png"
        for _, out_name in CELLS:
            mod.align_to_hero(hero, FRAMES / out_name)

    print("done")


if __name__ == "__main__":
    main()
