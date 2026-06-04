import { useEffect, useRef } from "react";

/** Overlay + facing sync; mark sampling runs in main with block chase tick. */
export function useCharacterTireTracks(active: boolean): void {
  const activeRef = useRef(false);

  useEffect(() => {
    if (active === activeRef.current) return;
    activeRef.current = active;

    if (!active) {
      void window.companion?.setTireTrackOverlay?.(false);
      return;
    }
    void window.companion?.setTireTrackOverlay?.(true);
    return () => {
      activeRef.current = false;
      void window.companion?.setTireTrackOverlay?.(false);
    };
  }, [active]);
}
