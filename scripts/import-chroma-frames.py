"""Import magenta-chroma PNGs into companion frames.

Expects assets already on #FF00FF (or raw magenta); keys from border only.

Usage:
  py -3 scripts/import-chroma-frames.py [assets_dir]
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from frame_import_common import FRAMES, import_magenta_cell, reference_char_height

ROOT = Path(__file__).resolve().parents[1]

SOURCES: dict[str, str] = {
    "idle.png": "ninja_idle_chroma.png",
    "look-2.png": "ninja_chroma_look_2.png",
    "look-3.png": "ninja_chroma_look_3.png",
    "mission-start.png": "ninja_chroma_mission_start.png",
    "mission-run.png": "ninja_chroma_mission_run.png",
    "smoke-only.png": "ninja_chroma_smoke_only.png",
    "smoke-big.png": "ninja_chroma_smoke_big.png",
    "mission-arrive.png": "ninja_chroma_mission_arrive.png",
}


def resolve_assets_dir(argv: list[str]) -> Path:
    if len(argv) > 1:
        return Path(argv[1]).resolve()
    candidates = [
        ROOT / "assets",
        Path(
            r"C:\Users\strea\.cursor\projects\c-Users-strea-Develop-ToriiLabs-Ninja2\assets"
        ),
    ]
    for c in candidates:
        if (c / "ninja_idle_chroma.png").exists():
            return c
    raise SystemExit("assets dir not found — pass path to folder with ninja_*_chroma.png")


def main() -> None:
    assets = resolve_assets_dir(sys.argv)
    FRAMES.mkdir(parents=True, exist_ok=True)

    print(f"assets: {assets}")
    print(f"out:    {FRAMES}")
    target_h = reference_char_height(FRAMES)
    print(f"target_char_h (I/idle): {target_h}")

    for out_name, src_name in SOURCES.items():
        src = assets / src_name
        if not src.exists():
            print(f"  SKIP {out_name}: missing {src_name}")
            continue
        import_magenta_cell(src, out_name)

    print("done")


if __name__ == "__main__":
    main()
