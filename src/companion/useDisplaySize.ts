import { useCallback, useEffect, useState } from "react";
import {
  companionWindowPx,
  DEFAULT_DISPLAY_SIZE,
  type DisplaySize,
  nextDisplaySize,
  spriteRenderPx,
} from "./displaySize";

export function useDisplaySize(): [DisplaySize, (size: DisplaySize) => void] {
  const [size, setSize] = useState<DisplaySize>(DEFAULT_DISPLAY_SIZE);

  const applySize = useCallback((px: DisplaySize) => {
    setSize(px);
    void window.companion?.setDisplaySize?.(px);
  }, []);

  useEffect(() => {
    void window.companion?.setDisplaySize?.(DEFAULT_DISPLAY_SIZE);
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "4") applySize(48);
      if (e.key === "6") applySize(64);
      if (e.key === "9") applySize(96);
      if (e.key === "z" || e.key === "Z") {
        setSize((cur) => {
          const next = nextDisplaySize(cur);
          void window.companion?.setDisplaySize?.(next);
          return next;
        });
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applySize]);

  return [size, applySize];
}

export function motionOffsets(spritePx: DisplaySize) {
  const windowPx = companionWindowPx(spritePx);
  const renderPx = spriteRenderPx(spritePx);
  const side = (windowPx - renderPx) / 2;
  return {
    restX: 0,
    walkTravel: Math.max(4, Math.floor(side - 2)),
  };
}

export { companionWindowPx, spriteRenderPx };
