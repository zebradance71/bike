"""Fix straight alpha on all display PNGs (composites correctly on any desktop BG).

Run: py -3 scripts/fix-frame-alpha.py
Then bump FRAME_ASSET_REV in src/companion/ninja/frames/frameAssetUrl.ts
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FRAMES = ROOT / "src/companion/assets/frames"

SKIP = frozenset({"idle-base"})  # wide align ref only


def load_smoke():
    path = ROOT / "scripts/import-smoke-sheet.py"
    spec = importlib.util.spec_from_file_location("import_smoke_sheet", path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["import_smoke_sheet"] = mod
    spec.loader.exec_module(mod)
    return mod


def raw_for_output(out: Path) -> Path | None:
    stem = out.stem
    if stem.endswith("-tight"):
        cand = FRAMES / f"{stem.removesuffix('-tight')}-raw.png"
    else:
        cand = FRAMES / f"{stem}-raw.png"
    return cand if cand.exists() else None


def resolve_matte(out: Path, mod) -> tuple[int, int, int]:
    known = mod.matte_for_frame(out.stem)
    if known is not None:
        return known
    raw = raw_for_output(out)
    if raw is not None:
        return mod.detect_matte_from_rgb(Image.open(raw).convert("RGB"))
    return mod.detect_corner_matte(Image.open(out).convert("RGBA"))


def fix_png(path: Path, mod, matte: tuple[int, int, int]) -> None:
    im = Image.open(path).convert("RGBA")
    im = mod.straighten_alpha_rgba(im, matte)
    mod.save_display_frame(im, path)


def main() -> None:
    mod = load_smoke()
    paths = sorted(
        p
        for p in FRAMES.glob("*.png")
        if not p.name.endswith("-raw.png")
        and p.stem not in SKIP
        and "-h" not in p.stem
    )
    print(f"fix alpha: {len(paths)} files")
    for path in paths:
        matte = resolve_matte(path, mod)
        fix_png(path, mod, matte)
        print(f"  {path.name} matte={matte}")


if __name__ == "__main__":
    main()
