import type { BrowserWindow } from "electron";
import { screen } from "electron";
import {
  clampWheelToWorkArea,
  marksToOverlayPayload,
  rearWheelScreenFromWindow,
  stampTireMarksAlongSegment,
  tireMarksToOverlay,
  trimMarks,
  windowPositionFromWheelScreen,
  type OverlayMark,
  type TireMark,
} from "./block-chase-tire-tracks";
import {
  computeVirtualWorkArea,
  createChaseWorkAreaResolver,
  type TireTracksDisplayApi,
} from "./tire-tracks-windows";

type WorkArea = { x: number; y: number; width: number; height: number };

export type BlockChaseControllerDeps = {
  getCompanionWindow: () => BrowserWindow | null;
  getSpriteSizePx: () => number;
  tireTracks: TireTracksDisplayApi;
  raiseCompanion: () => void;
};

/** With tire tracks: balance smooth chase vs CPU (was 4ms ≈250Hz). */
const MOVE_TICK_MS = 6;
const MOVE_TICK_MS_NO_TRACKS = 12;
const TRIM_INTERVAL_MS = 600;
/** Throttle hide/raise on tire-track append (still every tick while moving). */
const TIRE_TRACKS_UI_EVERY_N_APPEND = 4;
/** Keep companion above tire-track overlays (Win32 re-stacks on showInactive). */
const RAISE_COMPANION_MIN_MS = 36;
const FACING_VEL_THRESHOLD_PX = 12;
const FACING_VEL_LOCK_PX = 5;
const FACING_WHEEL_HYSTERESIS_PX = 40;
const VEL_SMOOTH = 0.45;
/** Distance-adaptive lerp — removed in a prior pass; restores smooth fast chase on heavy FG apps. */
const CHASE_BASE_LERP = 0.72;
/** Beyond this px gap per tick, snap (fast flick). */
const CHASE_SNAP_DIST_PX = 140;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function chaseAxisStep(current: number, target: number): number {
  const d = target - current;
  const dist = Math.abs(d);
  if (dist <= 1) return target;
  if (dist >= CHASE_SNAP_DIST_PX) return target;

  const lerp = Math.min(0.97, CHASE_BASE_LERP + dist * 0.009);
  let step = d * lerp;
  const maxStep = Math.max(16, Math.min(dist * 0.88, 128));
  if (Math.abs(step) > maxStep) step = Math.sign(d) * maxStep;
  return Math.round(current + step);
}

/** When anchor is this close to a work-area edge, use virtual union clamp (cross prep). */
const CHASE_EDGE_UNION_MARGIN_PX = 56;

function pointInWorkArea(x: number, y: number, wa: WorkArea): boolean {
  return (
    x >= wa.x &&
    x < wa.x + wa.width &&
    y >= wa.y &&
    y < wa.y + wa.height
  );
}

function displayIdForAnchor(x: number, y: number): number {
  for (const display of screen.getAllDisplays()) {
    if (pointInWorkArea(x, y, display.workArea)) {
      return display.id;
    }
  }
  return screen.getDisplayNearestPoint({ x, y }).id;
}

function anchorNearWorkAreaEdge(
  anchorX: number,
  anchorY: number,
  marginPx: number
): boolean {
  const display = screen
    .getAllDisplays()
    .find((d) => d.id === displayIdForAnchor(anchorX, anchorY));
  if (!display) return false;
  const wa = display.workArea;
  if (!pointInWorkArea(anchorX, anchorY, wa)) return false;
  return (
    anchorX < wa.x + marginPx ||
    anchorX >= wa.x + wa.width - marginPx ||
    anchorY < wa.y + marginPx ||
    anchorY >= wa.y + wa.height - marginPx
  );
}

function displayIdAt(x: number, y: number): number {
  return screen.getDisplayNearestPoint({ x, y }).id;
}

function resolveFacing(
  cursorX: number,
  wheelX: number,
  current: "left" | "right",
  velX: number
): "left" | "right" {
  if (velX >= FACING_VEL_THRESHOLD_PX) return "right";
  if (velX <= -FACING_VEL_THRESHOLD_PX) return "left";
  if (Math.abs(velX) >= FACING_VEL_LOCK_PX) return current;

  const dx = cursorX - wheelX;
  if (current === "right") {
    return dx < -FACING_WHEEL_HYSTERESIS_PX ? "left" : "right";
  }
  return dx > FACING_WHEEL_HYSTERESIS_PX ? "right" : "left";
}

function groupMarksByDisplay(
  marks: readonly TireMark[],
  displayIdForPoint: (x: number, y: number) => number
): Map<number, TireMark[]> {
  const grouped = new Map<number, TireMark[]>();
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i]!;
    const displayId = displayIdForPoint(m.screenX, m.screenY);
    const bucket = grouped.get(displayId);
    if (bucket) {
      bucket.push(m);
    } else {
      grouped.set(displayId, [m]);
    }
  }
  return grouped;
}

export function createBlockChaseController(deps: BlockChaseControllerDeps) {
  let offsetX = 0;
  let offsetY = 0;
  let facing: "left" | "right" = "right";
  let tireMarks: TireMark[] = [];
  let lastWheel: { x: number; y: number } | null = null;
  let lastStampMs = 0;
  let lastRaiseMs = 0;
  let lastCursorX = 0;
  let cursorSampleReady = false;
  let chaseActive = false;
  let moveTimer: ReturnType<typeof setTimeout> | null = null;
  let trimTimer: ReturnType<typeof setInterval> | null = null;
  let velXSmooth = 0;
  let cachedWinW = 0;
  let cachedWinH = 0;
  let chaseWinX = 0;
  let chaseWinY = 0;
  let chaseWinPosReady = false;
  const chaseWorkArea = createChaseWorkAreaResolver();
  let visibleDisplayIds = new Set<number>();
  let tireTracksEnabled = false;
  /** Latched while crossing monitors or approaching a work-area edge. */
  let crossDisplayChase = false;
  let tireTracksAppendTick = 0;
  let lastVisibleDisplayKey = "";
  let cachedUnionWorkArea: WorkArea | null = null;
  const overlayMarksBuf: OverlayMark[] = [];
  const appendMarksBuf: OverlayMark[] = [];

  function requestRaiseCompanion(force = false): void {
    const now = Date.now();
    if (!force && now - lastRaiseMs < RAISE_COMPANION_MIN_MS) return;
    lastRaiseMs = now;
    deps.raiseCompanion();
  }

  function moveCompanionWindow(
    companion: BrowserWindow,
    x: number,
    y: number,
    w: number,
    h: number
  ): void {
    companion.setBounds({ x, y, width: w, height: h });
    const bounds = companion.getBounds();
    chaseWinX = bounds.x;
    chaseWinY = bounds.y;
    chaseWinPosReady = true;
  }

  function invalidateUnionWorkAreaCache(): void {
    cachedUnionWorkArea = null;
  }

  function unionWorkArea(): WorkArea {
    if (!cachedUnionWorkArea) {
      cachedUnionWorkArea = computeVirtualWorkArea();
    }
    return cachedUnionWorkArea;
  }

  function maybeSyncVisibleDisplays(spritePx: number): void {
    const key = [...visibleDisplayIds].sort((a, b) => a - b).join(",");
    if (key === lastVisibleDisplayKey) return;
    lastVisibleDisplayKey = key;
    deps.tireTracks.hideDisplaysNotIn(
      visibleDisplayIds,
      crossDisplayChase
        ? crossDisplayKeepIds(spritePx)
        : undefined
    );
  }

  function chaseDisplaysDiffer(
    anchorX: number,
    anchorY: number,
    cx: number,
    cy: number,
    spritePx: number
  ): boolean {
    const anchorDisp = displayIdForAnchor(anchorX, anchorY);
    const wheel = rearWheelScreenFromWindow(
      cx,
      cy,
      spritePx,
      facing === "left"
    );
    return anchorDisp !== displayIdForAnchor(wheel.x, wheel.y);
  }

  function shouldUseUnionChaseClamp(
    anchorX: number,
    anchorY: number,
    cx: number,
    cy: number,
    spritePx: number
  ): boolean {
    return (
      chaseDisplaysDiffer(anchorX, anchorY, cx, cy, spritePx) ||
      crossDisplayChase ||
      anchorNearWorkAreaEdge(anchorX, anchorY, CHASE_EDGE_UNION_MARGIN_PX)
    );
  }

  /** Per-monitor clamp on same display; union while crossing or near an edge. */
  function resolveChaseClampArea(
    anchorX: number,
    anchorY: number,
    cx: number,
    cy: number,
    spritePx: number
  ): WorkArea {
    if (shouldUseUnionChaseClamp(anchorX, anchorY, cx, cy, spritePx)) {
      return unionWorkArea();
    }
    return chaseWorkArea.resolve(anchorX, anchorY);
  }

  function pushFacing(companion: BrowserWindow, next: "left" | "right"): void {
    if (next === facing) return;
    facing = next;
    companion.webContents.send("companion-block-chase-facing", next);
  }

  function pushTireTracksAppend(added: readonly TireMark[]): void {
    if (added.length === 0) return;
    const now = Date.now();
    const grouped = groupMarksByDisplay(
      added,
      deps.tireTracks.displayIdForPoint
    );

    for (const [displayId, marks] of grouped) {
      visibleDisplayIds.add(displayId);
      const area = deps.tireTracks.workAreaForDisplay(displayId);
      const append = tireMarksToOverlay(
        marks,
        area,
        now,
        lastStampMs,
        appendMarksBuf
      );
      if (append.length === 0) continue;

      deps.tireTracks.pushFrame(displayId, {
        workArea: area,
        append,
      });
    }

    const spritePx = deps.getSpriteSizePx();
    tireTracksAppendTick += 1;
    if (tireTracksAppendTick % TIRE_TRACKS_UI_EVERY_N_APPEND === 0) {
      maybeSyncVisibleDisplays(spritePx);
      requestRaiseCompanion(false);
    }
  }

  function crossDisplayKeepIds(spritePx: number): Set<number> {
    const w = cachedWinW;
    const h = cachedWinH;
    const cursor = screen.getCursorScreenPoint();
    const anchorX = cursor.x + offsetX;
    const anchorY = cursor.y + offsetY;
    const ids = new Set<number>([
      displayIdForAnchor(anchorX, anchorY),
      displayIdAt(anchorX, anchorY),
    ]);
    if (chaseWinPosReady && w > 0 && h > 0) {
      const wheel = rearWheelScreenFromWindow(
        chaseWinX,
        chaseWinY,
        spritePx,
        facing === "left"
      );
      ids.add(displayIdForAnchor(wheel.x, wheel.y));
      ids.add(deps.tireTracks.displayIdForPoint(wheel.x, wheel.y));
    }
    return ids;
  }

  function primeCrossDisplayOverlays(
    anchorX: number,
    anchorY: number,
    winX: number,
    winY: number,
    spritePx: number
  ): void {
    const wheel = rearWheelScreenFromWindow(
      winX,
      winY,
      spritePx,
      facing === "left"
    );
    const ids = [
      displayIdForAnchor(anchorX, anchorY),
      displayIdForAnchor(wheel.x, wheel.y),
    ];
    deps.tireTracks.ensureDisplaysVisible(ids);
    for (const id of ids) {
      visibleDisplayIds.add(id);
    }
  }

  function pushTireTracksFull(): void {
    if (tireMarks.length === 0) {
      deps.tireTracks.clearAllWindows();
      visibleDisplayIds = new Set();
      return;
    }

    const now = Date.now();
    const grouped = groupMarksByDisplay(
      tireMarks,
      deps.tireTracks.displayIdForPoint
    );
    const activeDisplayIds = new Set<number>();

    for (const [displayId, marks] of grouped) {
      activeDisplayIds.add(displayId);
      const area = deps.tireTracks.workAreaForDisplay(displayId);
      const payload = marksToOverlayPayload(
        marks,
        area,
        now,
        lastStampMs,
        overlayMarksBuf
      );
      deps.tireTracks.pushFrame(displayId, {
        ...payload,
        fullRedraw: true,
      });
    }

    visibleDisplayIds = activeDisplayIds;
    lastVisibleDisplayKey = "";
    maybeSyncVisibleDisplays(deps.getSpriteSizePx());
    if (tireTracksEnabled) {
      requestRaiseCompanion(true);
    }
  }

  function clampWindowToWorkArea(
    x: number,
    y: number,
    workArea: WorkArea,
    w: number,
    h: number
  ): { x: number; y: number } {
    return {
      x: clamp(x, workArea.x, workArea.x + workArea.width - w),
      y: clamp(y, workArea.y, workArea.y + workArea.height - h),
    };
  }

  function tryFlipFacing(
    next: "left" | "right",
    cx: number,
    cy: number,
    spritePx: number,
    companion: BrowserWindow
  ): { x: number; y: number } | null {
    if (next === facing) return null;

    const wheel = rearWheelScreenFromWindow(
      cx,
      cy,
      spritePx,
      facing === "left"
    );
    pushFacing(companion, next);
    return windowPositionFromWheelScreen(
      wheel.x,
      wheel.y,
      spritePx,
      facing === "left"
    );
  }

  function chaseWindowTarget(
    companion: BrowserWindow,
    anchorX: number,
    anchorY: number,
    cx: number,
    cy: number,
    w: number,
    h: number,
    spritePx: number,
    velX: number
  ): { x: number; y: number; wheelX: number; wheelY: number } {
    const workArea = resolveChaseClampArea(anchorX, anchorY, cx, cy, spritePx);
    const currentWheel = rearWheelScreenFromWindow(
      cx,
      cy,
      spritePx,
      facing === "left"
    );

    const flipTarget = tryFlipFacing(
      resolveFacing(anchorX, currentWheel.x, facing, velX),
      cx,
      cy,
      spritePx,
      companion
    );

    let nx: number;
    let ny: number;
    if (flipTarget) {
      ({ x: nx, y: ny } = clampWindowToWorkArea(
        flipTarget.x,
        flipTarget.y,
        workArea,
        w,
        h
      ));
    } else {
      const wheelAnchor = clampWheelToWorkArea(
        anchorX,
        anchorY,
        workArea,
        spritePx,
        facing === "left"
      );
      const target = windowPositionFromWheelScreen(
        wheelAnchor.x,
        wheelAnchor.y,
        spritePx,
        facing === "left"
      );
      ({ x: nx, y: ny } = clampWindowToWorkArea(
        target.x,
        target.y,
        workArea,
        w,
        h
      ));
    }

    const wheel = rearWheelScreenFromWindow(
      nx,
      ny,
      spritePx,
      facing === "left"
    );
    return { x: nx, y: ny, wheelX: wheel.x, wheelY: wheel.y };
  }

  /** Jump to cursor when idle and block site live on different monitors. */
  function snapToChaseAnchor(companion: BrowserWindow): void {
    const cursor = screen.getCursorScreenPoint();
    const anchorX = cursor.x + offsetX;
    const anchorY = cursor.y + offsetY;
    const spritePx = deps.getSpriteSizePx();
    if (cachedWinW <= 0 || cachedWinH <= 0) {
      [cachedWinW, cachedWinH] = companion.getSize();
    }
    const w = cachedWinW;
    const h = cachedWinH;

    if (!chaseWinPosReady) {
      [chaseWinX, chaseWinY] = companion.getPosition();
      chaseWinPosReady = true;
    }

    const displaysDiffer = chaseDisplaysDiffer(
      anchorX,
      anchorY,
      chaseWinX,
      chaseWinY,
      spritePx
    );
    const target = chaseWindowTarget(
      companion,
      anchorX,
      anchorY,
      chaseWinX,
      chaseWinY,
      w,
      h,
      spritePx,
      0
    );
    const dist = Math.hypot(target.x - chaseWinX, target.y - chaseWinY);
    if (!displaysDiffer && dist < 120) return;

    chaseWorkArea.reset();
    moveCompanionWindow(companion, target.x, target.y, w, h);
    requestRaiseCompanion(true);
  }

  /** Hot path: cursor → setPosition only. */
  function tickMove(): void {
    const companion = deps.getCompanionWindow();
    if (!companion || companion.isDestroyed()) {
      stopChaseTimers();
      return;
    }

    const cursor = screen.getCursorScreenPoint();
    const anchorX = cursor.x + offsetX;
    const anchorY = cursor.y + offsetY;
    const spritePx = deps.getSpriteSizePx();
    if (cachedWinW <= 0 || cachedWinH <= 0) {
      [cachedWinW, cachedWinH] = companion.getSize();
    }
    const w = cachedWinW;
    const h = cachedWinH;

    const velX = cursorSampleReady ? cursor.x - lastCursorX : 0;
    velXSmooth = velXSmooth * (1 - VEL_SMOOTH) + velX * VEL_SMOOTH;
    lastCursorX = cursor.x;
    cursorSampleReady = true;

    if (!chaseWinPosReady) {
      [chaseWinX, chaseWinY] = companion.getPosition();
      chaseWinPosReady = true;
    }
    const cx = chaseWinX;
    const cy = chaseWinY;

    const target = chaseWindowTarget(
      companion,
      anchorX,
      anchorY,
      cx,
      cy,
      w,
      h,
      spritePx,
      velXSmooth
    );
    const { x: nx, y: ny } = target;

    const displaysDiffer = chaseDisplaysDiffer(anchorX, anchorY, cx, cy, spritePx);
    const nearEdge = anchorNearWorkAreaEdge(
      anchorX,
      anchorY,
      CHASE_EDGE_UNION_MARGIN_PX
    );
    const wasCrossDisplayChase = crossDisplayChase;

    if (displaysDiffer) {
      crossDisplayChase = true;
    } else if (!nearEdge) {
      crossDisplayChase = false;
    }

    let smoothX: number;
    let smoothY: number;
    if (displaysDiffer) {
      if (!wasCrossDisplayChase) {
        chaseWorkArea.reset();
        invalidateUnionWorkAreaCache();
      }
      smoothX = nx;
      smoothY = ny;
      if (tireTracksEnabled && displaysDiffer && !wasCrossDisplayChase) {
        primeCrossDisplayOverlays(anchorX, anchorY, nx, ny, spritePx);
      }
    } else {
      smoothX = chaseAxisStep(cx, nx);
      smoothY = chaseAxisStep(cy, ny);
    }

    const moved = smoothX !== cx || smoothY !== cy;
    if (moved) {
      moveCompanionWindow(companion, smoothX, smoothY, w, h);
      requestRaiseCompanion(tireTracksEnabled || displaysDiffer);
    }

    if (tireTracksEnabled && chaseWinPosReady) {
      const wheel = rearWheelScreenFromWindow(
        chaseWinX,
        chaseWinY,
        spritePx,
        facing === "left"
      );
      stampTireTracksAtWheel(wheel, Date.now());
    }

    if (tireTracksEnabled && displaysDiffer && !wasCrossDisplayChase) {
      pushTireTracksFull();
    }
  }

  /** Stamps after move — same tick as position so monitor crosses stay continuous. */
  function stampTireTracksAtWheel(
    wheel: { x: number; y: number },
    now: number
  ): void {
    if (!tireTracksEnabled) return;

    const stamp = stampTireMarksAlongSegment(
      tireMarks,
      lastWheel,
      wheel,
      now,
      lastStampMs
    );
    lastWheel = stamp.to;
    if (stamp.added > 0) {
      lastStampMs = now;
      pushTireTracksAppend(stamp.addedMarks);
    }
  }

  function scheduleMoveTick(): void {
    if (!chaseActive) return;
    tickMove();
    moveTimer = setTimeout(
      scheduleMoveTick,
      tireTracksEnabled ? MOVE_TICK_MS : MOVE_TICK_MS_NO_TRACKS
    );
  }

  function startChaseLoops(): void {
    if (moveTimer) return;
    scheduleMoveTick();
  }

  function stopChaseTimers(): void {
    chaseActive = false;
    if (moveTimer) {
      clearTimeout(moveTimer);
      moveTimer = null;
    }
    if (trimTimer) {
      clearInterval(trimTimer);
      trimTimer = null;
    }
  }

  function clearTireMarks(): void {
    tireMarks = [];
    lastWheel = null;
    lastStampMs = 0;
  }

  function startTrimTimer(): void {
    if (trimTimer) return;
    trimTimer = setInterval(() => {
      if (tireMarks.length === 0) return;
      trimMarks(tireMarks, Date.now(), lastStampMs);
    }, TRIM_INTERVAL_MS);
  }

  return {
    setOffsets(x?: number, y?: number) {
      if (x != null) offsetX = Math.round(Number(x));
      if (y != null) offsetY = Math.round(Number(y));
    },

    setEnabled(enabled: boolean, tireTracks = false) {
      stopChaseTimers();
      if (!enabled) {
        if (tireTracksEnabled) {
          deps.tireTracks.clearAllWindows();
        }
        tireTracksEnabled = false;
        clearTireMarks();
        cursorSampleReady = false;
        return;
      }

      tireTracksEnabled = tireTracks;
      clearTireMarks();
      if (tireTracksEnabled) {
        deps.tireTracks.clearAllWindows();
      }
      invalidateUnionWorkAreaCache();
      facing = "right";
      cursorSampleReady = false;
      velXSmooth = 0;
      lastRaiseMs = 0;
      visibleDisplayIds = new Set();
      crossDisplayChase = false;
      lastVisibleDisplayKey = "";
      tireTracksAppendTick = 0;
      chaseWorkArea.reset();
      chaseWinPosReady = false;

      const companion = deps.getCompanionWindow();
      if (companion && !companion.isDestroyed()) {
        const [w, h] = companion.getSize();
        cachedWinW = w;
        cachedWinH = h;
        [chaseWinX, chaseWinY] = companion.getPosition();
        chaseWinPosReady = true;
        companion.webContents.send("companion-block-chase-facing", "right");
        snapToChaseAnchor(companion);
        if (tireTracksEnabled) {
          const cursor = screen.getCursorScreenPoint();
          const anchorX = cursor.x + offsetX;
          const anchorY = cursor.y + offsetY;
          const spritePx = deps.getSpriteSizePx();
          const wheel = rearWheelScreenFromWindow(
            chaseWinX,
            chaseWinY,
            spritePx,
            facing === "left"
          );
          deps.tireTracks.ensureDisplaysVisible([
            displayIdForAnchor(anchorX, anchorY),
            displayIdForAnchor(wheel.x, wheel.y),
          ]);
        }
      }

      chaseActive = true;
      tickMove();
      startChaseLoops();
      if (tireTracksEnabled) {
        startTrimTimer();
      }
    },

    onOverlayHidden() {
      if (trimTimer) {
        clearInterval(trimTimer);
        trimTimer = null;
      }
      clearTireMarks();
    },

    onCompanionClosed() {
      stopChaseTimers();
      clearTireMarks();
      cursorSampleReady = false;
    },

    onOverlayShown() {
      deps.tireTracks.clearAllWindows();
      startTrimTimer();
      if (tireMarks.length > 0) {
        pushTireTracksFull();
      }
    },

    clearOverlayMarks() {
      clearTireMarks();
      deps.tireTracks.clearAllWindows();
    },

    /** Monitor hot-plug / metrics change — re-clamp chase and redraw tracks. */
    onDisplayTopologyChanged() {
      chaseWorkArea.reset();
      invalidateUnionWorkAreaCache();

      const companion = deps.getCompanionWindow();
      if (!companion || companion.isDestroyed()) return;

      const [w, h] = companion.getSize();
      cachedWinW = w;
      cachedWinH = h;
      const bounds = companion.getBounds();
      chaseWinX = bounds.x;
      chaseWinY = bounds.y;
      chaseWinPosReady = true;

      if (!chaseActive) return;

      const cursor = screen.getCursorScreenPoint();
      const anchorX = cursor.x + offsetX;
      const anchorY = cursor.y + offsetY;
      const spritePx = deps.getSpriteSizePx();
      const workArea = resolveChaseClampArea(
        anchorX,
        anchorY,
        chaseWinX,
        chaseWinY,
        spritePx
      );
      const clamped = clampWindowToWorkArea(
        chaseWinX,
        chaseWinY,
        workArea,
        w,
        h
      );
      if (clamped.x !== chaseWinX || clamped.y !== chaseWinY) {
        moveCompanionWindow(companion, clamped.x, clamped.y, w, h);
      }

      if (!tireTracksEnabled || tireMarks.length === 0) return;

      visibleDisplayIds = new Set(
        tireMarks.map((m) => deps.tireTracks.displayIdForPoint(m.screenX, m.screenY))
      );
      pushTireTracksFull();
    },
  };
}
