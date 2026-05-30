"""Crop 2×3 mission reference sheet into per-pose refs (skip top-left cell)."""
from __future__ import annotations

import sys
from pathlib import Path

import _paths  # noqa: F401

from frame_import_common import split_grid
from PIL import Image
from resolve_paths import assets_dir

REFS: tuple[tuple[int, str], ...] = (
    (1, "mission-run"),
    (2, "mission-start"),
    (3, "smoke-only"),
    (4, "smoke-big"),
    (5, "mission-arrive"),
)


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(
            "Usage: py -3 scripts/characters/ninja/extract-mission-cell-refs.py <sheet.png>"
        )

    assets = assets_dir()
    sheet_path = Path(sys.argv[1])
    if not sheet_path.is_absolute():
        sheet_path = assets / sheet_path
    if not sheet_path.exists():
        raise SystemExit(f"Sheet not found: {sheet_path}")

    out_dir = assets / "mission-ref"
    out_dir.mkdir(parents=True, exist_ok=True)

    sheet = Image.open(sheet_path).convert("RGBA")
    cells = split_grid(sheet, cols=2, rows=3)
    print(f"sheet: {sheet_path}")
    print(f"out:   {out_dir}")
    for idx, stem in REFS:
        path = out_dir / f"{stem}-ref.png"
        cells[idx].save(path, format="PNG")
        print(f"  {path.name}")
    print("done - generate assets/<stem>-magenta.png from each ref")


if __name__ == "__main__":
    main()
