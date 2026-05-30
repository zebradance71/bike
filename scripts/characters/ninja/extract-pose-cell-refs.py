"""Crop 3-column pose (P) reference sheet into per-pose refs."""
from __future__ import annotations

import sys
from pathlib import Path

import _paths  # noqa: F401

from frame_import_common import split_columns
from PIL import Image
from resolve_paths import assets_dir

REFS: tuple[tuple[int, str], ...] = (
    (0, "peek-1"),
    (1, "peek-2"),
    (2, "peek-3"),
)


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(
            "Usage: py -3 scripts/characters/ninja/extract-pose-cell-refs.py <sheet.png>"
        )

    assets = assets_dir()
    sheet_path = Path(sys.argv[1])
    if not sheet_path.is_absolute():
        sheet_path = assets / sheet_path
    if not sheet_path.exists():
        raise SystemExit(f"Sheet not found: {sheet_path}")

    out_dir = assets / "pose-ref"
    out_dir.mkdir(parents=True, exist_ok=True)

    sheet = Image.open(sheet_path).convert("RGBA")
    cells = split_columns(sheet, 3)
    print(f"sheet: {sheet_path}")
    print(f"out:   {out_dir}")
    for idx, stem in REFS:
        path = out_dir / f"{stem}-ref.png"
        cells[idx].save(path, format="PNG")
        print(f"  {path.name}")
    print("done - generate assets/<stem>-magenta.png from each ref")


if __name__ == "__main__":
    main()
