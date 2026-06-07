import type { BrowserWindow } from "electron";

import type { OverlayMark, TireMark } from "../block-chase-tire-tracks";
import type { TireTracksDisplayApi } from "../tire-tracks-windows";
import type { ChaseClampArea } from "./clamp-area";
import { facingLeft, type Facing } from "./chase-target";
import { applyCompanionBounds, readChaseAnchor, syncCompanionBounds } from "./chase-window";
import type { ChaseWindowState } from "./chase-window";
import { clampWindowToWorkArea } from "./motion";
import {
  pushTireTracksFull,
  type TireTracksOverlayState,
  type TireTracksSyncDeps,
} from "./tire-tracks-sync";

export function handleDisplayTopologyChanged(input: {
  chaseActive: boolean;
  tireTracksEnabled: boolean;
  offsetX: number;
  offsetY: number;
  facing: Facing;
  tireMarks: TireMark[];
  lastStampMs: number;
  chaseWin: ChaseWindowState;
  clampArea: ChaseClampArea;
  tracksState: TireTracksOverlayState;
  tracksDeps: TireTracksSyncDeps;
  overlayMarksBuf: OverlayMark[];
  getCompanionWindow: () => BrowserWindow | null;
  tireTracks: TireTracksDisplayApi;
}): void {
  input.clampArea.chaseWorkArea.reset();
  input.clampArea.invalidateUnionCache();

  const companion = input.getCompanionWindow();
  if (!companion || companion.isDestroyed()) return;

  syncCompanionBounds(companion, input.chaseWin);
  if (!input.chaseActive) return;

  const { anchorX, anchorY } = readChaseAnchor(input.offsetX, input.offsetY);
  const spritePx = input.tracksDeps.getSpriteSizePx();
  const workArea = input.clampArea.resolve(
    anchorX,
    anchorY,
    input.chaseWin.x,
    input.chaseWin.y,
    spritePx,
    facingLeft(input.facing)
  );
  const clamped = clampWindowToWorkArea(
    input.chaseWin.x,
    input.chaseWin.y,
    workArea,
    input.chaseWin.w,
    input.chaseWin.h
  );
  if (clamped.x !== input.chaseWin.x || clamped.y !== input.chaseWin.y) {
    applyCompanionBounds(
      companion,
      input.chaseWin,
      clamped.x,
      clamped.y,
      input.chaseWin.w,
      input.chaseWin.h
    );
  }

  if (!input.tireTracksEnabled || input.tireMarks.length === 0) return;

  input.tracksState.visibleDisplayIds = new Set(
    input.tireMarks.map((m) =>
      input.tireTracks.displayIdForPoint(m.screenX, m.screenY)
    )
  );
  pushTireTracksFull(
    input.tracksState,
    input.tracksDeps,
    input.tireMarks,
    input.lastStampMs,
    input.overlayMarksBuf,
    input.tireTracksEnabled
  );
}
