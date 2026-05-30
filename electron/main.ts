import { app, BrowserWindow, ipcMain, screen } from "electron";
import { createServer, type Server } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { readSettings, writeSettings } from "./settings-store";
import {
  collectSelfPids,
  startTitleWatcher,
  stopTitleWatcher,
} from "./title-watcher";
import { createAppTray, destroyAppTray, refreshTrayMenu } from "./tray";

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
 * `Quit Ninja2` from the tray menu is the *only* path that should actually
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

type Bounds = { x: number; y: number; width: number; height: number };

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
      console.debug("[ninja][workArea][main]", {
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
    console.debug(`[ninja][${labelOrPayload}][main]`, maybePayload ?? {});
  } else {
    console.debug("[ninja][smoke][main]", labelOrPayload);
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

      const t = Math.min(1, (Date.now() - start) / Math.max(1, durationMs));
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

function baseWindowPxForSprite(spritePx: number): number {
  const sprite = [48, 64, 96].includes(spritePx) ? spritePx : DEFAULT_SPRITE_PX;
  return sprite + WINDOW_CHROME_PX;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function getPreloadPath(): string {
  return path.join(__dirname, "preload.mjs");
}

function devUrl(page: "launcher" | "companion"): string {
  const base = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173";
  return `${base}/${page}.html`;
}

function createLauncherWindow(): void {
  if (launcherWindow && !launcherWindow.isDestroyed()) {
    launcherWindow.show();
    launcherWindow.focus();
    return;
  }
  launcherWindow = new BrowserWindow({
    width: 360,
    height: 280,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: !startedHidden,
    title: "NINJA",
    backgroundColor: "#f5f0e8",
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    launcherWindow.loadURL(devUrl("launcher"));
  } else {
    launcherWindow.loadFile(path.join(__dirname, "../dist/launcher.html"));
  }

  // Closing the launcher should not quit the app; we just minimise to tray.
  // The tray's "Quit Ninja2" sets `wantsQuit = true` first, which lets the
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
      console.debug("[ninja][teleport][opposite]", {
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
  const [x] = companionWindow.getPosition();
  const y = companionY(winPx);
  companionWindow.setSize(winPx, winPx);
  companionWindow.setPosition(x, y);
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
    const extra = Math.max(0, Math.round(extraWidthPx));
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
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

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
    companionWindow = null;
  });
}

function companionPosition(
  winW: number,
  options?: { scatterToSides?: boolean; marginX?: number; marginY?: number }
): { x: number; y: number } {
  const centerX = pickTargetSpriteCenterX(
    winW,
    options?.marginX ?? COMPANION_MARGIN
  );
  // workAreaBounds() handles multi-monitor; before companionWindow exists it
  // falls back to primary, which matches first-mount behavior.
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

ipcMain.on("start-mission", () => {
  startMission();
});

ipcMain.handle(
  "companion-teleport",
  (
    _event,
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
          console.debug("[ninja][teleport][hard-reset][main]", {
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
            console.error("[ninja][teleport][hard-reset-FAILED][main]", {
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

ipcMain.handle("companion-set-size", (_event, spritePx: number) => {
  applyCompanionSize(spritePx);
});

ipcMain.handle("companion-get-bounds", () => {
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
  (_event, enabled: boolean, extraWidthPx?: number) => {
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
  const maxExpansionPx = baseSpriteForCap * 3;
  const requested = Math.max(0, Math.round(leftExtraPx));
  if (requested > maxExpansionPx) {
    if (isDev) {
      console.warn("[ninja][kunai-mode][rejected][main]", {
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
    console.debug("[ninja][kunai-mode][main]", {
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
      console.debug("[ninja][kunai-state-corrupt][main]", {
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
  (_event, enabled: boolean, leftExtraPx?: number) => {
    applyKunaiThrowMode(Boolean(enabled), leftExtraPx ?? 0);
  }
);

ipcMain.handle(
  "companion-slide-x",
  async (_event, deltaPx: number, durationMs: number) => {
    if (!companionWindow) return;
    const [fromX, y] = companionWindow.getPosition();
    const winW = companionWindow.getSize()[0];
    const area = workAreaBounds();
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
    await animateCompanionX(targetX, durationMs);
  }
);

ipcMain.handle(
  "companion-peek-edge",
  async (_event, side: "left" | "right", durationMs: number) => {
    if (!companionWindow) return;
    const [fromX, fromY] = companionWindow.getPosition();
    savedCompanionPosition = { x: fromX, y: fromY };

    const winW = companionWindow.getSize()[0];
    const area = workAreaBounds();
    const hidden = Math.floor(winW * 0.48);
    const targetX =
      side === "left" ? area.x - hidden : area.x + area.width - winW + hidden;

    await animateCompanionX(targetX, durationMs);
  }
);

ipcMain.handle("companion-restore-position", async (_event, durationMs: number) => {
  if (!companionWindow || !savedCompanionPosition) return;
  const { x } = savedCompanionPosition;
  savedCompanionPosition = null;
  await animateCompanionX(x, durationMs);
});

/**
 * Block-mode HTTP bridge.
 *
 * A future browser extension is the intended client. Exposes a tiny
 * loopback-only HTTP server on 127.0.0.1 so the extension can flip block
 * mode with a simple `fetch("http://127.0.0.1:7727/block/on")` whenever
 * the user navigates to a configured "blocked" site (X / YouTube / etc.).
 *
 *  GET /block/on    → flip block-mode ON  (200 OK json)
 *  GET /block/off   → flip block-mode OFF (200 OK json)
 *  GET /block       → report current state (best-effort, host-side mirror)
 *
 * The companion renderer holds the canonical state; main only forwards
 * the requested transition via `webContents.send("companion-block-mode", on)`.
 */
const BLOCK_HTTP_PORT = Number(process.env.NINJA_BLOCK_PORT ?? 7727);
let blockHttpServer: Server | null = null;
let blockModeMirror = false; // best-effort echo of last request

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
    console.debug("[ninja][block] broadcast", { on, source });
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
        console.info("[ninja][auto-start]", { requested: on, applied });
      }
      return applied;
    }
    // Linux: setLoginItemSettings is a no-op. We honor the user's choice
    // in our own settings file so the tray checkbox still reflects intent.
    return on;
  } catch (err) {
    console.warn("[ninja][auto-start] setLoginItemSettings threw", err);
    return false;
  }
}

function quitApp(): void {
  wantsQuit = true;
  app.quit();
}

function startBlockHttpServer(): void {
  if (blockHttpServer) return;
  blockHttpServer = createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }
    if (!req.url) {
      res.statusCode = 400;
      res.end();
      return;
    }
    const url = new URL(req.url, "http://127.0.0.1");
    const reply = (status: number, body: unknown) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(body));
    };
    if (url.pathname === "/block/on") {
      broadcastBlockMode(true, "http");
      reply(200, { ok: true, blockMode: true });
      return;
    }
    if (url.pathname === "/block/off") {
      broadcastBlockMode(false, "http");
      reply(200, { ok: true, blockMode: false });
      return;
    }
    if (url.pathname === "/block") {
      reply(200, { ok: true, blockMode: blockModeMirror });
      return;
    }
    reply(404, { ok: false, error: "not found" });
  });
  blockHttpServer.on("error", (err) => {
    console.warn("[ninja][block-http] server error", err);
  });
  blockHttpServer.listen(BLOCK_HTTP_PORT, "127.0.0.1", () => {
    if (isDev) {
      console.info(
        "[ninja][block-http] listening on 127.0.0.1:" + BLOCK_HTTP_PORT
      );
    }
  });
}

function stopBlockHttpServer(): void {
  if (!blockHttpServer) return;
  blockHttpServer.close();
  blockHttpServer = null;
}

// Renderer reports the *applied* state (in case the user toggled with
// dev key `B`) so the HTTP /block GET stays consistent.
ipcMain.handle("companion-report-block-mode", (_event, on: boolean) => {
  blockModeMirror = !!on;
});

app.whenReady().then(() => {
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

  // Title watcher (extension-less block detection). Fires onChange only
  // on debounced transitions; broadcastBlockMode() dedupes against the
  // HTTP bridge so the two sources can coexist without ceremony churn.
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
    iconCandidates: [
      // Production / packaged: assets/ ships next to the executable.
      path.join(process.resourcesPath ?? "", "assets", "tray.ico"),
      path.join(process.resourcesPath ?? "", "assets", "tray.png"),
      // Repo-relative paths (dev + unpackaged builds).
      path.join(__dirname, "../assets/tray.ico"),
      path.join(__dirname, "../assets/tray.png"),
      path.join(__dirname, "../../assets/tray.ico"),
      path.join(__dirname, "../../assets/tray.png"),
      // Dev-time last resort: use the idle sprite directly. Electron will
      // downscale it automatically. Slightly fuzzy at 16px but the user
      // immediately sees a ninja head in the tray instead of a blank
      // square while they wait to run `py -3 scripts/build-tray-icon.py`.
      path.join(__dirname, "../src/companion/assets/frames/idle.png"),
      path.join(__dirname, "../../src/companion/assets/frames/idle.png"),
    ],
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

  // Always materialize the companion at startup. With the tray wrapping
  // the lifecycle, the user expects the ninja to appear the instant the
  // app is up — not after pressing a launcher button. Hiding/showing is
  // controlled from the tray afterward.
  showCompanionWindow();
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
  // tray "Quit Ninja2" item, which sets `wantsQuit` first.
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
