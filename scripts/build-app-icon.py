"""Generate the Windows app icon (`build/icon.ico`) from idle.png.

electron-builder uses `build/icon.ico` as both the .exe icon and the
installer / Add-Remove-Programs icon. We produce a single multi-resolution
ICO so Windows picks the best size for every context (Start menu, taskbar,
Alt-Tab, large-icon view).

Usage:
    py -3 scripts/build-app-icon.py

Idempotent: re-run after editing idle.png to refresh.
"""
from __future__ import annotations

from pathlib import Path

try:
    from PIL import Image
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "Pillow is required. Install with `py -3 -m pip install Pillow`."
    ) from exc


REPO = Path(__file__).resolve().parent.parent
SRC = REPO / "src" / "companion" / "assets" / "frames" / "idle.png"
OUT_DIR = REPO / "build"
OUT_ICO = OUT_DIR / "icon.ico"
OUT_PNG_256 = OUT_DIR / "icon.png"  # backup for any platform that needs raw PNG

# Windows app icons should include all common sizes so the OS doesn't
# have to do its own (lower-quality) resampling. 256x256 is the largest
# size used in Explorer's extra-large icon view.
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
    if not SRC.exists():
        raise SystemExit(f"idle source not found: {SRC}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    img = Image.open(SRC).convert("RGBA")

    # Tight bbox crop so small sizes show the ninja, not a sea of transparency.
    bbox = img.getbbox()
    if bbox is None:
        raise SystemExit("idle.png is fully transparent; nothing to crop")
    cropped = img.crop(bbox)

    # Square-pad so resizing doesn't squish the proportions.
    side = max(cropped.size)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    ox = (side - cropped.size[0]) // 2
    oy = (side - cropped.size[1]) // 2
    square.paste(cropped, (ox, oy), cropped)

    # Multi-size ICO.
    square.save(OUT_ICO, format="ICO", sizes=ICO_SIZES)
    # Backup full-resolution PNG (also referenced by macOS/Linux targets).
    square.resize((256, 256), Image.LANCZOS).save(OUT_PNG_256)

    print(f"[app-icon] wrote {OUT_ICO}")
    print(f"[app-icon] wrote {OUT_PNG_256}")


if __name__ == "__main__":
    main()
