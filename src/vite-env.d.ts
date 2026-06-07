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
  slideDelta?: (deltaX: number, deltaY: number, durationMs: number) => Promise<void>;
  getCursorScreenPoint?: () => Promise<{ x: number; y: number } | null>;
  setBlockChase?: (options: {
    enabled: boolean;
    offsetX?: number;
    offsetY?: number;
    tireTracks?: boolean;
  }) => Promise<void>;
  peekEdge?: (side: "left" | "right", durationMs: number) => Promise<void>;
  restorePosition?: (durationMs: number) => Promise<void>;
  /** Prod: enable window hit-testing while idle (bike drag). */
  setPointerInteractive?: (enabled: boolean) => void;
  dragStart?: (point: { screenX: number; screenY: number }) => void;
  dragMove?: (point: { screenX: number; screenY: number }) => void;
  dragEnd?: () => Promise<void>;
  savePreBlockPosition?: () => Promise<void>;
  restorePreBlockPosition?: (durationMs: number) => Promise<void>;
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
  setTireTrackOverlay?: (enabled: boolean) => Promise<void>;
  onBlockChaseFacing?: (callback: (facing: "left" | "right") => void) => () => void;
  subscribeBlockChaseFacing?: (callback: () => void) => () => void;
  getBlockChaseFacing?: () => "left" | "right";
}

interface TireTracksAPI {
  onFrame: (
    callback: (payload: {
      workArea: { x: number; y: number; width: number; height: number };
      marks?: Array<{ x: number; y: number; bornAt: number; angleDeg: number }>;
      append?: Array<{ x: number; y: number; bornAt: number; angleDeg: number }>;
      fullRedraw?: boolean;
    }) => void
  ) => () => void;
  onClear: (callback: () => void) => () => void;
}

interface Window {
  companion: CompanionAPI;
  tireTracks?: TireTracksAPI;
}
