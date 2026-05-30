# Ninja character import scripts

Character-specific frame import / extract scripts for the ninja pack.

Common logic lives in `scripts/pack-tools/`. Legacy entry points at
`scripts/import-*.py` and `scripts/extract-*.py` are thin shims that
delegate here.

## Examples

```powershell
py -3 scripts/characters/ninja/import-smoke-sit-from-magenta-cells.py
py -3 scripts/characters/ninja/extract-run-cell-refs.py assets/run-sheet.png
py -3 scripts/characters/ninja/import-run-from-magenta-cells.py
```

Magenta source PNGs go in repo-root `assets/`. Output frames go to
`src/companion/assets/frames/`.
