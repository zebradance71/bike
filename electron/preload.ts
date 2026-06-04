import { contextBridge, ipcRenderer } from "electron";

type BlockChaseFacing = "left" | "right";

let blockChaseFacing: BlockChaseFacing = "right";
const blockChaseFacingListeners = new Set<() => void>();
const blockChaseFacingCallbacks = new Set<
  (facing: BlockChaseFacing) => void
>();

function notifyBlockChaseFacing(): void {
  blockChaseFacingListeners.forEach((cb) => cb());
}

function resetBlockChaseFacing(): void {
  if (blockChaseFacing === "right") return;
  blockChaseFacing = "right";
  blockChaseFacingCallbacks.forEach((cb) => cb("right"));
  notifyBlockChaseFacing();
}

ipcRenderer.on("companion-block-chase-facing", (_e, facing: string) => {
  const next: BlockChaseFacing = facing === "left" ? "left" : "right";
  if (next === blockChaseFacing) return;
  blockChaseFacing = next;
  blockChaseFacingCallbacks.forEach((cb) => cb(next));
  notifyBlockChaseFacing();
});

/**
 * Companion IPC bridge. The API is character-agnostic — IPC channels are
 * prefixed `companion-*` and the renderer accesses it via `window.companion`.
 */
const companionAPI = {
  startMission: () => ipcRenderer.send("start-mission"),
  teleport: (options?: {
    marginX?: number;
    marginY?: number;
    direction?: "left" | "right";
    distancePx?: number;
    random?: boolean;
    awayFromCurrent?: boolean;
    phase?: string;
  }) =>
    ipcRenderer.invoke("companion-teleport", options) as Promise<{
      x: number;
      y: number;
    }>,
  setSmokeMode: (enabled: boolean, extraWidthPx?: number) =>
    ipcRenderer.invoke(
      "companion-set-smoke-mode",
      enabled,
      extraWidthPx
    ) as Promise<void>,
  setKunaiThrowMode: (enabled: boolean, leftExtraPx?: number) =>
    ipcRenderer.invoke(
      "companion-set-kunai-throw-mode",
      enabled,
      leftExtraPx
    ) as Promise<void>,
  setDisplaySize: (px: number) =>
    ipcRenderer.invoke("companion-set-size", px) as Promise<void>,
  slideX: (deltaPx: number, durationMs: number) =>
    ipcRenderer.invoke("companion-slide-x", deltaPx, durationMs) as Promise<void>,
  slideDelta: (deltaX: number, deltaY: number, durationMs: number) =>
    ipcRenderer.invoke(
      "companion-slide-delta",
      deltaX,
      deltaY,
      durationMs
    ) as Promise<void>,
  getCursorScreenPoint: () =>
    ipcRenderer.invoke("companion-get-cursor-point") as Promise<{
      x: number;
      y: number;
    } | null>,
  setBlockChase: async (options: {
    enabled: boolean;
    offsetX?: number;
    offsetY?: number;
    tireTracks?: boolean;
  }) => {
    await ipcRenderer.invoke("companion-set-block-chase", options);
    resetBlockChaseFacing();
  },
  getBounds: () =>
    ipcRenderer.invoke("companion-get-bounds") as Promise<{
      window: { x: number; y: number; width: number; height: number };
      workArea: { x: number; y: number; width: number; height: number };
    } | null>,
  peekEdge: (side: "left" | "right", durationMs: number) =>
    ipcRenderer.invoke("companion-peek-edge", side, durationMs) as Promise<void>,
  restorePosition: (durationMs: number) =>
    ipcRenderer.invoke(
      "companion-restore-position",
      durationMs
    ) as Promise<void>,
  dragStart: (point: { screenX: number; screenY: number }) =>
    ipcRenderer.send("companion-drag-start", point),
  dragMove: (point: { screenX: number; screenY: number }) =>
    ipcRenderer.send("companion-drag-move", point),
  dragEnd: () =>
    ipcRenderer.invoke("companion-drag-end") as Promise<void>,
  savePreBlockPosition: () =>
    ipcRenderer.invoke("companion-save-pre-block-position") as Promise<void>,
  restorePreBlockPosition: (durationMs: number) =>
    ipcRenderer.invoke(
      "companion-restore-pre-block-position",
      durationMs
    ) as Promise<void>,
  /**
   * Subscribe to block-mode signals coming from the main process
   * (HTTP bridge or future menu/protocol handler). Returns an
   * unsubscribe function.
   */
  onBlockMode: (callback: (on: boolean) => void): (() => void) => {
    const handler = (_e: unknown, on: boolean) => callback(!!on);
    ipcRenderer.on("companion-block-mode", handler);
    return () => {
      ipcRenderer.off("companion-block-mode", handler);
    };
  },
  /**
   * Renderer informs main about the canonical block-mode state so the
   * HTTP `GET /block` endpoint can mirror it (covers dev-key toggles
   * that bypass the HTTP path).
   */
  reportBlockMode: (on: boolean) =>
    ipcRenderer.invoke("companion-report-block-mode", on) as Promise<void>,
  setTireTrackOverlay: (enabled: boolean) =>
    ipcRenderer.invoke(
      "companion-set-tire-track-overlay",
      enabled
    ) as Promise<void>,
  /** Facing updates from main block-chase tick (no per-frame IPC from renderer). */
  onBlockChaseFacing: (
    callback: (facing: BlockChaseFacing) => void
  ): (() => void) => {
    blockChaseFacingCallbacks.add(callback);
    return () => {
      blockChaseFacingCallbacks.delete(callback);
    };
  },
  subscribeBlockChaseFacing: (callback: () => void): (() => void) => {
    blockChaseFacingListeners.add(callback);
    return () => {
      blockChaseFacingListeners.delete(callback);
    };
  },
  getBlockChaseFacing: (): BlockChaseFacing => blockChaseFacing,
};

contextBridge.exposeInMainWorld("companion", companionAPI);
