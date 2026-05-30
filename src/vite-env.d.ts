/// <reference types="vite/client" />

/**
 * Character-agnostic companion bridge exposed by `electron/preload.ts`.
 * All IPC channels are prefixed `companion-*`; the renderer reaches them
 * through `window.companion`.
 */
interface CompanionAPI {
  startMission: () => void;
  teleport?: (options?: {
    marginX?: number;
    marginY?: number;
    direction?: "left" | "right";
    distancePx?: number;
    random?: boolean;
    awayFromCurrent?: boolean;
    phase?: string;
  }) => Promise<{ x: number; y: number }>;
  setSmokeMode?: (enabled: boolean, extraWidthPx?: number) => Promise<void>;
  setKunaiThrowMode?: (enabled: boolean, leftExtraPx?: number) => Promise<void>;
  setDisplaySize?: (px: number) => Promise<void>;
  slideX?: (deltaPx: number, durationMs: number) => Promise<void>;
  peekEdge?: (side: "left" | "right", durationMs: number) => Promise<void>;
  restorePosition?: (durationMs: number) => Promise<void>;
  getBounds?: () => Promise<{
    window: { x: number; y: number; width: number; height: number };
    workArea: { x: number; y: number; width: number; height: number };
  } | null>;
  /**
   * Subscribe to block-mode flips coming from the main process.
   * Returns an unsubscribe handle. Used to wire host (e.g. browser
   * extension) signals into the renderer's `setBlockMode`.
   */
  onBlockMode?: (callback: (on: boolean) => void) => () => void;
  /** Echo current block-mode state to main for `GET /block` consistency. */
  reportBlockMode?: (on: boolean) => Promise<void>;
}

/**
 * Legacy alias — kept so pre-refactor call sites (`window.ninja.*`)
 * continue to type-check. New code should use `CompanionAPI` /
 * `window.companion`.
 */
type NinjaAPI = CompanionAPI;

interface Window {
  companion: CompanionAPI;
  /** @deprecated Use `window.companion`. Removed when all call sites migrate. */
  ninja: NinjaAPI;
}
