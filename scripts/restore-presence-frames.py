"""Restore walk + idle hero using the same path as peek (process_cell → normalize-idle-frames).

Peek looks correct because it uses normalize-idle-frames canvases, not idle-base-tight
nor polish-walk + aggressive downscale.

Run: py -3 scripts/restore-presence-frames.py
"""
from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FRAMES = ROOT / "src/companion/assets/frames"

CELL_NAMES = [
    "idle-1",
    "walk-1",
    "walk-2",
    "walk-3",
    "walk-4",
    "peek-1",
    "peek-2",
    "peek-3",
]


def load_smoke():
    path = ROOT / "scripts/import-smoke-sheet.py"
    spec = importlib.util.spec_from_file_location("import_smoke_sheet", path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["import_smoke_sheet"] = mod
    spec.loader.exec_module(mod)
    return mod


def process_raw_cells(mod) -> None:
    print("process raw cells (single pass, no polish-walk / no downscale)")
    for name in CELL_NAMES:
        raw_path = FRAMES / f"{name}-raw.png"
        if not raw_path.exists():
            print(f"  skip {name}: no {raw_path.name}")
            continue
        cell = Image.open(raw_path).convert("RGB")
        proc = mod.process_cell(cell)
        out = FRAMES / f"{name}.png"
        proc.save(out, "PNG", optimize=True)
        print(f"  {name}.png {proc.size[0]}x{proc.size[1]}")


def main() -> None:
    mod = load_smoke()
    process_raw_cells(mod)
    print("normalize (body + walk + peek, same pipeline as peek)")
    subprocess.run(
        [sys.executable, str(ROOT / "scripts/normalize-idle-frames.py")],
        check=True,
    )


if __name__ == "__main__":
    main()
