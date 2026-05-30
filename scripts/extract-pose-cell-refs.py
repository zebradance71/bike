"""Compatibility shim — scripts/characters/ninja/extract-pose-cell-refs.py"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

TARGET = Path(__file__).resolve().parent / "characters" / "ninja" / "extract-pose-cell-refs.py"

if __name__ == "__main__":
    raise SystemExit(subprocess.call([sys.executable, str(TARGET), *sys.argv[1:]]))
