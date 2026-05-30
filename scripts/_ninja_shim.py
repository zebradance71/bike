"""Run a ninja character script from scripts/characters/ninja/."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

NINJA_DIR = Path(__file__).resolve().parent / "characters" / "ninja"


def run_shim() -> int:
    name = Path(sys.argv[0]).name
    target = NINJA_DIR / name
    if not target.exists():
        raise SystemExit(f"Ninja script not found: {target}")
    return subprocess.call([sys.executable, str(target), *sys.argv[1:]])
