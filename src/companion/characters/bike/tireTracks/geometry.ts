/** Rear contact patch in the sprite slot (matches import composite wheel anchor). */
const WHEEL_X_FRAC = 0.28;
const WHEEL_Y_FROM_BOTTOM_FRAC = 0.09;

export function rearWheelLocalPx(
  viewportW: number,
  viewportH: number,
  renderW: number,
  mirror: boolean
): { x: number; y: number } {
  const slotLeft = (viewportW - renderW) / 2;
  const xFrac = mirror ? 1 - WHEEL_X_FRAC : WHEEL_X_FRAC;
  return {
    x: slotLeft + renderW * xFrac,
    y: viewportH - renderW * WHEEL_Y_FROM_BOTTOM_FRAC,
  };
}

/** Inverse of rear wheel in window space — anchor wheel to a screen point. */
export function windowPosFromWheelScreen(
  wheelX: number,
  wheelY: number,
  viewportW: number,
  viewportH: number,
  renderW: number,
  mirror: boolean
): { x: number; y: number } {
  const local = rearWheelLocalPx(viewportW, viewportH, renderW, mirror);
  return {
    x: Math.round(wheelX - local.x),
    y: Math.round(wheelY - local.y),
  };
}
