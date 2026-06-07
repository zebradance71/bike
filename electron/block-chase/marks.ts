import type { TireMark } from "../block-chase-tire-tracks";

export function groupMarksByDisplay(
  marks: readonly TireMark[],
  displayIdForPoint: (x: number, y: number) => number
): Map<number, TireMark[]> {
  const grouped = new Map<number, TireMark[]>();
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i]!;
    const displayId = displayIdForPoint(m.screenX, m.screenY);
    const bucket = grouped.get(displayId);
    if (bucket) {
      bucket.push(m);
    } else {
      grouped.set(displayId, [m]);
    }
  }
  return grouped;
}
