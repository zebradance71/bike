import { useEffect, type RefObject } from "react";

function parsePx(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Dev-only sprite-slot diagnostic: logs the rendered image and slot
 * dimensions whenever the bound `<img>` finishes loading. Used to catch
 * mismatched tier resolution and CSS scaling regressions.
 *
 * No-op in production builds (`import.meta.env.DEV` gate).
 */
export function useSpriteSlotDevLog(
  imgRef: RefObject<HTMLImageElement | null>,
  slotRef: RefObject<HTMLElement | null>,
  phase: string,
  spriteRender: number
): void {
  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const img = imgRef.current;
    const slot = slotRef.current;
    if (!img || !slot) return;

    const log = () => {
      const imgCs = getComputedStyle(img);
      const slotCs = getComputedStyle(slot);
      console.debug("[companion][sprite]", {
        phase,
        spriteRender,
        slotWidth: parsePx(slotCs.width),
        slotHeight: parsePx(slotCs.height),
        computedWidth: parsePx(imgCs.width),
        computedHeight: parsePx(imgCs.height),
      });
    };

    if (img.complete) log();
    else img.addEventListener("load", log, { once: true });

    return () => img.removeEventListener("load", log);
  }, [phase, spriteRender, imgRef, slotRef]);
}
