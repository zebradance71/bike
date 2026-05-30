"""Generate tray icon assets from design/icon/app-icon-source.png.

Priority: app-icon-source.png > app-icon.svg > idle.png crop.

Usage:
    py -3 scripts/pack-tools/build-tray-icon.py
"""
from __future__ import annotations

from icon_from_svg import TRAY_PNG_SIZES, write_tray_assets
from icon_master import load_icon_master
from resolve_paths import assets_dir


def main() -> None:
    master, source = load_icon_master()
    out = assets_dir()
    write_tray_assets(master, out)

    print(f"[tray-icon] source {source}")
    print(f"[tray-icon] wrote {out}")
    for px in TRAY_PNG_SIZES:
        print(f"  - tray-{px}.png")
    print("  - tray.png")
    print("  - tray.ico")


if __name__ == "__main__":
    main()
