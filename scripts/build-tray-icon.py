"""Compatibility shim — run scripts/pack-tools/build-tray-icon.py."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

TARGET = Path(__file__).resolve().parent / "pack-tools" / "build-tray-icon.py"

if __name__ == "__main__":
    raise SystemExit(subprocess.call([sys.executable, str(TARGET), *sys.argv[1:]]))
