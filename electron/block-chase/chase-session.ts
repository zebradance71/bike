import type { BrowserWindow } from "electron";

import { rearWheelScreenFromWindow } from "../block-chase-tire-tracks";
import type { TireTracksDisplayApi } from "../tire-tracks-windows";
import type { ChaseClampArea } from "./clamp-area";
import { computeChaseWindowTarget, facingLeft, type Facing } from "./chase-target";
import {
  applyCompanionBounds,
  readChaseAnchor,
  syncCompanionPosition,
  syncCompanionSize,
  type ChaseWindowState,
} from "./chase-window";
import { SNAP_MIN_DIST_PX } from "./constants";
import { displayIdForAnchor } from "./display";

export function snapToChaseAnchor(input: {
  companion: BrowserWindow;
  offsetX: number;
  offsetY: number;
  facing: Facing;
  chaseWin: ChaseWindowState;
  clampArea: ChaseClampArea;
  spritePx: number;
  pushFacing: (companion: BrowserWindow, next: Facing) => void;
  requestRaiseCompanion: (force?: boolean) => void;
}): Facing {
  const {
    companion,
    offsetX,
    offsetY,
    chaseWin,
    clampArea,
    spritePx,
    pushFacing,
    requestRaiseCompanion,
  } = input;
  let facing = input.facing;

  const { anchorX, anchorY } = readChaseAnchor(offsetX, offsetY);
  syncCompanionSize(companion, chaseWin);
  syncCompanionPosition(companion, chaseWin);

  const displaysDiffer = clampArea.chaseDisplaysDiffer(
    anchorX,
    anchorY,
    chaseWin.x,
    chaseWin.y,
    spritePx,
    facingLeft(facing)
  );
  const target = computeChaseWindowTarget({
    clampArea,
    facing,
    anchorX,
    anchorY,
    winX: chaseWin.x,
    winY: chaseWin.y,
    winW: chaseWin.w,
    winH: chaseWin.h,
    spritePx,
    velX: 0,
  });
  if (target.facing !== facing) {
    pushFacing(companion, target.facing);
    facing = target.facing;
  }

  const dist = Math.hypot(target.x - chaseWin.x, target.y - chaseWin.y);
  if (!displaysDiffer && dist < SNAP_MIN_DIST_PX) return facing;

  clampArea.chaseWorkArea.reset();
  applyCompanionBounds(
    companion,
    chaseWin,
    target.x,
    target.y,
    chaseWin.w,
    chaseWin.h
  );
  requestRaiseCompanion(true);
  return facing;
}

export function primeTireTrackDisplays(input: {
  tireTracks: TireTracksDisplayApi;
  chaseWin: ChaseWindowState;
  facing: Facing;
  anchorX: number;
  anchorY: number;
  spritePx: number;
}): void {
  const wheel = rearWheelScreenFromWindow(
    input.chaseWin.x,
    input.chaseWin.y,
    input.spritePx,
    facingLeft(input.facing)
  );
  input.tireTracks.ensureDisplaysVisible([
    displayIdForAnchor(input.anchorX, input.anchorY),
    displayIdForAnchor(wheel.x, wheel.y),
  ]);
}

export function resetChaseWindowFromCompanion(
  companion: BrowserWindow | null,
  chaseWin: ChaseWindowState
): void {
  chaseWin.posReady = false;
  if (!companion || companion.isDestroyed()) return;
  [chaseWin.w, chaseWin.h] = companion.getSize();
  [chaseWin.x, chaseWin.y] = companion.getPosition();
  chaseWin.posReady = true;
}
