import { contextBridge, ipcRenderer } from "electron";

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
};

contextBridge.exposeInMainWorld("companion", companionAPI);
