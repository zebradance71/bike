import {
  stampTireMarksAlongSegment,
  trimMarks,
  type OverlayMark,
  type TireMark,
} from "../block-chase-tire-tracks";
import { TRIM_INTERVAL_MS } from "./constants";
import {
  pushTireTracksAppend,
  type TireTracksOverlayState,
  type TireTracksSyncDeps,
} from "./tire-tracks-sync";

export type TireMarksSession = {
  marks: TireMark[];
  lastWheel: { x: number; y: number } | null;
  lastStampMs: number;
  trimTimer: ReturnType<typeof setInterval> | null;
};

export function createTireMarksSession(): TireMarksSession {
  return { marks: [], lastWheel: null, lastStampMs: 0, trimTimer: null };
}

export function clearTireMarksSession(session: TireMarksSession): void {
  session.marks = [];
  session.lastWheel = null;
  session.lastStampMs = 0;
}

export function stopTrimTimer(session: TireMarksSession): void {
  if (!session.trimTimer) return;
  clearInterval(session.trimTimer);
  session.trimTimer = null;
}

export function startTrimTimer(session: TireMarksSession): void {
  if (session.trimTimer) return;
  session.trimTimer = setInterval(() => {
    if (session.marks.length === 0) return;
    trimMarks(session.marks, Date.now(), session.lastStampMs);
  }, TRIM_INTERVAL_MS);
}

export function stampTireTracksAtWheel(
  session: TireMarksSession,
  tracksState: TireTracksOverlayState,
  tracksDeps: TireTracksSyncDeps,
  appendMarksBuf: OverlayMark[],
  wheel: { x: number; y: number },
  now: number
): void {
  const stamp = stampTireMarksAlongSegment(
    session.marks,
    session.lastWheel,
    wheel,
    now,
    session.lastStampMs
  );
  session.lastWheel = stamp.to;
  if (stamp.added === 0) return;
  session.lastStampMs = now;
  pushTireTracksAppend(
    tracksState,
    tracksDeps,
    stamp.addedMarks,
    session.lastStampMs,
    appendMarksBuf
  );
}
