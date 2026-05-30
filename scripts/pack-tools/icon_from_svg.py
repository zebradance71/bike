"""Render crisp pixel SVG (rect-only) to PNG/ICO assets via Pillow."""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

try:
    from PIL import Image
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "Pillow is required. Install with `py -3 -m pip install Pillow`."
    ) from exc

SVG_NS = {"svg": "http://www.w3.org/2000/svg"}
HEX6 = re.compile(r"^#([0-9a-fA-F]{6})$")
HEX3 = re.compile(r"^#([0-9a-fA-F]{3})$")

ICO_SIZES = [
    (16, 16),
    (24, 24),
    (32, 32),
    (48, 48),
    (64, 64),
    (128, 128),
    (256, 256),
]

TRAY_PNG_SIZES = [16, 24, 32, 48, 64, 128, 256]


@dataclass(frozen=True)
class ViewBox:
    min_x: float
    min_y: float
    width: float
    height: float


@dataclass(frozen=True)
class SvgRect:
    x: int
    y: int
    width: int
    height: int
    rgba: tuple[int, int, int, int]


def _parse_viewbox(raw: str | None) -> ViewBox:
    if not raw:
        return ViewBox(0, 0, 24, 28)
    parts = [float(p) for p in raw.replace(",", " ").split()]
    if len(parts) != 4:
        raise ValueError(f"invalid viewBox: {raw!r}")
    return ViewBox(parts[0], parts[1], parts[2], parts[3])


def _parse_hex_color(value: str) -> tuple[int, int, int]:
    value = value.strip()
    m6 = HEX6.match(value)
    if m6:
        n = int(m6.group(1), 16)
        return ((n >> 16) & 255, (n >> 8) & 255, n & 255)
    m3 = HEX3.match(value)
    if m3:
        h = m3.group(1)
        return (int(h[0] * 2, 16), int(h[1] * 2, 16), int(h[2] * 2, 16))
    raise ValueError(f"unsupported fill color: {value!r}")


def _parse_opacity(value: str | None) -> float:
    if value is None:
        return 1.0
    return max(0.0, min(1.0, float(value)))


def _iter_rects(root: ET.Element) -> list[SvgRect]:
    rects: list[SvgRect] = []
    for node in root.iter():
        tag = node.tag.split("}")[-1]
        if tag != "rect":
            continue
        fill = node.attrib.get("fill", "#000000")
        if fill in ("none", "transparent"):
            continue
        rgba = (*_parse_hex_color(fill), int(_parse_opacity(node.attrib.get("opacity")) * 255))
        rects.append(
            SvgRect(
                x=int(float(node.attrib.get("x", 0))),
                y=int(float(node.attrib.get("y", 0))),
                width=int(float(node.attrib.get("width", 0))),
                height=int(float(node.attrib.get("height", 0))),
                rgba=rgba,
            )
        )
    return rects


def render_svg_raster(svg_path: Path) -> Image.Image:
    """Rasterize a rect-only pixel SVG at 1 SVG unit = 1 pixel."""
    root = ET.parse(svg_path).getroot()
    view = _parse_viewbox(root.attrib.get("viewBox"))
    w = max(1, int(round(view.width)))
    h = max(1, int(round(view.height)))
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    assert px is not None

    ox = -int(round(view.min_x))
    oy = -int(round(view.min_y))

    for rect in _iter_rects(root):
        color = rect.rgba
        for y in range(rect.y + oy, rect.y + oy + rect.height):
            if y < 0 or y >= h:
                continue
            for x in range(rect.x + ox, rect.x + ox + rect.width):
                if x < 0 or x >= w:
                    continue
                if color[3] >= 255:
                    px[x, y] = color
                elif color[3] > 0:
                    base = px[x, y]
                    a = color[3] / 255
                    px[x, y] = (
                        int(base[0] * (1 - a) + color[0] * a),
                        int(base[1] * (1 - a) + color[1] * a),
                        int(base[2] * (1 - a) + color[2] * a),
                        min(255, base[3] + color[3]),
                    )
    return img


def compose_square_nearest(img: Image.Image, out_px: int) -> Image.Image:
    """Crop to content bbox, center on a square canvas, scale with nearest-neighbor."""
    bbox = img.getbbox()
    if bbox is None:
        raise ValueError("SVG rendered empty; no visible pixels")

    cropped = img.crop(bbox)
    side = max(cropped.size)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    ox = (side - cropped.size[0]) // 2
    oy = (side - cropped.size[1]) // 2
    square.paste(cropped, (ox, oy), cropped)
    return square.resize((out_px, out_px), Image.NEAREST)


def load_icon_master(svg_path: Path, master_px: int = 256) -> Image.Image:
    return compose_square_nearest(render_svg_raster(svg_path), master_px)


def write_ico(master: Image.Image, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    master.save(out_path, format="ICO", sizes=ICO_SIZES)


def write_tray_assets(master: Image.Image, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for px in TRAY_PNG_SIZES:
        frame = master.resize((px, px), Image.NEAREST)
        frame.save(out_dir / f"tray-{px}.png")
    master.resize((32, 32), Image.NEAREST).save(out_dir / "tray.png")
    write_ico(master, out_dir / "tray.ico")
