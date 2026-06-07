/** Keep in sync with `src/companion/characters/bike/tireTracks/geometry.ts`. */
const WHEEL_X_FRAC = 0.28;
const WHEEL_Y_FROM_BOTTOM_FRAC = 0.09;
const WINDOW_CHROME_PX = 24;
const SPRITE_RENDER_SCALE = 1.1;

/** Keep in sync with `src/companion/tireTracksOverlay/constants.ts`. */
export const TIRE_TRACK_MAX_AGE_MS = 4_000;
const SAMPLE_SPACING_PX = 10;
const MAX_STAMPS_PER_SEGMENT = 8;

function lastBornAt(marks: readonly TireMark[]): number {
  return marks.length > 0 ? marks[marks.length - 1]!.bornAt : 0;
}

export type TireMark = {
  screenX: number;
  screenY: number;
  angleDeg: number;
  bornAt: number;
};

export type OverlayMark = {
  x: number;
  y: number;
  angleDeg: number;
  bornAt: number;
};

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
  _lastStampMs: number
): {
  to: { x: number; y: number };
  added: number;
  addedMarks: TireMark[];
} {
  const addedMarks: TireMark[] = [];
  const angleDeg = from
    ? (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI
    : 0;

  if (!from) {
    const mark: TireMark = {
      screenX: to.x,
      screenY: to.y,
      angleDeg,
      bornAt,
    };
    marks.push(mark);
    addedMarks.push(mark);
    trimMarks(marks, bornAt);
    return { to, added: 1, addedMarks };
  }

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.01) {
    return { to, added: 0, addedMarks };
  }

  if (dist < SAMPLE_SPACING_PX) {
    const t0 = lastBornAt(marks);
    const mark: TireMark = {
      screenX: to.x,
      screenY: to.y,
      angleDeg,
      bornAt: t0 > 0 ? t0 + (bornAt - t0) * 0.5 : bornAt,
    };
    marks.push(mark);
    addedMarks.push(mark);
    trimMarks(marks, bornAt);
    return { to, added: 1, addedMarks };
  }

  const steps = Math.min(
    MAX_STAMPS_PER_SEGMENT,
    Math.max(1, Math.ceil(dist / SAMPLE_SPACING_PX))
  );

  const t0 = lastBornAt(marks);
  const startBorn = t0 > 0 ? t0 : bornAt - 32;

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mark: TireMark = {
      screenX: from.x + dx * t,
      screenY: from.y + dy * t,
      angleDeg,
      bornAt: startBorn + (bornAt - startBorn) * t,
    };
    marks.push(mark);
    addedMarks.push(mark);
  }

  if (trimTick++ % 3 === 0) {
    trimMarks(marks, bornAt);
  }
  return { to, added: steps, addedMarks };
}

export function trimMarks(
  marks: TireMark[],
  now: number,
  _lastStampMs?: number
): void {
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
  _now: number,
  _lastStampMs: number,
  out: OverlayMark[] = []
): OverlayMark[] {
  out.length = 0;
  for (let i = 0; i < added.length; i++) {
    const m = added[i]!;
    out.push({
      x: m.screenX - workArea.x,
      y: m.screenY - workArea.y,
      angleDeg: m.angleDeg,
      bornAt: m.bornAt,
    });
  }
  return out;
}

export function marksToOverlayPayload(
  marks: readonly TireMark[],
  workArea: { x: number; y: number; width: number; height: number },
  now: number,
  _lastStampMs: number,
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
    out.push({
      x: m.screenX - workArea.x,
      y: m.screenY - workArea.y,
      angleDeg: m.angleDeg,
      bornAt: m.bornAt,
    });
  }
  return { workArea, marks: out };
}
