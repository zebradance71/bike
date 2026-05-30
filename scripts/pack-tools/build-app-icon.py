"""Generate Windows app icon (`build/icon.ico`) from design/icon/app-icon-source.png.

Priority: app-icon-source.png > app-icon.svg > idle.png crop.

Usage:
    py -3 scripts/pack-tools/build-app-icon.py
"""
from __future__ import annotations

from icon_from_svg import ICO_SIZES, write_ico
from icon_master import load_icon_master
from resolve_paths import REPO_ROOT

OUT_DIR = REPO_ROOT / "build"
OUT_ICO = OUT_DIR / "icon.ico"
OUT_PNG_256 = OUT_DIR / "icon.png"


def main() -> None:
    master, source = load_icon_master()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    write_ico(master, OUT_ICO)
    master.save(OUT_PNG_256)

    print(f"[app-icon] source {source}")
    print(f"[app-icon] wrote {OUT_ICO} sizes={ICO_SIZES}")
    print(f"[app-icon] wrote {OUT_PNG_256}")


if __name__ == "__main__":
    main()
