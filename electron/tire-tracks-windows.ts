import { BrowserWindow, screen } from "electron";

type WorkArea = { x: number; y: number; width: number; height: number };

export type TireTracksWindowsDeps = {
  isDev: boolean;
  attachRendererGuards: (win: BrowserWindow, isDev: boolean) => void;
  rendererWebPreferences: (preload: string) => Electron.WebPreferences;
  getPreloadPath: () => string;
  devUrlTireTracks: () => string;
  prodHtmlPath: () => string;
};

/** Union of all monitor work areas — idle drag / restore. */
export function computeVirtualWorkArea(): WorkArea {
  let x = Infinity;
  let y = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const display of screen.getAllDisplays()) {
    const wa = display.workArea;
    x = Math.min(x, wa.x);
    y = Math.min(y, wa.y);
    x2 = Math.max(x2, wa.x + wa.width);
    y2 = Math.max(y2, wa.y + wa.height);
  }
  if (!Number.isFinite(x)) {
    return screen.getPrimaryDisplay().workArea;
  }
  return { x, y, width: x2 - x, height: y2 - y };
}

function pointInWorkArea(x: number, y: number, wa: WorkArea): boolean {
  return (
    x >= wa.x &&
    x < wa.x + wa.width &&
    y >= wa.y &&
    y < wa.y + wa.height
  );
}

const CHASE_DISPLAY_HYSTERESIS_PX = 64;

export type ChaseWorkAreaResolver = {
  resolve(anchorX: number, anchorY: number): WorkArea;
  reset(): void;
};

/** Block chase: clamp to the monitor under the cursor (not virtual-desktop union). */
export function createChaseWorkAreaResolver(): ChaseWorkAreaResolver {
  let stickyDisplayId: number | null = null;

  function resolve(anchorX: number, anchorY: number): WorkArea {
    for (const display of screen.getAllDisplays()) {
      if (pointInWorkArea(anchorX, anchorY, display.workArea)) {
        stickyDisplayId = display.id;
        return display.workArea;
      }
    }

    if (stickyDisplayId != null) {
      const sticky = screen
        .getAllDisplays()
        .find((d) => d.id === stickyDisplayId);
      if (!sticky) {
        stickyDisplayId = null;
      } else {
        const wa = sticky.workArea;
        const h = CHASE_DISPLAY_HYSTERESIS_PX;
        if (
          anchorX >= wa.x - h &&
          anchorX < wa.x + wa.width + h &&
          anchorY >= wa.y - h &&
          anchorY < wa.y + wa.height + h
        ) {
          return wa;
        }
      }
    }

    const nearest = screen.getDisplayNearestPoint({ x: anchorX, y: anchorY });
    stickyDisplayId = nearest.id;
    return nearest.workArea;
  }

  function reset(): void {
    stickyDisplayId = null;
  }

  return { resolve, reset };
}

export type TireTracksFramePayload = {
  workArea: WorkArea;
  marks?: { x: number; y: number; bornAt: number }[];
  append?: { x: number; y: number; bornAt: number }[];
  fullRedraw?: boolean;
};

export type TireTracksDisplayApi = {
  displayIdForPoint(x: number, y: number): number;
  workAreaForDisplay(displayId: number): WorkArea;
  getDisplayWindow(displayId: number): BrowserWindow | null;
  /** Send frame to a monitor overlay (queues until renderer is ready). */
  pushFrame(displayId: number, payload: TireTracksFramePayload): void;
  /** Pre-create hidden overlays for every connected display. */
  warmAllDisplays(): void;
  /** Show overlays for monitors about to receive stamps (e.g. boundary cross). */
  ensureDisplaysVisible(displayIds: readonly number[]): void;
  clearAllWindows(): void;
  hideDisplaysNotIn(
    activeDisplayIds: ReadonlySet<number>,
    keepVisible?: ReadonlySet<number>
  ): void;
  hasAnyWindow(): boolean;
  hideAll(): void;
  destroyAll(): void;
  /** Hot-plug / resolution change — drop stale windows and resize overlays. */
  onDisplayTopologyChanged(): void;
};

export function createTireTracksWindowsManager(
  deps: TireTracksWindowsDeps
): TireTracksDisplayApi {
  const windows = new Map<number, BrowserWindow>();
  const boundsKeyByDisplay = new Map<number, string>();
  const rendererReady = new Set<number>();
  const pendingFrames = new Map<number, TireTracksFramePayload[]>();

  function mergeQueuedFrames(
    frames: readonly TireTracksFramePayload[]
  ): TireTracksFramePayload | null {
    if (frames.length === 0) return null;

    let lastFull: TireTracksFramePayload | null = null;
    const appends: NonNullable<TireTracksFramePayload["append"]> = [];
    let workArea = frames[frames.length - 1]!.workArea;

    for (const frame of frames) {
      workArea = frame.workArea;
      if (frame.fullRedraw && frame.marks) {
        lastFull = frame;
        appends.length = 0;
        continue;
      }
      if (frame.append?.length) {
        appends.push(...frame.append);
      }
    }

    if (lastFull) {
      return appends.length
        ? { ...lastFull, append: appends }
        : lastFull;
    }
    if (appends.length) {
      return { workArea, append: appends };
    }
    return frames[frames.length - 1] ?? null;
  }

  function flushPendingFrames(displayId: number): void {
    const queued = pendingFrames.get(displayId);
    if (!queued?.length) return;
    pendingFrames.delete(displayId);

    const merged = mergeQueuedFrames(queued);
    if (!merged) return;

    const win = windows.get(displayId);
    if (!win || win.isDestroyed()) return;
    win.webContents.send("tire-tracks-frame", merged);
  }

  function showDisplayWindow(displayId: number): BrowserWindow | null {
    const win = ensureWindow(displayId);
    if (!win) return null;
    if (!win.isVisible()) {
      win.showInactive();
    }
    return win;
  }

  function pushFrame(displayId: number, payload: TireTracksFramePayload): void {
    showDisplayWindow(displayId);
    const win = windows.get(displayId);
    if (!win || win.isDestroyed()) return;

    const ready = rendererReady.has(displayId) && !win.webContents.isLoading();
    if (!ready) {
      let queue = pendingFrames.get(displayId);
      if (!queue) {
        queue = [];
        pendingFrames.set(displayId, queue);
      }
      queue.push(payload);
      return;
    }

    win.webContents.send("tire-tracks-frame", payload);
  }

  function workAreaForDisplay(displayId: number): WorkArea {
    const display = screen.getAllDisplays().find((d) => d.id === displayId);
    return display?.workArea ?? screen.getPrimaryDisplay().workArea;
  }

  function displayIdForPoint(x: number, y: number): number {
    for (const display of screen.getAllDisplays()) {
      const b = display.bounds;
      if (
        x >= b.x &&
        x < b.x + b.width &&
        y >= b.y &&
        y < b.y + b.height
      ) {
        return display.id;
      }
    }
    return screen.getDisplayNearestPoint({ x, y }).id;
  }

  function syncBoundsIfNeeded(win: BrowserWindow, displayId: number): void {
    const area = workAreaForDisplay(displayId);
    const key = `${area.x},${area.y},${area.width},${area.height}`;
    if (boundsKeyByDisplay.get(displayId) === key) return;
    boundsKeyByDisplay.set(displayId, key);
    win.setBounds({
      x: area.x,
      y: area.y,
      width: area.width,
      height: area.height,
    });
  }

  function pruneRemovedDisplays(): void {
    const activeIds = new Set(screen.getAllDisplays().map((d) => d.id));
    for (const [displayId, win] of windows) {
      if (activeIds.has(displayId) || win.isDestroyed()) continue;
      win.destroy();
    }
  }

  function syncAllDisplayBounds(): void {
    for (const [displayId, win] of windows) {
      if (win.isDestroyed()) continue;
      boundsKeyByDisplay.delete(displayId);
      syncBoundsIfNeeded(win, displayId);
    }
  }

  function ensureWindow(displayId: number): BrowserWindow | null {
    let win = windows.get(displayId);
    if (win && !win.isDestroyed()) {
      syncBoundsIfNeeded(win, displayId);
      return win;
    }

    const area = workAreaForDisplay(displayId);
    boundsKeyByDisplay.set(
      displayId,
      `${area.x},${area.y},${area.width},${area.height}`
    );

    win = new BrowserWindow({
      x: area.x,
      y: area.y,
      width: area.width,
      height: area.height,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      hasShadow: false,
      focusable: false,
      show: false,
      visibleOnAllWorkspaces: true,
      backgroundColor: "#00000000",
      ...(process.platform === "win32"
        ? { backgroundMaterial: "none" as const }
        : {}),
      webPreferences: deps.rendererWebPreferences(deps.getPreloadPath()),
    });

    deps.attachRendererGuards(win, deps.isDev);
    win.setAlwaysOnTop(true, "floating");
    win.setIgnoreMouseEvents(true, { forward: true });

    if (deps.isDev) {
      win.loadURL(deps.devUrlTireTracks());
    } else {
      win.loadFile(deps.prodHtmlPath());
    }

    win.webContents.on("did-start-loading", () => {
      rendererReady.delete(displayId);
    });
    win.webContents.on("did-finish-load", () => {
      rendererReady.add(displayId);
      flushPendingFrames(displayId);
    });

    win.on("closed", () => {
      windows.delete(displayId);
      boundsKeyByDisplay.delete(displayId);
      rendererReady.delete(displayId);
      pendingFrames.delete(displayId);
    });
    windows.set(displayId, win);
    return win;
  }

  function getDisplayWindow(displayId: number): BrowserWindow | null {
    return showDisplayWindow(displayId);
  }

  function warmAllDisplays(): void {
    for (const display of screen.getAllDisplays()) {
      ensureWindow(display.id);
    }
  }

  function ensureDisplaysVisible(displayIds: readonly number[]): void {
    for (const displayId of displayIds) {
      showDisplayWindow(displayId);
    }
  }

  return {
    displayIdForPoint,
    workAreaForDisplay,
    getDisplayWindow,
    pushFrame,
    warmAllDisplays,
    ensureDisplaysVisible,

    clearAllWindows(): void {
      for (const win of windows.values()) {
        if (!win.isDestroyed()) {
          win.webContents.send("tire-tracks-clear");
        }
      }
    },

    hideDisplaysNotIn(
      activeDisplayIds: ReadonlySet<number>,
      keepVisible?: ReadonlySet<number>
    ): void {
      for (const [displayId, win] of windows) {
        if (win.isDestroyed()) continue;
        if (activeDisplayIds.has(displayId)) continue;
        if (keepVisible?.has(displayId)) continue;
        win.webContents.send("tire-tracks-clear");
        win.hide();
      }
    },

    hasAnyWindow(): boolean {
      for (const win of windows.values()) {
        if (!win.isDestroyed()) return true;
      }
      return false;
    },

    hideAll(): void {
      for (const win of windows.values()) {
        if (!win.isDestroyed()) win.hide();
      }
    },

    destroyAll(): void {
      for (const win of windows.values()) {
        if (!win.isDestroyed()) win.destroy();
      }
      windows.clear();
      boundsKeyByDisplay.clear();
      rendererReady.clear();
      pendingFrames.clear();
    },

    onDisplayTopologyChanged(): void {
      pruneRemovedDisplays();
      syncAllDisplayBounds();
      warmAllDisplays();
    },
  };
}
