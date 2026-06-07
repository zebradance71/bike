import type { BrowserWindow } from "electron";

import type { OverlayMark } from "../block-chase-tire-tracks";
import type { TireTracksDisplayApi } from "../tire-tracks-windows";
import type { ChaseClampArea } from "./clamp-area";
import type { Facing } from "./chase-target";
import { readChaseAnchor, type ChaseWindowState } from "./chase-window";
import {
  primeTireTrackDisplays,
  resetChaseWindowFromCompanion,
  snapToChaseAnchor,
} from "./chase-session";
import {
  clearTireMarksSession,
  type TireMarksSession,
} from "./tire-marks-session";
import {
  pushTireTracksFull,
  resetTireTracksOverlayState,
  type TireTracksOverlayState,
  type TireTracksSyncDeps,
} from "./tire-tracks-sync";

export function enableChase(input: {
  tireTracks: boolean;
  offsetX: number;
  offsetY: number;
  getCompanionWindow: () => BrowserWindow | null;
  getSpriteSizePx: () => number;
  tireTracksApi: TireTracksDisplayApi;
  session: TireMarksSession;
  clampArea: ChaseClampArea;
  tracksState: TireTracksOverlayState;
  chaseWin: ChaseWindowState;
  pushFacing: (companion: BrowserWindow, next: Facing) => void;
  requestRaiseCompanion: (force?: boolean) => void;
  tickMove: () => void;
  scheduleMoveTick: () => void;
  startTrimTimer: () => void;
}): Facing {
  clearTireMarksSession(input.session);
  input.clampArea.reset();
  resetTireTracksOverlayState(input.tracksState);
  resetChaseWindowFromCompanion(input.getCompanionWindow(), input.chaseWin);

  let facing: Facing = "right";
  if (input.tireTracks) input.tireTracksApi.clearAllWindows();

  const companion = input.getCompanionWindow();
  if (companion && !companion.isDestroyed()) {
    companion.webContents.send("companion-block-chase-facing", "right");
    facing = snapToChaseAnchor({
      companion,
      offsetX: input.offsetX,
      offsetY: input.offsetY,
      facing,
      chaseWin: input.chaseWin,
      clampArea: input.clampArea,
      spritePx: input.getSpriteSizePx(),
      pushFacing: input.pushFacing,
      requestRaiseCompanion: input.requestRaiseCompanion,
    });
    if (input.tireTracks) {
      const { anchorX, anchorY } = readChaseAnchor(input.offsetX, input.offsetY);
      primeTireTrackDisplays({
        tireTracks: input.tireTracksApi,
        chaseWin: input.chaseWin,
        facing,
        anchorX,
        anchorY,
        spritePx: input.getSpriteSizePx(),
      });
    }
  }

  input.tickMove();
  input.scheduleMoveTick();
  if (input.tireTracks) input.startTrimTimer();
  return facing;
}

export function redrawTireTracksIfAny(
  tireTracksEnabled: boolean,
  session: TireMarksSession,
  tracksState: TireTracksOverlayState,
  tracksDeps: TireTracksSyncDeps,
  overlayMarksBuf: OverlayMark[]
): void {
  if (session.marks.length === 0) return;
  pushTireTracksFull(
    tracksState,
    tracksDeps,
    session.marks,
    session.lastStampMs,
    overlayMarksBuf,
    tireTracksEnabled
  );
}
