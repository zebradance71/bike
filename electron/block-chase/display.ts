import { screen } from "electron";

export type WorkArea = { x: number; y: number; width: number; height: number };

export function pointInWorkArea(x: number, y: number, wa: WorkArea): boolean {
  return (
    x >= wa.x &&
    x < wa.x + wa.width &&
    y >= wa.y &&
    y < wa.y + wa.height
  );
}

export function displayIdForAnchor(x: number, y: number): number {
  for (const display of screen.getAllDisplays()) {
    if (pointInWorkArea(x, y, display.workArea)) {
      return display.id;
    }
  }
  return screen.getDisplayNearestPoint({ x, y }).id;
}

export function displayIdAt(x: number, y: number): number {
  return screen.getDisplayNearestPoint({ x, y }).id;
}

export function anchorNearWorkAreaEdge(
  anchorX: number,
  anchorY: number,
  marginPx: number
): boolean {
  const display = screen
    .getAllDisplays()
    .find((d) => d.id === displayIdForAnchor(anchorX, anchorY));
  if (!display) return false;
  const wa = display.workArea;
  if (!pointInWorkArea(anchorX, anchorY, wa)) return false;
  return (
    anchorX < wa.x + marginPx ||
    anchorX >= wa.x + wa.width - marginPx ||
    anchorY < wa.y + marginPx ||
    anchorY >= wa.y + wa.height - marginPx
  );
}
