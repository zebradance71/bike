"""Generate tray icon assets from idle.png.

Usage:
    py -3 scripts/pack-tools/build-tray-icon.py
"""
from __future__ import annotations

from pathlib import Path

try:
    from PIL import Image
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "Pillow is required. Install with `py -3 -m pip install Pillow`."
    ) from exc

from resolve_paths import assets_dir, idle_frame_path

PNG_SIZES = [16, 24, 32, 48, 64, 128, 256]
ICO_SIZES = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]


def main() -> None:
    src = idle_frame_path()
    if not src.exists():
        raise SystemExit(f"idle source not found: {src}")

    out = assets_dir()
    out.mkdir(parents=True, exist_ok=True)

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

    resized: dict[int, Image.Image] = {}
    for px in PNG_SIZES:
        frame = square.resize((px, px), Image.LANCZOS)
        resized[px] = frame
        frame.save(out / f"tray-{px}.png")

    resized[32].save(out / "tray.png")
    square.save(out / "tray.ico", format="ICO", sizes=ICO_SIZES)

    print("[tray-icon] wrote", out)
    for px in PNG_SIZES:
        print(f"  - tray-{px}.png")
    print("  - tray.png")
    print("  - tray.ico")


if __name__ == "__main__":
    main()
