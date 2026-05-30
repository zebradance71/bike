/** Verification sizes — change DEFAULT or use dev keys 4 / 6 / 9 */
export const DISPLAY_SIZES = [48, 64, 96] as const;
export type DisplaySize = (typeof DISPLAY_SIZES)[number];

export const DEFAULT_DISPLAY_SIZE: DisplaySize = 64;

/** Transparent padding around sprite inside Electron window. */
export const WINDOW_CHROME_PX = 24;

/** Visual scale inside window */
export const SPRITE_RENDER_SCALE = 1.1;

export function companionWindowPx(spritePx: DisplaySize): number {
  return spritePx + WINDOW_CHROME_PX;
}

export function spriteRenderPx(spritePx: DisplaySize): number {
  return Math.round(spritePx * SPRITE_RENDER_SCALE);
}

/** Square viewport — smoke window expansion disabled during action reset. */
export function companionViewportSize(spritePx: DisplaySize): {
  width: number;
  height: number;
} {
  const base = companionWindowPx(spritePx);
  return { width: base, height: base };
}

export function isDisplaySize(px: number): px is DisplaySize {
  return (DISPLAY_SIZES as readonly number[]).includes(px);
}

export function nextDisplaySize(current: DisplaySize): DisplaySize {
  const i = DISPLAY_SIZES.indexOf(current);
  return DISPLAY_SIZES[(i + 1) % DISPLAY_SIZES.length];
}
