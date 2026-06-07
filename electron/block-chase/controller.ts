import type { BrowserWindow } from "electron";

import type { OverlayMark } from "../block-chase-tire-tracks";
import type { TireTracksDisplayApi } from "../tire-tracks-windows";
import { createChaseClampArea } from "./clamp-area";
import type { Facing } from "./chase-target";
import { createChaseWindowState } from "./chase-window";
import { enableChase, redrawTireTracksIfAny } from "./enable-chase";
import { handleDisplayTopologyChanged } from "./display-topology";
import {
  MOVE_TICK_MS,
  MOVE_TICK_MS_NO_TRACKS,
  RAISE_COMPANION_MIN_MS,
} from "./constants";
import { crossDisplayKeepIds, runTickMove } from "./tick-move";
import {
  createTireMarksSession,
  clearTireMarksSession,
  stampTireTracksAtWheel,
  startTrimTimer,
  stopTrimTimer,
} from "./tire-marks-session";
import {
  createTireTracksOverlayState,
  type TireTracksSyncDeps,
} from "./tire-tracks-sync";

export type BlockChaseControllerDeps = {
  getCompanionWindow: () => BrowserWindow | null;
  getSpriteSizePx: () => number;
  tireTracks: TireTracksDisplayApi;
  raiseCompanion: () => void;
};

export function createBlockChaseController(deps: BlockChaseControllerDeps) {
  let offsetX = 0;
  let offsetY = 0;
  let facing: Facing = "right";
  let lastCursorX = 0;
  let cursorSampleReady = false;
  let chaseActive = false;
  let moveTimer: ReturnType<typeof setTimeout> | null = null;
  let velXSmooth = 0;
  let tireTracksEnabled = false;
  let lastRaiseMs = 0;

  const chaseWin = createChaseWindowState();
  const clampArea = createChaseClampArea();
  const tracksState = createTireTracksOverlayState();
  const marksSession = createTireMarksSession();
  const overlayMarksBuf: OverlayMark[] = [];
  const appendMarksBuf: OverlayMark[] = [];

  function requestRaiseCompanion(force = false): void {
    const now = Date.now();
    if (!force && now - lastRaiseMs < RAISE_COMPANION_MIN_MS) return;
    lastRaiseMs = now;
    deps.raiseCompanion();
  }

  const tracksDeps: TireTracksSyncDeps = {
    tireTracks: deps.tireTracks,
    getSpriteSizePx: deps.getSpriteSizePx,
    requestRaiseCompanion,
    getKeepVisibleDisplays: () =>
      clampArea.crossDisplayChase
        ? crossDisplayKeepIds({
            offsetX,
            offsetY,
            chaseWin,
            facing,
            spritePx: deps.getSpriteSizePx(),
            displayIdForPoint: deps.tireTracks.displayIdForPoint,
          })
        : undefined,
  };

  function pushFacing(companion: BrowserWindow, next: Facing): void {
    if (next === facing) return;
    facing = next;
    companion.webContents.send("companion-block-chase-facing", next);
  }

  function stopChaseTimers(): void {
    chaseActive = false;
    if (moveTimer) {
      clearTimeout(moveTimer);
      moveTimer = null;
    }
    stopTrimTimer(marksSession);
  }

  function tickMove(): void {
    const companion = deps.getCompanionWindow();
    if (!companion || companion.isDestroyed()) {
      stopChaseTimers();
      return;
    }

    const result = runTickMove({
      companion,
      offsetX,
      offsetY,
      facing,
      tireTracksEnabled,
      cursorSampleReady,
      lastCursorX,
      velXSmooth,
      chaseWin,
      clampArea,
      tracksState,
      tracksDeps,
      tireMarks: marksSession.marks,
      lastStampMs: marksSession.lastStampMs,
      overlayMarksBuf,
      tireTracks: deps.tireTracks,
      pushFacing,
      stampAtWheel: (wheel, now) => {
        if (!tireTracksEnabled) return;
        stampTireTracksAtWheel(
          marksSession,
          tracksState,
          tracksDeps,
          appendMarksBuf,
          wheel,
          now
        );
      },
      requestRaiseCompanion,
      stopChaseTimers,
    });
    if (!result) return;
    facing = result.facing;
    cursorSampleReady = result.cursorSampleReady;
    lastCursorX = result.lastCursorX;
    velXSmooth = result.velXSmooth;
  }

  function scheduleMoveTick(): void {
    if (!chaseActive) return;
    tickMove();
    moveTimer = setTimeout(
      scheduleMoveTick,
      tireTracksEnabled ? MOVE_TICK_MS : MOVE_TICK_MS_NO_TRACKS
    );
  }

  function beginChaseLoops(): void {
    chaseActive = true;
    if (moveTimer) return;
    scheduleMoveTick();
  }

  return {
    setOffsets(x?: number, y?: number) {
      if (x != null) offsetX = Math.round(Number(x));
      if (y != null) offsetY = Math.round(Number(y));
    },

    setEnabled(enabled: boolean, tireTracks = false) {
      stopChaseTimers();
      if (!enabled) {
        if (tireTracksEnabled) deps.tireTracks.clearAllWindows();
        tireTracksEnabled = false;
        clearTireMarksSession(marksSession);
        cursorSampleReady = false;
        return;
      }

      tireTracksEnabled = tireTracks;
      cursorSampleReady = false;
      velXSmooth = 0;
      lastRaiseMs = 0;
      facing = enableChase({
        tireTracks,
        offsetX,
        offsetY,
        getCompanionWindow: deps.getCompanionWindow,
        getSpriteSizePx: deps.getSpriteSizePx,
        tireTracksApi: deps.tireTracks,
        session: marksSession,
        clampArea,
        tracksState,
        chaseWin,
        pushFacing,
        requestRaiseCompanion,
        tickMove,
        scheduleMoveTick: beginChaseLoops,
        startTrimTimer: () => startTrimTimer(marksSession),
      });
      chaseActive = true;
    },

    onOverlayHidden() {
      stopTrimTimer(marksSession);
      clearTireMarksSession(marksSession);
    },

    onCompanionClosed() {
      stopChaseTimers();
      clearTireMarksSession(marksSession);
      cursorSampleReady = false;
    },

    onOverlayShown() {
      deps.tireTracks.clearAllWindows();
      startTrimTimer(marksSession);
      redrawTireTracksIfAny(
        tireTracksEnabled,
        marksSession,
        tracksState,
        tracksDeps,
        overlayMarksBuf
      );
    },

    clearOverlayMarks() {
      clearTireMarksSession(marksSession);
      deps.tireTracks.clearAllWindows();
    },

    onDisplayTopologyChanged() {
      handleDisplayTopologyChanged({
        chaseActive,
        tireTracksEnabled,
        offsetX,
        offsetY,
        facing,
        tireMarks: marksSession.marks,
        lastStampMs: marksSession.lastStampMs,
        chaseWin,
        clampArea,
        tracksState,
        tracksDeps,
        overlayMarksBuf,
        getCompanionWindow: deps.getCompanionWindow,
        tireTracks: deps.tireTracks,
      });
    },
  };
}
