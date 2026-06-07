import { hslaAtBorn, hueContinuousFromBornAt } from "./fade";
import type { TireTrackMarkPayload } from "./types";

const LINE_WIDTH = 10;
const TELEPORT_PX = 48;
const TELEPORT_SQ = TELEPORT_PX * TELEPORT_PX;

function isTeleport(
  a: TireTrackMarkPayload,
  b: TireTrackMarkPayload
): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy > TELEPORT_SQ;
}

function splitRuns(
  marks: readonly TireTrackMarkPayload[]
): TireTrackMarkPayload[][] {
  const runs: TireTrackMarkPayload[][] = [];
  let run: TireTrackMarkPayload[] = [];
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i]!;
    if (run.length > 0) {
      const prev = run[run.length - 1]!;
      if (isTeleport(prev, m)) {
        runs.push(run);
        run = [];
      }
    }
    run.push(m);
  }
  if (run.length > 0) runs.push(run);
  return runs;
}

function prepStroke(ctx: CanvasRenderingContext2D): void {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = LINE_WIDTH;
}

/** Wider steps when many marks — keeps fade redraw cost bounded. */
export function colorStepPxForMarkCount(markCount: number): number {
  if (markCount > 1200) return 6;
  if (markCount > 800) return 5;
  if (markCount > 500) return 4;
  if (markCount > 250) return 3;
  return 2;
}

function flushColorPath(
  ctx: CanvasRenderingContext2D,
  pathOpen: boolean
): void {
  if (pathOpen) ctx.stroke();
}

/** Arc-length samples; batches consecutive same-color segments into one stroke. */
function strokePolylineArcSampled(
  ctx: CanvasRenderingContext2D,
  marks: readonly TireTrackMarkPayload[],
  now: number,
  startMarkIndex: number,
  hueRef0: number,
  colorStepPx: number
): void {
  if (marks.length < 2) return;

  const startIdx = Math.max(0, Math.min(marks.length - 1, startMarkIndex));
  let hueRef = hueRef0;
  let px = marks[startIdx]!.x;
  let py = marks[startIdx]!.y;
  let drawing = startMarkIndex > 0;
  let distBudget = colorStepPx;

  let pathOpen = false;
  let pathColor = "";

  for (let ei = Math.max(1, startIdx + 1); ei < marks.length; ei++) {
    const a = marks[ei - 1]!;
    const b = marks[ei]!;
    if (isTeleport(a, b)) {
      flushColorPath(ctx, pathOpen);
      pathOpen = false;
      drawing = false;
      distBudget = colorStepPx;
      hueRef = hueContinuousFromBornAt(b.bornAt);
      px = b.x;
      py = b.y;
      continue;
    }

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) continue;

    let walked = 0;
    while (walked < len) {
      const step = Math.min(distBudget, len - walked);
      walked += step;
      distBudget -= step;

      const t = walked / len;
      const sx = a.x + dx * t;
      const sy = a.y + dy * t;
      const sborn = a.bornAt + (b.bornAt - a.bornAt) * t;

      if (distBudget > 1e-6) continue;
      distBudget = colorStepPx;

      const paint = hslaAtBorn(sborn, now, hueRef);
      if (!paint) {
        flushColorPath(ctx, pathOpen);
        pathOpen = false;
        drawing = false;
        px = sx;
        py = sy;
        continue;
      }
      hueRef = paint.hueCont;

      if (!drawing) {
        px = sx;
        py = sy;
        drawing = true;
        continue;
      }

      if (pathOpen && paint.color !== pathColor) {
        flushColorPath(ctx, pathOpen);
        pathOpen = false;
      }

      if (!pathOpen) {
        ctx.strokeStyle = paint.color;
        ctx.beginPath();
        ctx.moveTo(px, py);
        pathColor = paint.color;
        pathOpen = true;
      }
      ctx.lineTo(sx, sy);
      px = sx;
      py = sy;
    }
  }
  flushColorPath(ctx, pathOpen);
}

/** Fast append — one stroke per new edge (O(added), not O(trail)). */
function strokeEdgesAppend(
  ctx: CanvasRenderingContext2D,
  marks: readonly TireTrackMarkPayload[],
  now: number,
  firstMarkIndex: number
): void {
  const start = Math.max(1, firstMarkIndex);
  if (start >= marks.length) return;

  let hueRef = hueContinuousFromBornAt(marks[start - 1]!.bornAt);
  for (let i = start; i < marks.length; i++) {
    const a = marks[i - 1]!;
    const b = marks[i]!;
    if (isTeleport(a, b)) {
      hueRef = hueContinuousFromBornAt(b.bornAt);
      continue;
    }
    const born = a.bornAt + (b.bornAt - a.bornAt) * 0.5;
    const paint = hslaAtBorn(born, now, hueRef);
    if (!paint) continue;
    hueRef = paint.hueCont;
    ctx.strokeStyle = paint.color;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

export function drawTrailFull(
  ctx: CanvasRenderingContext2D,
  marks: readonly TireTrackMarkPayload[],
  now: number
): void {
  if (marks.length < 2) return;
  prepStroke(ctx);
  const step = colorStepPxForMarkCount(marks.length);
  const runs = splitRuns(marks);
  for (let r = 0; r < runs.length; r++) {
    const run = runs[r]!;
    strokePolylineArcSampled(
      ctx,
      run,
      now,
      0,
      hueContinuousFromBornAt(run[0]!.bornAt),
      step
    );
  }
}

export function drawTrailAppend(
  ctx: CanvasRenderingContext2D,
  marks: readonly TireTrackMarkPayload[],
  firstMarkIndex: number,
  now: number
): void {
  if (marks.length < 2) return;
  prepStroke(ctx);
  strokeEdgesAppend(ctx, marks, now, firstMarkIndex);
}
