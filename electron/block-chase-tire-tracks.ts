/** Keep in sync with `src/companion/characters/bike/tireTracks/geometry.ts`. */
const WHEEL_X_FRAC = 0.28;
const WHEEL_Y_FROM_BOTTOM_FRAC = 0.09;
const WINDOW_CHROME_PX = 24;
const SPRITE_RENDER_SCALE = 1.1;

/** Keep in sync with `src/companion/tireTracksOverlay/constants.ts`. */
export const TIRE_TRACK_MAX_AGE_MS = 5_500;
export const TIRE_TRACK_IDLE_FADE_AFTER_MS = 350;
/** Slightly tighter than line width so joins read as one stroke. */
const SAMPLE_SPACING_PX = 5;
/** Max stamps per tick on normal segments. */
const MAX_STAMPS_PER_SEGMENT = 32;
/** Long jumps (monitor cross / snap) need denser coverage. */
const MAX_STAMPS_LONG_SEGMENT = 120;
const LONG_SEGMENT_PX = 120;
/** Never leave gaps wider than this along a segment (px). */
const MAX_STAMP_GAP_PX = 7;

export type TireMark = {
  screenX: number;
  screenY: number;
  angleDeg: number;
  bornAt: number;
};

export type OverlayMark = {
  x: number;
  y: number;
  bornAt: number;
};

function tireMarkOpacity(
  bornAt: number,
  now: number,
  lastStampMs: number
): number {
  const age = now - bornAt;
  if (age >= TIRE_TRACK_MAX_AGE_MS) return 0;

  let u = age / TIRE_TRACK_MAX_AGE_MS;
  const idle =
    lastStampMs > 0 && now - lastStampMs >= TIRE_TRACK_IDLE_FADE_AFTER_MS;
  if (idle) {
    u = Math.pow(u, 0.72);
  }
  const t = Math.min(1, Math.max(0, u));
  const smooth = t * t * (3 - 2 * t);
  return 1 - smooth;
}

function renderW(spritePx: number): number {
  return Math.round(spritePx * SPRITE_RENDER_SCALE);
}

function viewportPx(spritePx: number): number {
  return spritePx + WINDOW_CHROME_PX;
}

export function rearWheelScreenFromWindow(
  winX: number,
  winY: number,
  spritePx: number,
  mirror: boolean
): { x: number; y: number } {
  const vp = viewportPx(spritePx);
  const rw = renderW(spritePx);
  const slotLeft = (vp - rw) / 2;
  const xFrac = mirror ? 1 - WHEEL_X_FRAC : WHEEL_X_FRAC;
  return {
    x: winX + slotLeft + rw * xFrac,
    y: winY + vp - rw * WHEEL_Y_FROM_BOTTOM_FRAC,
  };
}

/** Place the window so the rear wheel sits on the given screen point. */
export function windowPositionFromWheelScreen(
  wheelX: number,
  wheelY: number,
  spritePx: number,
  mirror: boolean
): { x: number; y: number } {
  const vp = viewportPx(spritePx);
  const rw = renderW(spritePx);
  const slotLeft = (vp - rw) / 2;
  const xFrac = mirror ? 1 - WHEEL_X_FRAC : WHEEL_X_FRAC;
  return {
    x: Math.round(wheelX - slotLeft - rw * xFrac),
    y: Math.round(wheelY - vp + rw * WHEEL_Y_FROM_BOTTOM_FRAC),
  };
}

function wheelLocalInWindow(
  spritePx: number,
  mirror: boolean
): { x: number; y: number; winPx: number } {
  const winPx = viewportPx(spritePx);
  const rw = renderW(spritePx);
  const slotLeft = (winPx - rw) / 2;
  const xFrac = mirror ? 1 - WHEEL_X_FRAC : WHEEL_X_FRAC;
  return {
    x: slotLeft + rw * xFrac,
    y: winPx - rw * WHEEL_Y_FROM_BOTTOM_FRAC,
    winPx,
  };
}

/** Keep the rear wheel inside the work area before deriving window top-left. */
export function clampWheelToWorkArea(
  wheelX: number,
  wheelY: number,
  workArea: { x: number; y: number; width: number; height: number },
  spritePx: number,
  mirror: boolean
): { x: number; y: number } {
  const local = wheelLocalInWindow(spritePx, mirror);
  const minWheelX = workArea.x + local.x;
  const maxWheelX = workArea.x + workArea.width - (local.winPx - local.x);
  const minWheelY = workArea.y + local.y;
  const maxWheelY = workArea.y + workArea.height - (local.winPx - local.y);
  return {
    x: Math.max(minWheelX, Math.min(maxWheelX, wheelX)),
    y: Math.max(minWheelY, Math.min(maxWheelY, wheelY)),
  };
}

let trimTick = 0;

export function stampTireMarksAlongSegment(
  marks: TireMark[],
  from: { x: number; y: number } | null,
  to: { x: number; y: number },
  bornAt: number,
  lastStampMs: number
): {
  to: { x: number; y: number };
  added: number;
  addedMarks: TireMark[];
} {
  const addedMarks: TireMark[] = [];
  if (!from) {
    const mark: TireMark = {
      screenX: to.x,
      screenY: to.y,
      angleDeg: 0,
      bornAt,
    };
    marks.push(mark);
    addedMarks.push(mark);
    trimMarksMaybe(marks, bornAt, lastStampMs);
    return { to, added: 1, addedMarks };
  }

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  const spacing = SAMPLE_SPACING_PX;
  if (dist < spacing) {
    trimMarksMaybe(marks, bornAt, lastStampMs);
    return { to, added: 0, addedMarks };
  }

  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const stepsForSpacing = Math.max(1, Math.ceil(dist / spacing));
  const stepsForCoverage = Math.max(1, Math.ceil(dist / MAX_STAMP_GAP_PX));
  const stampCap =
    dist >= LONG_SEGMENT_PX ? MAX_STAMPS_LONG_SEGMENT : MAX_STAMPS_PER_SEGMENT;
  const steps = Math.min(
    stampCap,
    Math.max(stepsForSpacing, stepsForCoverage)
  );
  const spreadMs = Math.min(280, steps * 12);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mark: TireMark = {
      screenX: from.x + dx * t,
      screenY: from.y + dy * t,
      angleDeg,
      bornAt: bornAt - spreadMs * (1 - t),
    };
    marks.push(mark);
    addedMarks.push(mark);
  }
  trimMarksMaybe(marks, bornAt, lastStampMs);
  return { to, added: steps, addedMarks };
}

function trimMarksMaybe(
  marks: TireMark[],
  now: number,
  lastStampMs: number
): void {
  trimTick += 1;
  if (trimTick % 3 !== 0) return;
  trimMarks(marks, now, lastStampMs);
}

export function trimMarks(marks: TireMark[], now: number, _lastStampMs: number): void {
  const cutoff = now - TIRE_TRACK_MAX_AGE_MS;
  let write = 0;
  for (let read = 0; read < marks.length; read++) {
    if (marks[read]!.bornAt >= cutoff) {
      marks[write++] = marks[read]!;
    }
  }
  marks.length = write;
}

export function tireMarksToOverlay(
  added: readonly TireMark[],
  workArea: { x: number; y: number; width: number; height: number },
  now: number,
  lastStampMs: number,
  out: OverlayMark[] = []
): OverlayMark[] {
  out.length = 0;
  for (let i = 0; i < added.length; i++) {
    const m = added[i]!;
    if (m.bornAt < now - TIRE_TRACK_MAX_AGE_MS) continue;
    out.push({
      x: m.screenX - workArea.x,
      y: m.screenY - workArea.y,
      bornAt: m.bornAt,
    });
  }
  return out;
}

export function marksToOverlayPayload(
  marks: readonly TireMark[],
  workArea: { x: number; y: number; width: number; height: number },
  now: number,
  lastStampMs: number,
  out: OverlayMark[] = []
): {
  workArea: { x: number; y: number; width: number; height: number };
  marks: OverlayMark[];
} {
  out.length = 0;
  const minBornAt = now - TIRE_TRACK_MAX_AGE_MS;
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i]!;
    if (m.bornAt < minBornAt) continue;
    if (tireMarkOpacity(m.bornAt, now, lastStampMs) <= 0.01) continue;
    out.push({
      x: m.screenX - workArea.x,
      y: m.screenY - workArea.y,
      bornAt: m.bornAt,
    });
  }
  return { workArea, marks: out };
}
