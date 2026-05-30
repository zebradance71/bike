"""Add scripts/pack-tools to sys.path for character import scripts."""
from __future__ import annotations

import sys
from pathlib import Path

_TOOLS = Path(__file__).resolve().parents[2] / "pack-tools"
if str(_TOOLS) not in sys.path:
    sys.path.insert(0, str(_TOOLS))
