import {
  marksToOverlayPayload,
  tireMarksToOverlay,
  type OverlayMark,
  type TireMark,
} from "../block-chase-tire-tracks";
import type { TireTracksDisplayApi } from "../tire-tracks-windows";
import { TIRE_TRACKS_UI_EVERY_N_APPEND } from "./constants";
import { groupMarksByDisplay } from "./marks";

export type TireTracksOverlayState = {
  visibleDisplayIds: Set<number>;
  appendTick: number;
  lastVisibleDisplayKey: string;
};

export function createTireTracksOverlayState(): TireTracksOverlayState {
  return {
    visibleDisplayIds: new Set(),
    appendTick: 0,
    lastVisibleDisplayKey: "",
  };
}

export function resetTireTracksOverlayState(state: TireTracksOverlayState): void {
  state.visibleDisplayIds = new Set();
  state.appendTick = 0;
  state.lastVisibleDisplayKey = "";
}

export type TireTracksSyncDeps = {
  tireTracks: TireTracksDisplayApi;
  getSpriteSizePx: () => number;
  requestRaiseCompanion: (force?: boolean) => void;
  getKeepVisibleDisplays?: () => ReadonlySet<number> | undefined;
};

export function maybeSyncVisibleDisplays(
  state: TireTracksOverlayState,
  deps: TireTracksSyncDeps,
  spritePx: number,
  keepVisible?: ReadonlySet<number>
): void {
  const key = [...state.visibleDisplayIds].sort((a, b) => a - b).join(",");
  if (key === state.lastVisibleDisplayKey) return;
  state.lastVisibleDisplayKey = key;
  deps.tireTracks.hideDisplaysNotIn(
    state.visibleDisplayIds,
    keepVisible ?? deps.getKeepVisibleDisplays?.()
  );
}

export function pushTireTracksAppend(
  state: TireTracksOverlayState,
  deps: TireTracksSyncDeps,
  added: readonly TireMark[],
  lastStampMs: number,
  appendMarksBuf: OverlayMark[]
): void {
  if (added.length === 0) return;
  const now = Date.now();
  const grouped = groupMarksByDisplay(added, deps.tireTracks.displayIdForPoint);

  for (const [displayId, marks] of grouped) {
    state.visibleDisplayIds.add(displayId);
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

  state.appendTick += 1;
  if (state.appendTick % TIRE_TRACKS_UI_EVERY_N_APPEND === 0) {
    maybeSyncVisibleDisplays(state, deps, deps.getSpriteSizePx());
    deps.requestRaiseCompanion(false);
  }
}

export function pushTireTracksFull(
  state: TireTracksOverlayState,
  deps: TireTracksSyncDeps,
  tireMarks: readonly TireMark[],
  lastStampMs: number,
  overlayMarksBuf: OverlayMark[],
  tireTracksEnabled: boolean
): void {
  if (tireMarks.length === 0) {
    deps.tireTracks.clearAllWindows();
    state.visibleDisplayIds = new Set();
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

  state.visibleDisplayIds = activeDisplayIds;
  state.lastVisibleDisplayKey = "";
  maybeSyncVisibleDisplays(state, deps, deps.getSpriteSizePx());
  if (tireTracksEnabled) {
    deps.requestRaiseCompanion(true);
  }
}

export function primeCrossDisplayOverlays(
  state: TireTracksOverlayState,
  deps: Pick<TireTracksSyncDeps, "tireTracks">,
  anchorDisplayId: number,
  wheelDisplayId: number
): void {
  const ids = [anchorDisplayId, wheelDisplayId];
  deps.tireTracks.ensureDisplaysVisible(ids);
  for (const id of ids) {
    state.visibleDisplayIds.add(id);
  }
}
