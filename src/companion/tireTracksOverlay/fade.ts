import {
  TIRE_TRACK_HUE_CYCLE_MS,
  TIRE_TRACK_IDLE_FADE_AFTER_MS,
  TIRE_TRACK_MAX_AGE_MS,
} from "./constants";

function smoothstep(u: number): number {
  const t = Math.min(1, Math.max(0, u));
  return t * t * (3 - 2 * t);
}

/** One lifetime for all marks — fade from birth (no opaque hold, no mode switch). */
export function tireMarkOpacity(
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
  return 1 - smoothstep(u);
}

export function hueFromBornAt(bornAt: number): number {
  return ((bornAt % TIRE_TRACK_HUE_CYCLE_MS) / TIRE_TRACK_HUE_CYCLE_MS) * 360;
}
