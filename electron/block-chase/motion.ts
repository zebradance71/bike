import {
  CHASE_BASE_LERP,
  CHASE_SNAP_DIST_PX,
  FACING_VEL_LOCK_PX,
  FACING_VEL_THRESHOLD_PX,
  FACING_WHEEL_HYSTERESIS_PX,
} from "./constants";
import type { WorkArea } from "./display";

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function chaseAxisStep(current: number, target: number): number {
  const d = target - current;
  const dist = Math.abs(d);
  if (dist <= 1) return target;
  if (dist >= CHASE_SNAP_DIST_PX) return target;

  const lerp = Math.min(0.97, CHASE_BASE_LERP + dist * 0.009);
  let step = d * lerp;
  const maxStep = Math.max(16, Math.min(dist * 0.88, 128));
  if (Math.abs(step) > maxStep) step = Math.sign(d) * maxStep;
  return Math.round(current + step);
}

export function resolveFacing(
  cursorX: number,
  wheelX: number,
  current: "left" | "right",
  velX: number
): "left" | "right" {
  if (velX >= FACING_VEL_THRESHOLD_PX) return "right";
  if (velX <= -FACING_VEL_THRESHOLD_PX) return "left";
  if (Math.abs(velX) >= FACING_VEL_LOCK_PX) return current;

  const dx = cursorX - wheelX;
  if (current === "right") {
    return dx < -FACING_WHEEL_HYSTERESIS_PX ? "left" : "right";
  }
  return dx > FACING_WHEEL_HYSTERESIS_PX ? "right" : "left";
}

export function clampWindowToWorkArea(
  x: number,
  y: number,
  workArea: WorkArea,
  w: number,
  h: number
): { x: number; y: number } {
  return {
    x: clamp(x, workArea.x, workArea.x + workArea.width - w),
    y: clamp(y, workArea.y, workArea.y + workArea.height - h),
  };
}
