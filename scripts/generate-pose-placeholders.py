"""Generate placeholder dedicated pose PNGs from the processed ninja sprite.

Run: py -3 scripts/generate-pose-placeholders.py
Replace outputs under src/companion/assets/poses/ with final art later.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "src/companion/assets/char-concept-e-refined.png"
OUT_DIR = ROOT / "src/companion/assets/poses"


def save(im: Image.Image, name: str) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / name
    im.save(path, optimize=True)
    print(f"  {path.relative_to(ROOT)}")


def make_walk_frames(src: Image.Image) -> None:
    w, h = src.size
    for i, (dx, dy, skew) in enumerate([(4, -3, -0.04), (-4, -3, 0.04)], start=1):
        layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        shifted = src.transform(
            (w, h),
            Image.AFFINE,
            (1, skew, dx, 0, 1, dy),
            resample=Image.Resampling.BICUBIC,
        )
        layer.alpha_composite(shifted)
        save(layer, f"walk-{i}.png")


def make_sit(src: Image.Image) -> None:
    w, h = src.size
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    # Lower body compressed; full figure shifted down (dedicated sit silhouette)
    lower = src.crop((0, int(h * 0.32), w, h))
    lower_h = int(lower.height * 0.72)
    lower = lower.resize((int(w * 1.05), lower_h), Image.Resampling.LANCZOS)
    upper = src.crop((0, 0, w, int(h * 0.52)))
    upper = upper.resize((int(w * 0.98), int(upper.height * 0.92)), Image.Resampling.LANCZOS)

    shadow = src.crop((int(w * 0.12), int(h * 0.88), int(w * 0.88), h))
    canvas.alpha_composite(shadow, (int(w * 0.08), h - shadow.height - 2))
    canvas.alpha_composite(lower, (int(w * 0.02) - int(w * 0.025), h - lower_h - 4))
    canvas.alpha_composite(upper, (int(w * 0.04), h - lower_h - upper.height + 8))
    save(canvas, "sit.png")


def make_peek(src: Image.Image) -> None:
    w, h = src.size
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    # Face band only, anchored left — for screen-edge peek
    band = src.crop((int(w * 0.52), int(h * 0.02), int(w * 0.98), int(h * 0.42)))
    bw, bh = band.size
    canvas.alpha_composite(band, (int(w * 0.02), int(h * 0.38) - bh // 2))
    save(canvas, "peek.png")


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"Missing source: {SOURCE}")

    src = Image.open(SOURCE).convert("RGBA")
    print(f"Source {src.size[0]}x{src.size[1]}")

    save(src.copy(), "idle.png")
    make_walk_frames(src)
    make_sit(src)
    make_peek(src)
    print("Done.")


if __name__ == "__main__":
    main()
