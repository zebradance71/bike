"""Generate Windows app icon (`build/icon.ico`) from idle.png.

Usage:
    py -3 scripts/pack-tools/build-app-icon.py
"""
from __future__ import annotations

from pathlib import Path

try:
    from PIL import Image
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "Pillow is required. Install with `py -3 -m pip install Pillow`."
    ) from exc

from resolve_paths import REPO_ROOT, idle_frame_path

OUT_DIR = REPO_ROOT / "build"
OUT_ICO = OUT_DIR / "icon.ico"
OUT_PNG_256 = OUT_DIR / "icon.png"

ICO_SIZES = [
    (16, 16),
    (24, 24),
    (32, 32),
    (48, 48),
    (64, 64),
    (128, 128),
    (256, 256),
]


def main() -> None:
    src = idle_frame_path()
    if not src.exists():
        raise SystemExit(f"idle source not found: {src}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    img = Image.open(src).convert("RGBA")
    bbox = img.getbbox()
    if bbox is None:
        raise SystemExit("idle.png is fully transparent; nothing to crop")
    cropped = img.crop(bbox)

    side = max(cropped.size)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    ox = (side - cropped.size[0]) // 2
    oy = (side - cropped.size[1]) // 2
    square.paste(cropped, (ox, oy), cropped)

    square.save(OUT_ICO, format="ICO", sizes=ICO_SIZES)
    square.resize((256, 256), Image.LANCZOS).save(OUT_PNG_256)

    print(f"[app-icon] wrote {OUT_ICO}")
    print(f"[app-icon] wrote {OUT_PNG_256}")


if __name__ == "__main__":
    main()
