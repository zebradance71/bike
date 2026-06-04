"""Import BIKE idle + idle embellishment frames from per-pose #FF00FF magenta PNGs."""
from __future__ import annotations

import importlib.util
from pathlib import Path

import _paths  # noqa: F401

from frame_import_common import FRAMES, GENERATION_PROMPT_SNIPPET, import_magenta_cell

REPO_ROOT = Path(__file__).resolve().parents[3]
BIKE_ASSETS = REPO_ROOT / "src" / "companion" / "characters" / "bike" / "assets"

CELLS: tuple[tuple[str, str], ...] = (
    ("idle-magenta.png", "idle.png"),
    ("idle-vibrate-a-magenta.png", "idle-vibrate-a.png"),
    ("idle-vibrate-b-magenta.png", "idle-vibrate-b.png"),
    ("idle-exhaust-a-magenta.png", "idle-exhaust-a.png"),
    ("idle-exhaust-b-magenta.png", "idle-exhaust-b.png"),
)

EXHAUST_OUT = frozenset({"idle-exhaust-a.png", "idle-exhaust-b.png"})


def _load_composite_module():
    path = Path(__file__).with_name("composite-exhaust-on-idle.py")
    spec = importlib.util.spec_from_file_location("composite_exhaust_on_idle", path)
    if not spec or not spec.loader:
        raise RuntimeError("composite-exhaust-on-idle.py not found")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main() -> None:
    assets = BIKE_ASSETS
    print(f"assets: {assets}")
    print(f"out:    {FRAMES}")
    print(f"prompt: {GENERATION_PROMPT_SNIPPET}")
    missing = [s for s, _ in CELLS if not (assets / s).exists()]
    if missing:
        raise SystemExit(
            "Missing magenta cells in src/companion/characters/bike/assets:\n  "
            + "\n  ".join(missing)
        )

    composite = _load_composite_module()
    hero_path = FRAMES / "idle.png"

    for src_name, out_name in CELLS:
        if out_name in EXHAUST_OUT:
            continue
        import_magenta_cell(assets / src_name, out_name)

    if not hero_path.exists():
        raise SystemExit("idle.png missing after import")

    print("exhaust: smoke overlay on idle hero (bike size unchanged)")
    for src_name, out_name in CELLS:
        if out_name not in EXHAUST_OUT:
            continue
        composite.composite_exhaust_on_hero(
            hero_path, assets / src_name, FRAMES / out_name
        )

    print("done - bump FRAME_ASSET_REV in bike/frames/frameAssetUrl.ts if needed")


if __name__ == "__main__":
    main()
