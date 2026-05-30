"""Regenerate every runtime display PNG on the idle-1 hero canvas (peek-quality path).

Run: py -3 scripts/regen-all-display.py
Then bump FRAME_ASSET_REV if not already done in frameAssetUrl.ts
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = [
    "restore-presence-frames.py",
    "import-idle-glance-sheet.py",
    "import-smoke-sheet.py",
    "import-sit-sheet.py",
]


def main() -> None:
    for name in SCRIPTS:
        path = ROOT / "scripts" / name
        print(f"\n=== {name} ===")
        subprocess.run([sys.executable, str(path)], check=True)


if __name__ == "__main__":
    main()
