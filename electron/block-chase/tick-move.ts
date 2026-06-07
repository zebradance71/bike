import type { BrowserWindow } from "electron";
import { screen } from "electron";

import { rearWheelScreenFromWindow, type TireMark } from "../block-chase-tire-tracks";
import type { TireTracksDisplayApi } from "../tire-tracks-windows";
import type { ChaseClampArea } from "./clamp-area";
import {
  computeChaseWindowTarget,
  facingLeft,
  type Facing,
} from "./chase-target";
import {
  applyCompanionBounds,
  readChaseAnchor,
  syncCompanionPosition,
  syncCompanionSize,
  type ChaseWindowState,
} from "./chase-window";
import { CHASE_EDGE_UNION_MARGIN_PX, VEL_SMOOTH } from "./constants";
import { anchorNearWorkAreaEdge, displayIdForAnchor } from "./display";
import { chaseAxisStep } from "./motion";
import {
  primeCrossDisplayOverlays,
  pushTireTracksFull,
  type TireTracksOverlayState,
  type TireTracksSyncDeps,
} from "./tire-tracks-sync";
import type { OverlayMark } from "../block-chase-tire-tracks";

export type TickMoveInput = {
  companion: BrowserWindow;
  offsetX: number;
  offsetY: number;
  facing: Facing;
  tireTracksEnabled: boolean;
  cursorSampleReady: boolean;
  lastCursorX: number;
  velXSmooth: number;
  chaseWin: ChaseWindowState;
  clampArea: ChaseClampArea;
  tracksState: TireTracksOverlayState;
  tracksDeps: TireTracksSyncDeps;
  tireMarks: TireMark[];
  lastStampMs: number;
  overlayMarksBuf: OverlayMark[];
  tireTracks: TireTracksDisplayApi;
  pushFacing: (companion: BrowserWindow, next: Facing) => void;
  stampAtWheel: (wheel: { x: number; y: number }, now: number) => void;
  requestRaiseCompanion: (force?: boolean) => void;
  stopChaseTimers: () => void;
};

export type TickMoveResult = {
  facing: Facing;
  cursorSampleReady: boolean;
  lastCursorX: number;
  velXSmooth: number;
};

export function runTickMove(input: TickMoveInput): TickMoveResult | null {
  const {
    companion,
    offsetX,
    offsetY,
    chaseWin,
    clampArea,
    tracksState,
    tracksDeps,
    tireMarks,
    lastStampMs,
    overlayMarksBuf,
    tireTracksEnabled,
    pushFacing,
    stampAtWheel,
    requestRaiseCompanion,
    stopChaseTimers,
  } = input;

  if (companion.isDestroyed()) {
    stopChaseTimers();
    return null;
  }

  const { cursorX, anchorX, anchorY } = readChaseAnchor(offsetX, offsetY);
  const spritePx = tracksDeps.getSpriteSizePx();
  syncCompanionSize(companion, chaseWin);
  syncCompanionPosition(companion, chaseWin);

  const velX = input.cursorSampleReady ? cursorX - input.lastCursorX : 0;
  const velXSmooth = input.velXSmooth * (1 - VEL_SMOOTH) + velX * VEL_SMOOTH;

  let facing = input.facing;
  const cx = chaseWin.x;
  const cy = chaseWin.y;
  const target = computeChaseWindowTarget({
    clampArea,
    facing,
    anchorX,
    anchorY,
    winX: cx,
    winY: cy,
    winW: chaseWin.w,
    winH: chaseWin.h,
    spritePx,
    velX: velXSmooth,
  });
  if (target.facing !== facing) {
    pushFacing(companion, target.facing);
    facing = target.facing;
  }

  const displaysDiffer = clampArea.chaseDisplaysDiffer(
    anchorX,
    anchorY,
    cx,
    cy,
    spritePx,
    facingLeft(facing)
  );
  const nearEdge = anchorNearWorkAreaEdge(
    anchorX,
    anchorY,
    CHASE_EDGE_UNION_MARGIN_PX
  );
  const wasCrossDisplayChase = clampArea.crossDisplayChase;

  if (displaysDiffer) {
    clampArea.crossDisplayChase = true;
  } else if (!nearEdge) {
    clampArea.crossDisplayChase = false;
  }

  let smoothX: number;
  let smoothY: number;
  if (displaysDiffer) {
    if (!wasCrossDisplayChase) {
      clampArea.chaseWorkArea.reset();
      clampArea.invalidateUnionCache();
    }
    smoothX = target.x;
    smoothY = target.y;
    if (tireTracksEnabled && !wasCrossDisplayChase) {
      const wheel = rearWheelScreenFromWindow(
        target.x,
        target.y,
        spritePx,
        facingLeft(facing)
      );
      primeCrossDisplayOverlays(
        tracksState,
        tracksDeps,
        displayIdForAnchor(anchorX, anchorY),
        displayIdForAnchor(wheel.x, wheel.y)
      );
    }
  } else {
    smoothX = chaseAxisStep(cx, target.x);
    smoothY = chaseAxisStep(cy, target.y);
  }

  if (smoothX !== cx || smoothY !== cy) {
    applyCompanionBounds(
      companion,
      chaseWin,
      smoothX,
      smoothY,
      chaseWin.w,
      chaseWin.h
    );
    requestRaiseCompanion(tireTracksEnabled || displaysDiffer);
  }

  if (tireTracksEnabled && chaseWin.posReady) {
    const wheel = rearWheelScreenFromWindow(
      chaseWin.x,
      chaseWin.y,
      spritePx,
      facingLeft(facing)
    );
    stampAtWheel(wheel, Date.now());
  }

  if (tireTracksEnabled && displaysDiffer && !wasCrossDisplayChase) {
    pushTireTracksFull(
      tracksState,
      tracksDeps,
      tireMarks,
      lastStampMs,
      overlayMarksBuf,
      tireTracksEnabled
    );
  }

  return {
    facing,
    cursorSampleReady: true,
    lastCursorX: cursorX,
    velXSmooth,
  };
}

export function crossDisplayKeepIds(input: {
  offsetX: number;
  offsetY: number;
  chaseWin: ChaseWindowState;
  facing: Facing;
  spritePx: number;
  displayIdForPoint: (x: number, y: number) => number;
}): Set<number> {
  const { anchorX, anchorY } = readChaseAnchor(input.offsetX, input.offsetY);
  const ids = new Set<number>([
    displayIdForAnchor(anchorX, anchorY),
    screen.getDisplayNearestPoint({ x: anchorX, y: anchorY }).id,
  ]);
  if (input.chaseWin.posReady && input.chaseWin.w > 0 && input.chaseWin.h > 0) {
    const wheel = rearWheelScreenFromWindow(
      input.chaseWin.x,
      input.chaseWin.y,
      input.spritePx,
      facingLeft(input.facing)
    );
    ids.add(displayIdForAnchor(wheel.x, wheel.y));
    ids.add(input.displayIdForPoint(wheel.x, wheel.y));
  }
  return ids;
}
