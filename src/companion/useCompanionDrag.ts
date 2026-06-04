import { useEffect, type RefObject } from "react";

/** Drag the frameless companion window by the sprite (idle only). */
export function useCompanionDrag(
  targetRef: RefObject<HTMLElement | null>,
  enabled: boolean
): void {
  useEffect(() => {
    if (!enabled) return;
    const el = targetRef.current;
    if (!el) return;

    let dragging = false;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dragging = true;
      el.setPointerCapture(e.pointerId);
      void window.companion?.dragStart?.({
        screenX: e.screenX,
        screenY: e.screenY,
      });
      e.preventDefault();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      window.companion?.dragMove?.({
        screenX: e.screenX,
        screenY: e.screenY,
      });
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      if (el.hasPointerCapture(e.pointerId)) {
        el.releasePointerCapture(e.pointerId);
      }
      void window.companion?.dragEnd?.();
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
    };
  }, [enabled, targetRef]);
}
