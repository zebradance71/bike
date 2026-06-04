import { useSyncExternalStore } from "react";

export function subscribeBlockChaseFacing(onStoreChange: () => void): () => void {
  return window.companion?.subscribeBlockChaseFacing?.(onStoreChange) ?? (() => {});
}

export function getBlockChaseFacingSnapshot(): "left" | "right" {
  return window.companion?.getBlockChaseFacing?.() ?? "right";
}

/** Mirror facing driven by main chase tick (sync via preload, not React state). */
export function useBlockChaseFacing(): "left" | "right" {
  return useSyncExternalStore(
    subscribeBlockChaseFacing,
    getBlockChaseFacingSnapshot
  );
}
