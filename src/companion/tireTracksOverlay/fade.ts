import { TIRE_TRACK_HUE_CYCLE_MS, TIRE_TRACK_MAX_AGE_MS } from "./constants";

function smoothstep(u: number): number {
  const t = Math.min(1, Math.max(0, u));
  return t * t * (3 - 2 * t);
}

export function tireMarkOpacity(bornAt: number, now: number): number {
  const age = now - bornAt;
  if (age >= TIRE_TRACK_MAX_AGE_MS) return 0;
  return 1 - smoothstep(age / TIRE_TRACK_MAX_AGE_MS);
}

/** Continuous hue — modulo only when emitting CSS (avoids 360→0 seams). */
export function hueContinuousFromBornAt(bornAt: number): number {
  return (bornAt / TIRE_TRACK_HUE_CYCLE_MS) * 360;
}

export function hueFromBornAt(bornAt: number): number {
  const h = hueContinuousFromBornAt(bornAt);
  return ((h % 360) + 360) % 360;
}

export function unwrapHueNear(hue: number, ref: number): number {
  let h = hue;
  while (h - ref > 180) h -= 360;
  while (h - ref < -180) h += 360;
  return h;
}

const MARK_SAT = 82;
const MARK_LIGHT = 54;

function hslaString(hueCss: number, alpha: number): string {
  const h = ((hueCss % 360) + 360) % 360;
  return `hsla(${h}, ${MARK_SAT}%, ${MARK_LIGHT}%, ${alpha})`;
}

export function hslaForMark(
  bornAt: number,
  now: number
): { color: string } | null {
  const alpha = tireMarkOpacity(bornAt, now);
  if (alpha <= 0.01) return null;
  return { color: hslaString(hueFromBornAt(bornAt), alpha) };
}

export function hslaAtBorn(
  bornAt: number,
  now: number,
  hueRef: number
): { color: string; hueCont: number } | null {
  const alpha = tireMarkOpacity(bornAt, now);
  if (alpha <= 0.01) return null;
  const hueCont = unwrapHueNear(hueContinuousFromBornAt(bornAt), hueRef);
  return { color: hslaString(hueCont, alpha), hueCont };
}
