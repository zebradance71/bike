import { hslaAtBorn, hueContinuousFromBornAt } from "./fade";
import type { TireTrackMarkPayload } from "./types";

const LINE_WIDTH = 10;
const TELEPORT_PX = 48;
const TELEPORT_SQ = TELEPORT_PX * TELEPORT_PX;
/** Arc-length color sample spacing — smaller = smoother hue transitions. */
const COLOR_STEP_PX = 2;

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

/**
 * Walk polyline at fixed px spacing; color from bornAt interpolated along each edge.
 */
function strokePolylineArcSampled(
  ctx: CanvasRenderingContext2D,
  marks: readonly TireTrackMarkPayload[],
  now: number,
  startMarkIndex: number,
  hueRef0: number
): void {
  if (marks.length < 2) return;

  const startIdx = Math.max(0, Math.min(marks.length - 1, startMarkIndex));
  let hueRef = hueRef0;
  let px = marks[startIdx]!.x;
  let py = marks[startIdx]!.y;
  /** Append continues existing stroke — draw from the seed point. */
  let drawing = startMarkIndex > 0;
  let distBudget = COLOR_STEP_PX;

  for (let ei = Math.max(1, startIdx + 1); ei < marks.length; ei++) {
    const a = marks[ei - 1]!;
    const b = marks[ei]!;
    if (isTeleport(a, b)) {
      drawing = false;
      distBudget = COLOR_STEP_PX;
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
      const remain = len - walked;
      const need = distBudget;
      const step = Math.min(need, remain);
      walked += step;
      distBudget -= step;

      const t = walked / len;
      const sx = a.x + dx * t;
      const sy = a.y + dy * t;
      const sborn = a.bornAt + (b.bornAt - a.bornAt) * t;

      if (distBudget <= 1e-6) {
        distBudget = COLOR_STEP_PX;
        const paint = hslaAtBorn(sborn, now, hueRef);
        if (paint) {
          if (drawing) {
            ctx.strokeStyle = paint.color;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(sx, sy);
            ctx.stroke();
          }
          hueRef = paint.hueCont;
          drawing = true;
        } else {
          drawing = false;
        }
        px = sx;
        py = sy;
      }
    }
  }
}

export function drawTrailFull(
  ctx: CanvasRenderingContext2D,
  marks: readonly TireTrackMarkPayload[],
  now: number
): void {
  if (marks.length < 2) return;
  prepStroke(ctx);
  const runs = splitRuns(marks);
  for (let r = 0; r < runs.length; r++) {
    const run = runs[r]!;
    strokePolylineArcSampled(
      ctx,
      run,
      now,
      0,
      hueContinuousFromBornAt(run[0]!.bornAt)
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
  const start = Math.max(1, firstMarkIndex);
  const seed = marks[start - 1]!;
  strokePolylineArcSampled(
    ctx,
    marks,
    now,
    start - 1,
    hueContinuousFromBornAt(seed.bornAt)
  );
}
