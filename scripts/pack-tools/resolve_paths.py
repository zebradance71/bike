"""Repo-relative paths for frame import and icon build scripts."""
from __future__ import annotations

import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def load_branding() -> dict:
    path = REPO_ROOT / "branding.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def assets_dir() -> Path:
    return REPO_ROOT / "assets"


def frames_dir() -> Path:
    return REPO_ROOT / "src" / "companion" / "assets" / "frames"


def idle_frame_path() -> Path:
    return frames_dir() / "idle.png"


def block_idle_frame_path() -> Path:
    return frames_dir() / "block-idle.png"


def icon_frame_path() -> Path:
    """Preferred companion frame for tray / app icons (Bike → block-idle)."""
    if load_branding().get("characterId") == "bike":
        block = block_idle_frame_path()
        if block.exists():
            return block
    return idle_frame_path()


def app_icon_svg_path() -> Path:
    """Pixel SVG fallback when no raster source is present."""
    return REPO_ROOT / "design" / "icon" / "app-icon.svg"


def app_icon_png_path() -> Path:
    """Canonical app/tray icon raster source (preferred when present)."""
    return REPO_ROOT / "design" / "icon" / "app-icon-source.png"


def resolve_assets_dir(*marker_names: str) -> Path:
    """Return repo assets/ when any marker file exists there."""
    root_assets = assets_dir()
    for name in marker_names:
        if (root_assets / name).exists():
            return root_assets
    return root_assets
