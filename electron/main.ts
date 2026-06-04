import { app, BrowserWindow, ipcMain, screen } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import {
  ensureBlockBridgeToken,
  resolveBlockHttpPort,
  startBlockBridge,
  stopBlockBridge,
} from "./block-bridge";
import {
  type IpcGuardContext,
  isCompanionSender,
  isLauncherSender,
} from "./ipc-guard";
import { readSettings, writeSettings } from "./settings-store";
import {
  collectSelfPids,
  startTitleWatcher,
  stopTitleWatcher,
  updateTitleWatcherSelfPids,
} from "./title-watcher";
import { appIconCandidates, resolveAppIcon } from "./app-icon";
import { branding } from "./branding";
import { createAppTray, destroyAppTray, refreshTrayMenu } from "./tray";
import {
  assertPackagedLayout,
  assertRuntimeSupported,
  appendStartupLog,
  installProcessCrashHandlers,
} from "./startup-guard";
import { createBlockChaseController } from "./block-chase-controller";
import { createTireTracksWindowsManager } from "./tire-tracks-windows";
import {
  attachRendererGuards,
  clampAnimationMs,
  rendererWebPreferences,
} from "./window-hardening";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

/**
 * Single-instance enforcement.
 *
 * If a second copy of the binary launches (e.g. user double-clicks the
 * shortcut while the tray icon is already running), we exit immediately
 * and let the existing instance bring its launcher to front.
 *
 * MUST run before app.whenReady() so the second process drops out before
 * any window or HTTP server gets spun up.
 */
const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  assertRuntimeSupported();
  installProcessCrashHandlers();
}

/**
 * Was the process launched by the OS auto-start hook with `--hidden`?
 * In that case we skip showing the launcher and go straight to the tray
 * + companion-only state.
 */
const startedHidden =
  process.argv.includes("--hidden") ||
  process.argv.includes("--start-hidden") ||
  app.commandLine.hasSwitch("hidden");

/**
 * Quit from the tray menu is the *only* path that should actually
 * terminate the process. Closing the launcher window or hiding the
 * companion just minimises to tray.
 */
let wantsQuit = false;

const COMPANION_MARGIN = 16;
const WINDOW_CHROME_PX = 24;
const DEFAULT_SPRITE_PX = 64;

let launcherWindow: BrowserWindow | null = null;
let companionWindow: BrowserWindow | null = null;
let lastTeleportSide: "left" | "right" = "left";
let spriteSizePx = DEFAULT_SPRITE_PX;
let savedCompanionPosition: { x: number; y: number } | null = null;
let smokeMode = false;
let appliedSmokeExtraPx = 0;
/** Actual horizontal delta applied on smoke enter (see kunaiAppliedDx). */
let appliedSmokeDx = 0;
/**
 * Currently-applied left expansion in pixels. Idempotent state model: the
 * single source of truth is "how many px is the window currently expanded
 * leftward by kunai mode". Spammed K presses produce racing IPC events and a
 * boolean enabled-flag is fragile; tracking the actual delta lets us always
 * compute the correct base position regardless of which (true/false) message
 * arrives next.
 */
let kunaiAppliedLeftPx = 0;
/** Actual horizontal delta applied when last expanded (negative or 0). */
let kunaiAppliedDx = 0;

/** Offset from pointer to window top-left while dragging the companion. */
let dragWindowOffset = { x: 0, y: 0 };
/** Window position immediately before block-mode (restored when block ends). */
let preBlockCompanionPosition: { x: number; y: number } | null = null;
/** Main-process block chase tick is active — preserve window position on resize. */
let blockChaseEnabled = false;

const tireTracksWindows = createTireTracksWindowsManager({
  isDev,
  attachRendererGuards,
  rendererWebPreferences,
  getPreloadPath: getTireTracksPreloadPath,
  devUrlTireTracks: () => devUrl("tire-tracks"),
  prodHtmlPath: () => path.join(__dirname, "../dist/tire-tracks.html"),
});

let blockChase = createBlockChaseController({
  getCompanionWindow: () => companionWindow,
  getSpriteSizePx: () => spriteSizePx,
  tireTracks: tireTracksWindows,
  raiseCompanion: () => {
    if (companionWindow && !companionWindow.isDestroyed()) {
      companionWindow.setAlwaysOnTop(true, "screen-saver");
      companionWindow.moveTop();
    }
  },
});

/** Debounced handler for monitor hot-plug / DPI / work-area changes. */
let displayTopologyTimer: ReturnType<typeof setTimeout> | null = null;

function handleDisplayTopologyChange(reason: string): void {
  tireTracksWindows.onDisplayTopologyChanged();

  if (blockChaseEnabled) {
    blockChase.onDisplayTopologyChanged();
  } else if (companionWindow && !companionWindow.isDestroyed()) {
    const [x, y] = companionWindow.getPosition();
    const [w, h] = companionWindow.getSize();
    const clamped = clampCompanionWindowPosition(x, y, w, h);
    if (clamped.x !== x || clamped.y !== y) {
      companionWindow.setPosition(clamped.x, clamped.y);
    }
  }

  if (isDev) {
    console.debug("[companion][display-topology]", {
      reason,
      blockChaseEnabled,
      displays: screen.getAllDisplays().map((d) => ({
        id: d.id,
        workArea: d.workArea,
        scaleFactor: d.scaleFactor,
      })),
    });
  }
}

function scheduleDisplayTopologyChange(reason: string): void {
  if (displayTopologyTimer) clearTimeout(displayTopologyTimer);
  displayTopologyTimer = setTimeout(() => {
    displayTopologyTimer = null;
    handleDisplayTopologyChange(reason);
  }, 150);
}

function registerDisplayTopologyListeners(): void {
  screen.on("display-added", (_event, display) => {
    scheduleDisplayTopologyChange(`added:${display.id}`);
  });
  screen.on("display-removed", (_event, display) => {
    scheduleDisplayTopologyChange(`removed:${display.id}`);
  });
  screen.on("display-metrics-changed", (_event, display) => {
    scheduleDisplayTopologyChange(`metrics:${display.id}`);
  });
}

const ipcGuardCtx: IpcGuardContext = {
  isDev,
  getCompanion: () => companionWindow,
  getLauncher: () => launcherWindow,
};

const BLOCK_HTTP_PORT = resolveBlockHttpPort(
  process.env.NINJA_BLOCK_PORT ?? branding.blockBridgePort
);
let blockModeMirror = false;

type Bounds = { x: number; y: number; width: number; height: number };

/** Union of all monitor work areas — idle drag / restore can cross displays. */
function virtualDesktopWorkArea(): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
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

function workAreaBounds(): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  // Multi-monitor: pick the display that overlaps the companion window the
  // most. Falls back to primary when the window doesn't exist yet (initial
  // create) or hasn't been positioned yet.
  if (companionWindow) {
    const [x, y] = companionWindow.getPosition();
    const [w, h] = companionWindow.getSize();
    const display = screen.getDisplayMatching({ x, y, width: w, height: h });
    if (isDev) {
      console.debug("[companion][workArea][main]", {
        windowRect: { x, y, width: w, height: h },
        displayId: display.id,
        bounds: display.bounds,
        workArea: display.workArea,
        scaleFactor: display.scaleFactor,
        allDisplays: screen.getAllDisplays().map((d) => ({
          id: d.id,
          bounds: d.bounds,
          workArea: d.workArea,
        })),
      });
    }
    return display.workArea;
  }
  return screen.getPrimaryDisplay().workArea;
}

function smokeLog(
  labelOrPayload: string | Record<string, unknown>,
  maybePayload?: Record<string, unknown>
): void {
  if (!isDev) return;
  if (typeof labelOrPayload === "string") {
    console.debug(`[companion][${labelOrPayload}][main]`, maybePayload ?? {});
  } else {
    console.debug("[companion][smoke][main]", labelOrPayload);
  }
}

function getBounds(): Bounds | null {
  if (!companionWindow) return null;
  const [x, y] = companionWindow.getPosition();
  const [width, height] = companionWindow.getSize();
  return { x, y, width, height };
}

function spriteCenterX(bounds: Bounds): number {
  return bounds.x + bounds.width / 2;
}

function animateCompanionX(
  targetX: number,
  durationMs: number
): Promise<void> {
  return new Promise((resolve) => {
    if (!companionWindow) {
      resolve();
      return;
    }

    const [fromX, y] = companionWindow.getPosition();
    const start = Date.now();
    const span = targetX - fromX;

    const tick = () => {
      if (!companionWindow) {
        resolve();
        return;
      }

      const t = Math.min(
      1,
      (Date.now() - start) / clampAnimationMs(durationMs)
    );
      const eased = t * (2 - t);
      const x = Math.round(fromX + span * eased);
      companionWindow.setPosition(x, y);

      if (t < 1) {
        setTimeout(tick, 16);
      } else {
        resolve();
      }
    };

    tick();
  });
}

function animateCompanionDelta(
  deltaX: number,
  deltaY: number,
  durationMs: number
): Promise<void> {
  return new Promise((resolve) => {
    if (!companionWindow) {
      resolve();
      return;
    }

    const [fromX, fromY] = companionWindow.getPosition();
    const [w, h] = companionWindow.getSize();
    const target = clampCompanionWindowPosition(
      fromX + Math.round(deltaX),
      fromY + Math.round(deltaY),
      w,
      h
    );
    const targetX = target.x;
    const targetY = target.y;
    const start = Date.now();
    const spanX = targetX - fromX;
    const spanY = targetY - fromY;

    const tick = () => {
      if (!companionWindow) {
        resolve();
        return;
      }

      const t = Math.min(1, (Date.now() - start) / clampAnimationMs(durationMs));
      const eased = t * (2 - t);
      const x = Math.round(fromX + spanX * eased);
      const y = Math.round(fromY + spanY * eased);
      companionWindow.setPosition(x, y);

      if (t < 1) {
        setTimeout(tick, 16);
      } else {
        resolve();
      }
    };

    tick();
  });
}

function baseWindowPxForSprite(spritePx: number): number {
  const sprite = [48, 64, 96].includes(spritePx) ? spritePx : DEFAULT_SPRITE_PX;
  return sprite + WINDOW_CHROME_PX;
}

/** Max horizontal expansion for smoke / kunai window growth. */
function maxWindowExpansionPx(): number {
  return baseWindowPxForSprite(spriteSizePx) * 3;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function getPreloadPath(kind: "launcher" | "companion"): string {
  const file = kind === "launcher" ? "launcher-preload.mjs" : "preload.mjs";
  return path.join(__dirname, file);
}

function getTireTracksPreloadPath(): string {
  return path.join(__dirname, "tire-tracks-preload.mjs");
}

function devUrl(page: "launcher" | "companion" | "tire-tracks"): string {
  const base = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173";
  return `${base}/${page}.html`;
}

function createLauncherWindow(): void {
  if (launcherWindow && !launcherWindow.isDestroyed()) {
    launcherWindow.show();
    launcherWindow.focus();
    return;
  }
  const windowIcon = resolveAppIcon();
  launcherWindow = new BrowserWindow({
    width: 360,
    height: 280,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: !startedHidden,
    title: branding.productName,
    icon: windowIcon,
    backgroundColor: "#f5f0e8",
    webPreferences: rendererWebPreferences(getPreloadPath("launcher")),
  });

  attachRendererGuards(launcherWindow, isDev);

  if (isDev) {
    launcherWindow.loadURL(devUrl("launcher"));
  } else {
    launcherWindow.loadFile(path.join(__dirname, "../dist/launcher.html"));
  }

  // Closing the launcher should not quit the app; we just minimise to tray.
  // The tray's Quit item sets `wantsQuit = true` first, which lets the
  // close go through.
  launcherWindow.on("close", (event) => {
    if (!wantsQuit && launcherWindow && !launcherWindow.isDestroyed()) {
      event.preventDefault();
      launcherWindow.hide();
    }
  });
  launcherWindow.on("closed", () => {
    launcherWindow = null;
  });
}

function companionY(sizePx: number): number {
  // Use the display the companion window currently lives on, so dragging to
  // a secondary monitor and then resizing keeps the sprite's foot pinned to
  // *that* monitor's bottom edge.
  const area = workAreaBounds();
  return area.y + area.height - sizePx - COMPANION_MARGIN;
}

/**
 * Pick target sprite-center X (not window left edge).
 *
 * `forceSide` overrides the alternation:
 *   - "left" / "right": go to that side regardless of last side
 *   - "opposite":       go to whichever side is FARTHER from the current
 *                       window center. Used by mission for edge-rescue so
 *                       a wall-stuck companion always ends up on the open
 *                       side after teleport.
 */
function pickTargetSpriteCenterX(
  winW: number,
  marginX: number,
  forceSide?: "left" | "right" | "opposite"
): number {
  const area = workAreaBounds();
  const minCenter = area.x + marginX + winW / 2;
  const maxCenter = area.x + area.width - marginX - winW / 2;
  const span = Math.max(1, maxCenter - minCenter);

  let side: "left" | "right";
  if (forceSide === "left" || forceSide === "right") {
    side = forceSide;
    lastTeleportSide = side;
  } else if (forceSide === "opposite") {
    const cur = getBounds();
    const mid = (minCenter + maxCenter) / 2;
    const curCenter = cur ? cur.x + cur.width / 2 : mid;
    side = curCenter > mid ? "left" : "right";
    lastTeleportSide = side;
    if (isDev) {
      console.debug("[companion][teleport][opposite]", {
        cur,
        area: { x: area.x, width: area.width },
        minCenter,
        maxCenter,
        mid,
        curCenter,
        chosenSide: side,
      });
    }
  } else {
    lastTeleportSide = lastTeleportSide === "left" ? "right" : "left";
    side = lastTeleportSide;
  }

  const leftEnd = minCenter + Math.floor(span * 0.38);
  const rightStart = minCenter + Math.floor(span * 0.62);

  if (side === "left") {
    const zone = Math.max(1, leftEnd - minCenter);
    return minCenter + Math.floor(Math.random() * zone);
  }

  const zone = Math.max(1, maxCenter - rightStart);
  return rightStart + Math.floor(Math.random() * zone);
}

function applyCompanionSize(spritePx: number): void {
  spriteSizePx = [48, 64, 96].includes(spritePx) ? spritePx : DEFAULT_SPRITE_PX;
  if (!companionWindow) return;

  const winPx = baseWindowPxForSprite(spriteSizePx);
  if (blockChaseEnabled) {
    companionWindow.setSize(winPx, winPx);
  } else {
    const [x] = companionWindow.getPosition();
    const y = companionY(winPx);
    companionWindow.setSize(winPx, winPx);
    companionWindow.setPosition(x, y);
  }
  appliedSmokeExtraPx = 0;
}

/** Expand width with sprite-center fixed; shrink from current position after teleport. */
function applySmokeMode(enabled: boolean, extraWidthPx = 0): void {
  if (!companionWindow) return;
  if (enabled === smokeMode) return;

  const area = workAreaBounds();
  const oldBounds = getBounds();
  if (!oldBounds) return;

  if (enabled) {
    const maxExtra = maxWindowExpansionPx();
    const requested = Math.max(0, Math.round(extraWidthPx));
    if (requested > maxExtra && isDev) {
      console.warn("[companion][smoke-mode][rejected][main]", {
        requested,
        maxExtra,
        spriteSizePx,
      });
    }
    const extra = Math.min(requested, maxExtra);
    appliedSmokeExtraPx = extra;
    const nextW = oldBounds.width + extra;
    const nextH = oldBounds.height;
    const nextX = clamp(
      oldBounds.x - Math.floor(extra / 2),
      area.x,
      area.x + area.width - nextW
    );
    const nextY = clamp(
      oldBounds.y,
      area.y,
      area.y + area.height - nextH
    );
    appliedSmokeDx = nextX - oldBounds.x;

    const smokeBounds = {
      x: nextX,
      y: nextY,
      width: nextW,
      height: nextH,
    };

    smokeLog({
      extraPx: extra,
      oldBounds,
      smokeBounds,
    });

    companionWindow.setSize(nextW, nextH);
    companionWindow.setPosition(nextX, nextY);
    smokeMode = true;
    return;
  }

  const extra = appliedSmokeExtraPx;
  const restoredW = oldBounds.width - extra;
  const restoredH = oldBounds.height;
  const restoredX = clamp(
    oldBounds.x - appliedSmokeDx,
    area.x,
    area.x + area.width - restoredW
  );
  const restoredY = clamp(
    oldBounds.y,
    area.y,
    area.y + area.height - restoredH
  );

  const restoredBounds = {
    x: restoredX,
    y: restoredY,
    width: restoredW,
    height: restoredH,
  };

  smokeLog({
    extraPx: extra,
    oldBounds,
    restoredBounds,
  });

  companionWindow.setSize(restoredW, restoredH);
  companionWindow.setPosition(restoredX, restoredY);
  appliedSmokeExtraPx = 0;
  appliedSmokeDx = 0;
  smokeMode = false;
}

function createCompanionWindow(): void {
  const winPx = baseWindowPxForSprite(spriteSizePx);
  const { x, y } = companionPosition(winPx);

  companionWindow = new BrowserWindow({
    width: winPx,
    height: winPx,
    x,
    y,
    icon: resolveAppIcon(),
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    // IMPORTANT: must be `true` so programmatic setSize() actually resizes
    // the window. With `resizable: false`, Electron silently ignores setSize
    // on Windows, which made our smoke/kunai expansion get stuck at whatever
    // size was last applied successfully (e.g. 2048×88 wedge).
    // The window remains user-resize-proof because it is frameless and has
    // no resize handles for the user to grab.
    resizable: true,
    hasShadow: false,
    focusable: isDev,
    visibleOnAllWorkspaces: true,
    backgroundColor: "#00000000",
    webPreferences: rendererWebPreferences(getPreloadPath("companion")),
  });

  attachRendererGuards(companionWindow, isDev);
  companionWindow.setAlwaysOnTop(true, "screen-saver");

  if (isDev) {
    companionWindow.setIgnoreMouseEvents(false);
    companionWindow.setFocusable(true);
    companionWindow.loadURL(devUrl("companion"));
    companionWindow.webContents.openDevTools({
      mode: "detach",
    });
  } else {
    companionWindow.setIgnoreMouseEvents(true, { forward: true });
    companionWindow.loadFile(path.join(__dirname, "../dist/companion.html"));
  }

  // Same close-to-tray policy as the launcher: only a real quit destroys
  // the companion, otherwise we just hide it.
  companionWindow.on("close", (event) => {
    if (!wantsQuit && companionWindow && !companionWindow.isDestroyed()) {
      event.preventDefault();
      companionWindow.hide();
      refreshTrayMenu();
    }
  });
  companionWindow.on("closed", () => {
    blockChase.onCompanionClosed();
    hideTireTracksOverlay();
    destroyTireTracksWindows();
    companionWindow = null;
  });
}

function clampCompanionWindowPosition(
  x: number,
  y: number,
  winW: number,
  winH: number
): { x: number; y: number } {
  const area = virtualDesktopWorkArea();
  return {
    x: clamp(x, area.x, area.x + area.width - winW),
    y: clamp(y, area.y, area.y + area.height - winH),
  };
}

function defaultBottomLeftCompanionPosition(
  winW: number,
  marginX: number = COMPANION_MARGIN,
  marginY: number = COMPANION_MARGIN
): { x: number; y: number } {
  const area = workAreaBounds();
  return clampCompanionWindowPosition(
    area.x + marginX,
    area.y + area.height - winW - marginY,
    winW,
    winW
  );
}

function resolveCompanionPosition(winW: number): { x: number; y: number } {
  if (branding.characterId === "bike") {
    const saved = readSettings();
    if (saved.companionX != null && saved.companionY != null) {
      return clampCompanionWindowPosition(
        saved.companionX,
        saved.companionY,
        winW,
        winW
      );
    }
    return defaultBottomLeftCompanionPosition(winW);
  }

  const centerX = pickTargetSpriteCenterX(winW, COMPANION_MARGIN);
  const area = workAreaBounds();
  const y = area.y + area.height - winW - COMPANION_MARGIN;
  return { x: Math.round(centerX - winW / 2), y };
}

function companionPosition(
  winW: number,
  options?: { scatterToSides?: boolean; marginX?: number; marginY?: number }
): { x: number; y: number } {
  if (branding.characterId === "bike" && !options?.scatterToSides) {
    return resolveCompanionPosition(winW);
  }

  const centerX = pickTargetSpriteCenterX(
    winW,
    options?.marginX ?? COMPANION_MARGIN
  );
  const area = workAreaBounds();
  const y = area.y + area.height - winW - (options?.marginY ?? COMPANION_MARGIN);
  return { x: Math.round(centerX - winW / 2), y };
}

function startMission(): void {
  if (!companionWindow) {
    createCompanionWindow();
  } else {
    companionWindow.show();
    applyCompanionSize(spriteSizePx);
  }

  if (isDev && companionWindow) {
    companionWindow.focus();
  }

  launcherWindow?.hide();
}

ipcMain.on("start-mission", (event) => {
  if (!isLauncherSender(ipcGuardCtx, event)) return;
  startMission();
});

ipcMain.handle(
  "companion-teleport",
  (
    event,
    options?: {
      marginX?: number;
      marginY?: number;
      direction?: "left" | "right";
      distancePx?: number;
      random?: boolean;
      /** When true, random teleport targets the side OPPOSITE the current pos. */
      awayFromCurrent?: boolean;
      phase?: string;
    }
  ) => {
    if (!isCompanionSender(ipcGuardCtx, event)) return { x: 0, y: 0 };
    if (!companionWindow) return { x: 0, y: 0 };

    // Defensive reset 1: collapse tracked expansions.
    applyKunaiThrowMode(false, 0);
    applySmokeMode(false, 0);

    // Defensive reset 2 (HARD): if the window is somehow larger than
    // sprite-base (race / unknown setSize / leftover state), force it back
    // to base size BEFORE measuring. Use setBounds (atomic x/y/width/height)
    // because setSize alone has been observed to be ignored on Windows in
    // some configurations.
    {
      const baseW = baseWindowPxForSprite(spriteSizePx);
      const [actualW, actualH] = companionWindow.getSize();
      if (actualW !== baseW || actualH !== baseW) {
        const [px, py] = companionWindow.getPosition();
        if (isDev) {
          console.debug("[companion][teleport][hard-reset][main]", {
            actualW,
            actualH,
            baseW,
            spriteSizePx,
            beforePos: { px, py },
          });
        }
        companionWindow.setBounds({
          x: px,
          y: py,
          width: baseW,
          height: baseW,
        });
        // Verify the reset took effect; if not, log loudly.
        if (isDev) {
          const [postW, postH] = companionWindow.getSize();
          if (postW !== baseW || postH !== baseW) {
            console.error("[companion][teleport][hard-reset-FAILED][main]", {
              after: { postW, postH },
              wanted: { baseW },
            });
          }
        }
        kunaiAppliedLeftPx = 0;
        kunaiAppliedDx = 0;
        appliedSmokeExtraPx = 0;
        appliedSmokeDx = 0;
        smokeMode = false;
      }
    }

    const before = getBounds();
    if (!before) return { x: 0, y: 0 };

    const marginX = options?.marginX ?? 56;
    const useRandom = options?.random !== false;
    const fromSpriteCenterX = spriteCenterX(before);

    let targetSpriteCenterX: number;
    let newWinX: number;
    const newWinY = before.y;

    if (useRandom) {
      targetSpriteCenterX = pickTargetSpriteCenterX(
        before.width,
        marginX,
        options?.awayFromCurrent ? "opposite" : undefined
      );
      const area = workAreaBounds();
      newWinX = clamp(
        Math.round(targetSpriteCenterX - before.width / 2),
        area.x,
        area.x + area.width - before.width
      );
    } else {
      const { x: areaX, width: areaW } = workAreaBounds();
      const direction = options?.direction ?? "right";
      const sign = direction === "left" ? -1 : 1;
      const distancePx =
        options?.distancePx ?? Math.round(before.width * 0.55);
      targetSpriteCenterX = fromSpriteCenterX + sign * distancePx;
      const minCenter = areaX + marginX + before.width / 2;
      const maxCenter = areaX + areaW - marginX - before.width / 2;
      targetSpriteCenterX = clamp(targetSpriteCenterX, minCenter, maxCenter);
      newWinX = Math.round(targetSpriteCenterX - before.width / 2);
    }

    companionWindow.setPosition(newWinX, newWinY);

    const result = { x: newWinX, y: newWinY };

    smokeLog("teleport", {
      phase: options?.phase ?? "unknown",
      extraPx: appliedSmokeExtraPx,
      oldBounds: before,
      spriteCenterX: fromSpriteCenterX,
      targetSpriteCenterX,
      actualWindowX: newWinX,
    });

    return result;
  }
);

ipcMain.handle("companion-set-size", (event, spritePx: number) => {
  if (!isCompanionSender(ipcGuardCtx, event)) return;
  applyCompanionSize(spritePx);
});

ipcMain.handle("companion-get-bounds", (event) => {
  if (!isCompanionSender(ipcGuardCtx, event)) return null;
  if (!companionWindow) return null;
  const [x, y] = companionWindow.getPosition();
  const [width, height] = companionWindow.getSize();
  const area = workAreaBounds();
  return {
    window: { x, y, width, height },
    workArea: { x: area.x, y: area.y, width: area.width, height: area.height },
  };
});

ipcMain.handle(
  "companion-set-smoke-mode",
  (event, enabled: boolean, extraWidthPx?: number) => {
    if (!isCompanionSender(ipcGuardCtx, event)) return;
    applySmokeMode(Boolean(enabled), extraWidthPx ?? 0);
  }
);

/**
 * Idempotent left-expansion controller used by the kunai action.
 *
 * The model: "the window should currently be expanded by `targetPx` left".
 * Whatever its present visual state, we always:
 *   1. derive the *base* (un-expanded) bounds by subtracting whatever
 *      expansion is currently recorded
 *   2. apply the target expansion to that base
 *
 * This makes the function safe under K-spam where (true)/(false) IPCs may
 * arrive interleaved or duplicated. Re-issuing the same target is a no-op
 * (no setSize/setPosition churn).
 */
function applyKunaiThrowMode(enabled: boolean, leftExtraPx = 0): void {
  if (!companionWindow) return;

  // Sanitize: kunai expansion should never exceed ~3 sprite-widths. Anything
  // larger is a bug (e.g. caller passed window.width by mistake or a stale
  // value during reload). Clamp aggressively + log so the bug is visible.
  const baseSpriteForCap = baseWindowPxForSprite(spriteSizePx);
  const maxExpansionPx = maxWindowExpansionPx();
  const requested = Math.max(0, Math.round(leftExtraPx));
  if (requested > maxExpansionPx) {
    if (isDev) {
      console.warn("[companion][kunai-mode][rejected][main]", {
        requested,
        maxExpansionPx,
        spriteSizePx,
        baseSpriteForCap,
      });
    }
  }
  const sanitized = Math.min(requested, maxExpansionPx);
  const targetPx = enabled ? sanitized : 0;
  if (isDev) {
    const [w, h] = companionWindow.getSize();
    console.debug("[companion][kunai-mode][main]", {
      enabled,
      leftExtraPx,
      sanitized,
      targetPx,
      currentSize: { w, h },
      tracked: { kunaiAppliedLeftPx, kunaiAppliedDx },
      spriteSizePx,
    });
  }

  // State integrity check: if the actual window size disagrees with what
  // (kunaiAppliedLeftPx + base) implies, our tracking variables are out of
  // sync (e.g. after rapid K-spam where IPCs and React re-renders raced).
  // Reset internal state to match the *real* window so the next computation
  // produces a sane delta. Without this, target=current=0 early-returns even
  // when the window is still visually expanded.
  const expectedBaseW = baseWindowPxForSprite(spriteSizePx);
  const [actualWidth] = companionWindow.getSize();
  const expectedTotalW = expectedBaseW + kunaiAppliedLeftPx;
  if (actualWidth !== expectedTotalW) {
    if (isDev) {
      console.debug("[companion][kunai-state-corrupt][main]", {
        actualWidth,
        expectedTotalW,
        kunaiAppliedLeftPx,
        kunaiAppliedDx,
        spriteSizePx,
      });
    }
    // Trust the actual size: clear tracking and snap window back to base.
    kunaiAppliedLeftPx = 0;
    kunaiAppliedDx = 0;
    const [px, py] = companionWindow.getPosition();
    companionWindow.setSize(expectedBaseW, expectedBaseW);
    companionWindow.setPosition(px, py);
  }

  if (targetPx === kunaiAppliedLeftPx) return;

  const area = workAreaBounds();
  const oldBounds = getBounds();
  if (!oldBounds) return;

  // Recover the un-expanded base, regardless of how we got here.
  const baseW = oldBounds.width - kunaiAppliedLeftPx;
  const baseX = oldBounds.x - kunaiAppliedDx;
  const baseY = oldBounds.y;
  const baseH = oldBounds.height;

  const nextW = baseW + targetPx;
  const wantedX = baseX - targetPx;
  const nextX = clamp(wantedX, area.x, area.x + area.width - nextW);
  const nextY = clamp(baseY, area.y, area.y + area.height - baseH);

  kunaiAppliedLeftPx = targetPx;
  kunaiAppliedDx = nextX - baseX;
  companionWindow.setSize(nextW, baseH);
  companionWindow.setPosition(nextX, nextY);
}

ipcMain.handle(
  "companion-set-kunai-throw-mode",
  (event, enabled: boolean, leftExtraPx?: number) => {
    if (!isCompanionSender(ipcGuardCtx, event)) return;
    applyKunaiThrowMode(Boolean(enabled), leftExtraPx ?? 0);
  }
);

ipcMain.handle("companion-get-cursor-point", (event) => {
  if (!isCompanionSender(ipcGuardCtx, event)) return null;
  const p = screen.getCursorScreenPoint();
  return { x: p.x, y: p.y };
});

ipcMain.on(
  "companion-drag-start",
  (event, point: { screenX: number; screenY: number }) => {
    if (!isCompanionSender(ipcGuardCtx, event)) return;
    if (!companionWindow || companionWindow.isDestroyed()) return;
    const [wx, wy] = companionWindow.getPosition();
    dragWindowOffset = {
      x: Math.round(Number(point.screenX)) - wx,
      y: Math.round(Number(point.screenY)) - wy,
    };
  }
);

ipcMain.on(
  "companion-drag-move",
  (event, point: { screenX: number; screenY: number }) => {
    if (!isCompanionSender(ipcGuardCtx, event)) return;
    if (!companionWindow || companionWindow.isDestroyed()) return;
    const [w, h] = companionWindow.getSize();
    const next = clampCompanionWindowPosition(
      Math.round(Number(point.screenX)) - dragWindowOffset.x,
      Math.round(Number(point.screenY)) - dragWindowOffset.y,
      w,
      h
    );
    companionWindow.setPosition(next.x, next.y);
  }
);

ipcMain.handle("companion-drag-end", (event) => {
  if (!isCompanionSender(ipcGuardCtx, event)) return;
  if (!companionWindow || companionWindow.isDestroyed()) return;
  const [x, y] = companionWindow.getPosition();
  writeSettings({ companionX: x, companionY: y });
});

ipcMain.handle("companion-save-pre-block-position", (event) => {
  if (!isCompanionSender(ipcGuardCtx, event)) return;
  if (!companionWindow || companionWindow.isDestroyed()) return;
  const [x, y] = companionWindow.getPosition();
  preBlockCompanionPosition = { x, y };
  if (isDev) {
    console.debug("[companion][block] saved pre-block position", { x, y });
  }
});

ipcMain.handle(
  "companion-restore-pre-block-position",
  async (event, durationMs: number) => {
    if (!isCompanionSender(ipcGuardCtx, event)) return;
    if (!companionWindow || companionWindow.isDestroyed()) return;

    const [w, h] = companionWindow.getSize();
    const fallback = resolveCompanionPosition(w);
    const target = clampCompanionWindowPosition(
      preBlockCompanionPosition?.x ?? fallback.x,
      preBlockCompanionPosition?.y ?? fallback.y,
      w,
      h
    );
    preBlockCompanionPosition = null;

    const [cx, cy] = companionWindow.getPosition();
    await animateCompanionDelta(
      target.x - cx,
      target.y - cy,
      clampAnimationMs(durationMs)
    );
  }
);

function showTireTracksOverlay(): void {
  blockChase.clearOverlayMarks();
  const cursor = screen.getCursorScreenPoint();
  tireTracksWindows.ensureDisplaysVisible([
    screen.getDisplayNearestPoint(cursor).id,
  ]);
  if (companionWindow && !companionWindow.isDestroyed()) {
    companionWindow.setAlwaysOnTop(true, "screen-saver");
    companionWindow.moveTop();
  }
  blockChase.onOverlayShown();
}

function hideTireTracksOverlay(): void {
  blockChase.onOverlayHidden();
  blockChase.clearOverlayMarks();
  tireTracksWindows.hideAll();
}

function destroyTireTracksWindows(): void {
  tireTracksWindows.destroyAll();
}

ipcMain.handle(
  "companion-set-tire-track-overlay",
  (event, enabled: boolean) => {
    if (!isCompanionSender(ipcGuardCtx, event)) return;
    if (enabled) showTireTracksOverlay();
    else hideTireTracksOverlay();
  }
);

ipcMain.handle(
  "companion-set-block-chase",
  (
    event,
    options: {
      enabled: boolean;
      offsetX?: number;
      offsetY?: number;
      tireTracks?: boolean;
    }
  ) => {
    if (!isCompanionSender(ipcGuardCtx, event)) return;

    blockChase.setOffsets(options.offsetX, options.offsetY);
    blockChaseEnabled = Boolean(options.enabled);
    blockChase.setEnabled(options.enabled, Boolean(options.tireTracks));
    if (blockChaseEnabled && companionWindow && !companionWindow.isDestroyed()) {
      companionWindow.setAlwaysOnTop(true, "screen-saver");
      companionWindow.moveTop();
    }
  }
);

ipcMain.handle(
  "companion-slide-delta",
  async (event, deltaX: number, deltaY: number, durationMs: number) => {
    if (!isCompanionSender(ipcGuardCtx, event)) return;
    if (!companionWindow) return;
    await animateCompanionDelta(
      Number(deltaX) || 0,
      Number(deltaY) || 0,
      clampAnimationMs(durationMs)
    );
  }
);

ipcMain.handle(
  "companion-slide-x",
  async (event, deltaPx: number, durationMs: number) => {
    if (!isCompanionSender(ipcGuardCtx, event)) return;
    if (!companionWindow) return;
    const [fromX, y] = companionWindow.getPosition();
    const winW = companionWindow.getSize()[0];
    const area = virtualDesktopWorkArea();
    const minX = area.x;
    const maxX = area.x + area.width - winW;
    // Wedge-rescue: if the window is currently outside the workArea (e.g.
    // after a display change or a stale teleport target), pretend it starts
    // at the nearest in-bounds edge before applying the delta. Otherwise a
    // request to move INTO the screen would clamp to the edge again and the
    // companion would appear stuck at the wall.
    const safeFromX = clamp(fromX, minX, maxX);
    if (safeFromX !== fromX) {
      companionWindow.setPosition(safeFromX, y);
    }
    const targetX = clamp(safeFromX + Math.round(deltaPx), minX, maxX);
    await animateCompanionX(targetX, clampAnimationMs(durationMs));
  }
);

ipcMain.handle(
  "companion-peek-edge",
  async (event, side: "left" | "right", durationMs: number) => {
    if (!isCompanionSender(ipcGuardCtx, event)) return;
    if (!companionWindow) return;
    if (side !== "left" && side !== "right") return;
    const [fromX, fromY] = companionWindow.getPosition();
    savedCompanionPosition = { x: fromX, y: fromY };

    const winW = companionWindow.getSize()[0];
    const area = workAreaBounds();
    const hidden = Math.floor(winW * 0.48);
    const targetX =
      side === "left" ? area.x - hidden : area.x + area.width - winW + hidden;

    await animateCompanionX(targetX, clampAnimationMs(durationMs));
  }
);

ipcMain.handle("companion-restore-position", async (event, durationMs: number) => {
  if (!isCompanionSender(ipcGuardCtx, event)) return;
  if (!companionWindow || !savedCompanionPosition) return;
  const { x } = savedCompanionPosition;
  savedCompanionPosition = null;
  await animateCompanionX(x, clampAnimationMs(durationMs));
});

/**
 * Block-mode HTTP bridge (127.0.0.1 only).
 *
 *  GET  /block       → read blockMode (no side effects)
 *  POST /block       → { "on": boolean, "token": "<settings.blockBridgeToken>" }
 *  GET  /block/on|off → 405 (legacy; CSRF-safe POST only)
 */
function broadcastBlockMode(on: boolean, source: string = "ipc"): void {
  // Dedupe: title watcher polls at 1.5s intervals, the HTTP bridge fires
  // once per transition, and dev key `B` toggles. They can race; ignoring
  // a no-op transition keeps the renderer's React state stable and the
  // logs clean.
  if (blockModeMirror === on) return;
  blockModeMirror = on;
  if (!companionWindow || companionWindow.isDestroyed()) return;
  companionWindow.webContents.send("companion-block-mode", on);
  if (isDev) {
    console.debug("[companion][block] broadcast", { on, source });
  }
  // Reflect the new state in the tray label ("Currently: ON/OFF").
  refreshTrayMenu();
}

// ---- Window-visibility helpers (used by tray + auto-start) -----------------

function showCompanionWindow(): void {
  if (!companionWindow || companionWindow.isDestroyed()) {
    createCompanionWindow();
    return;
  }
  companionWindow.show();
  // Re-apply ignore-mouse so a previously-hidden window doesn't accidentally
  // capture clicks (e.g. after dev devtools detached).
  if (!isDev) {
    companionWindow.setIgnoreMouseEvents(true, { forward: true });
  }
}

function hideCompanionWindow(): void {
  if (companionWindow && !companionWindow.isDestroyed()) {
    companionWindow.hide();
  }
}

function showLauncherWindow(): void {
  if (!launcherWindow || launcherWindow.isDestroyed()) {
    createLauncherWindow();
    return;
  }
  launcherWindow.show();
  launcherWindow.focus();
}

/**
 * Apply OS auto-start. Returns the actually-applied value as reported by
 * the OS (the user might have policies that block it, in which case we
 * mirror the rejection so the tray checkbox doesn't lie).
 */
function applyAutoStart(on: boolean): boolean {
  try {
    if (process.platform === "darwin" || process.platform === "win32") {
      app.setLoginItemSettings({
        openAtLogin: on,
        openAsHidden: true,
        // On Windows the args are passed to the relaunched process so the
        // OS-triggered launch can take the hidden / tray-only path.
        args: on ? ["--hidden"] : [],
      });
      const applied = app.getLoginItemSettings().openAtLogin;
      if (isDev) {
        console.info("[companion][auto-start]", { requested: on, applied });
      }
      return applied;
    }
    // Linux: setLoginItemSettings is a no-op. We honor the user's choice
    // in our own settings file so the tray checkbox still reflects intent.
    return on;
  } catch (err) {
    console.warn("[companion][auto-start] setLoginItemSettings threw", err);
    return false;
  }
}

function quitApp(): void {
  wantsQuit = true;
  app.quit();
}

function startBlockHttpServer(): void {
  ensureBlockBridgeToken();
  startBlockBridge(
    BLOCK_HTTP_PORT,
    {
      onSetBlockMode: (on) => broadcastBlockMode(on, "http"),
      getBlockMode: () => blockModeMirror,
    },
    isDev
  );
}

function stopBlockHttpServer(): void {
  stopBlockBridge();
}

// Companion reports applied state so GET /block mirrors dev-key toggles.
ipcMain.handle("companion-report-block-mode", (event, on: boolean) => {
  if (!isCompanionSender(ipcGuardCtx, event)) return;
  blockModeMirror = !!on;
});

app.whenReady().then(() => {
  assertPackagedLayout();
  appendStartupLog(
    `ready packaged=${app.isPackaged} version=${app.getVersion()} arch=${process.arch}`
  );

  // First-run hook: enable auto-start by default (user requested, can be
  // toggled off any time from the tray).
  const settings = readSettings();
  if (!settings.hasCompletedFirstRun) {
    const applied = applyAutoStart(true);
    writeSettings({ autoStart: applied, hasCompletedFirstRun: true });
  } else {
    // Re-sync on every launch so a tray checkbox change made on a previous
    // session is honored even if the OS hook drifted (Windows occasionally
    // wipes the registry entry across major updates).
    applyAutoStart(settings.autoStart);
  }

  // Always-running services that don't depend on visible windows.
  startBlockHttpServer();

  // Build UI. When started via auto-start (`--hidden`), skip the launcher
  // and go straight to companion + tray.
  if (!startedHidden) {
    createLauncherWindow();
  }

  // Title watcher (extension-less block detection).
  showCompanionWindow();
  updateTitleWatcherSelfPids(
    collectSelfPids([launcherWindow, companionWindow])
  );
  void startTitleWatcher({
    isDev,
    selfPids: collectSelfPids([launcherWindow, companionWindow]),
    onChange: (on, source) => {
      broadcastBlockMode(on, source);
    },
  });

  // Tray. Built last so getCompanion()/getLauncher() return up-to-date refs.
  createAppTray({
    isDev,
    iconCandidates: appIconCandidates(),
    getLauncher: () => launcherWindow,
    getCompanion: () => companionWindow,
    showLauncher: () => showLauncherWindow(),
    showCompanion: () => showCompanionWindow(),
    hideCompanion: () => hideCompanionWindow(),
    setBlockMode: (on, source) => broadcastBlockMode(on, source),
    isBlockMode: () => blockModeMirror,
    setAutoStart: (on) => applyAutoStart(on),
    quit: () => quitApp(),
  });

  registerDisplayTopologyListeners();
});

/**
 * Second-instance handoff: when the user clicks the shortcut while we're
 * already running, surface our existing launcher / companion instead of
 * silently doing nothing.
 */
app.on("second-instance", (_event, argv) => {
  if (argv.includes("--hidden")) {
    // OS triggered a "hidden" relaunch; just stay where we are.
    return;
  }
  if (launcherWindow && !launcherWindow.isDestroyed()) {
    if (launcherWindow.isMinimized()) launcherWindow.restore();
    launcherWindow.show();
    launcherWindow.focus();
  } else {
    createLauncherWindow();
  }
});

app.on("window-all-closed", () => {
  // Do NOT quit — the tray icon keeps the app alive. Users quit via the
  // tray Quit item, which sets `wantsQuit` first.
  if (!wantsQuit) return;
  stopBlockHttpServer();
  stopTitleWatcher();
  destroyAppTray();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  wantsQuit = true;
  stopBlockHttpServer();
  stopTitleWatcher();
  destroyAppTray();
});

app.on("activate", () => {
  if (!launcherWindow && !companionWindow) {
    createLauncherWindow();
  } else {
    showLauncherWindow();
  }
});
