import { hueFromBornAt, tireMarkOpacity } from "./fade";
import type { TireTrackMarkPayload } from "./types";

const TRAIL_WIDTH_PX = 7;
const MARK_SAT = 78;
const MARK_LIGHT = 48;
const SEGMENT_GAP_PX = 36;
/** Wide bands → fewer strokes while keeping a rainbow over the trail lifetime. */
const HUE_BAND_MS = 720;
const GAP_SQ = SEGMENT_GAP_PX * SEGMENT_GAP_PX;
const DRIVING_ALPHA = 0.76;

export type DrawTrailOptions = {
  /** Only draw marks from this index (inclusive). */
  fromIndex?: number;
  /** While driving, skip per-segment fade (canvas keeps prior ink). */
  driving?: boolean;
};

function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

function strokePolyline(
  ctx: CanvasRenderingContext2D,
  marks: readonly TireTrackMarkPayload[],
  start: number,
  end: number,
  now: number,
  lastStampMs: number,
  driving: boolean
): void {
  if (start > end) return;
  if (start === end) return;

  let alpha = DRIVING_ALPHA;
  if (!driving) {
    alpha = 1;
    for (let i = start; i <= end; i++) {
      const a = tireMarkOpacity(marks[i]!.bornAt, now, lastStampMs);
      if (a < alpha) alpha = a;
    }
  }
  if (alpha <= 0.01) return;

  const hue = hueFromBornAt(marks[end]!.bornAt);
  ctx.beginPath();
  ctx.moveTo(marks[start]!.x, marks[start]!.y);
  for (let i = start + 1; i <= end; i++) {
    ctx.lineTo(marks[i]!.x, marks[i]!.y);
  }
  ctx.strokeStyle = `hsl(${hue}, ${MARK_SAT}%, ${MARK_LIGHT}%)`;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = TRAIL_WIDTH_PX;
  ctx.lineCap = "butt";
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/**
 * While driving: one stroke per spatial run only (no hue-band splits).
 * Connects from the prior mark so fast appends never leave a visual gap.
 */
export function drawDrivingAppend(
  ctx: CanvasRenderingContext2D,
  marks: readonly TireTrackMarkPayload[],
  fromIndex: number,
  now: number,
  lastStampMs: number
): void {
  const n = marks.length;
  if (n === 0 || fromIndex >= n) return;

  const start = Math.max(0, fromIndex - 1);
  let runStart = start;

  for (let i = start + 1; i <= n; i++) {
    const atEnd = i === n;
    let breakRun = atEnd;
    if (!breakRun) {
      const prev = marks[i - 1]!;
      const curr = marks[i]!;
      if (distSq(prev.x, prev.y, curr.x, curr.y) > GAP_SQ) breakRun = true;
    }
    if (!breakRun) continue;

    strokePolyline(ctx, marks, runStart, i - 1, now, lastStampMs, true);
    runStart = i;
  }
}

/**
 * Spatial gaps + coarse hue bands. One stroke per band, not per stamp.
 */
export function drawColorTrail(
  ctx: CanvasRenderingContext2D,
  marks: readonly TireTrackMarkPayload[],
  now: number,
  lastStampMs: number,
  options: DrawTrailOptions = {}
): void {
  const n = marks.length;
  if (n === 0) return;

  const fromIndex = Math.max(0, options.fromIndex ?? 0);
  const driving = options.driving ?? false;
  if (fromIndex >= n) return;

  let runStart = fromIndex;
  let bandStartBornAt = marks[fromIndex]!.bornAt;

  for (let i = Math.max(fromIndex + 1, 1); i <= n; i++) {
    const atEnd = i === n;
    let breakRun = atEnd;
    if (!breakRun) {
      const prev = marks[i - 1]!;
      const curr = marks[i]!;
      if (distSq(prev.x, prev.y, curr.x, curr.y) > GAP_SQ) breakRun = true;
      else if (curr.bornAt - bandStartBornAt > HUE_BAND_MS) breakRun = true;
    }

    if (!breakRun) continue;

    const runEnd = i - 1;
    if (runEnd >= runStart) {
      strokePolyline(
        ctx,
        marks,
        runStart,
        runEnd,
        now,
        lastStampMs,
        driving
      );
    }
    runStart = i;
    if (i < n) bandStartBornAt = marks[i]!.bornAt;
  }
}
