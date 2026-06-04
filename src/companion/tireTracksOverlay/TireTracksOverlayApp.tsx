import { useEffect, useRef } from "react";

import { TIRE_TRACK_MAX_AGE_MS, TIRE_TRACK_OVERLAY_MAX_DPR } from "./constants";
import { drawColorTrail, drawDrivingAppend } from "./drawTrail";
import type { TireTracksFramePayload, TireTrackMarkPayload } from "./types";

const PAINT_FADE_MS = 52;
const DRIVING_GRACE_MS = 380;

type Layout = { w: number; h: number; dpr: number };

function overlayDpr(): number {
  return Math.min(TIRE_TRACK_OVERLAY_MAX_DPR, window.devicePixelRatio || 1);
}

function syncCanvasSize(
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
  dpr: number,
  layout: Layout
): void {
  if (layout.w === w && layout.h === h && layout.dpr === dpr) return;
  layout.w = w;
  layout.h = h;
  layout.dpr = dpr;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
}

function pruneMarksInPlace(
  marks: TireTrackMarkPayload[],
  now: number
): number {
  const cutoff = now - TIRE_TRACK_MAX_AGE_MS;
  let write = 0;
  for (let read = 0; read < marks.length; read++) {
    const m = marks[read]!;
    if (m.bornAt >= cutoff) {
      if (write !== read) marks[write] = m;
      write += 1;
    }
  }
  const removed = marks.length - write;
  marks.length = write;
  return removed;
}

function isDriving(now: number, lastStampMs: number): boolean {
  return lastStampMs > 0 && now - lastStampMs < DRIVING_GRACE_MS;
}

function nowMs(): number {
  return Date.now();
}

export function TireTracksOverlayApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const layoutRef = useRef<Layout>({ w: 0, h: 0, dpr: 1 });
  const marksRef = useRef<TireTrackMarkPayload[]>([]);
  const workAreaRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const fadeAnimRef = useRef(0);
  const lastFadePaintRef = useRef(0);
  const lastStampMsRef = useRef(0);
  const drawnCountRef = useRef(0);
  const pendingFullRef = useRef<TireTrackMarkPayload[] | null>(null);
  const pendingAppendRef = useRef<TireTrackMarkPayload[]>([]);
  const drivingWatchRef = useRef(0);
  const drivePaintRafRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ensureCtx = () => {
      const w = workAreaRef.current.width;
      const h = workAreaRef.current.height;
      if (w <= 0 || h <= 0) return null;

      const dpr = overlayDpr();
      syncCanvasSize(canvas, w, h, dpr, layoutRef.current);

      if (!ctxRef.current) {
        ctxRef.current =
          canvas.getContext("2d", {
            alpha: true,
            desynchronized: true,
          }) ?? null;
      }
      const ctx = ctxRef.current;
      if (!ctx) return null;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { ctx, w, h };
    };

    const paintFull = (now: number) => {
      const prepared = ensureCtx();
      if (!prepared) return;
      const { ctx, w, h } = prepared;
      const lastStampMs = lastStampMsRef.current;
      const removed = pruneMarksInPlace(marksRef.current, now);
      if (removed > 0) drawnCountRef.current = 0;

      ctx.clearRect(0, 0, w, h);
      drawColorTrail(ctx, marksRef.current, now, lastStampMs, {
        fromIndex: 0,
        driving: false,
      });
      drawnCountRef.current = marksRef.current.length;
    };

    const paintDrivingAppend = (now: number, fromIndex: number) => {
      const prepared = ensureCtx();
      if (!prepared) return false;
      const marks = marksRef.current;
      const removed = pruneMarksInPlace(marks, now);
      if (removed > 0) {
        paintFull(now);
        return true;
      }

      const { ctx } = prepared;
      drawDrivingAppend(
        ctx,
        marks,
        fromIndex,
        now,
        lastStampMsRef.current
      );
      drawnCountRef.current = marks.length;
      return true;
    };

    const stopDrivingWatch = () => {
      if (!drivingWatchRef.current) return;
      cancelAnimationFrame(drivingWatchRef.current);
      drivingWatchRef.current = 0;
    };

    const ensureDrivingEndWatch = () => {
      if (drivingWatchRef.current) return;
      const tick = () => {
        drivingWatchRef.current = 0;
        const now = nowMs();
        if (marksRef.current.length === 0) return;
        if (isDriving(now, lastStampMsRef.current)) {
          drivingWatchRef.current = requestAnimationFrame(tick);
          return;
        }
        paintFull(now);
        ensureFadeLoop();
      };
      drivingWatchRef.current = requestAnimationFrame(tick);
    };

    const stopFadeLoop = () => {
      if (!fadeAnimRef.current) return;
      cancelAnimationFrame(fadeAnimRef.current);
      fadeAnimRef.current = 0;
    };

    const ensureFadeLoop = () => {
      if (fadeAnimRef.current) return;
      const tick = () => {
        fadeAnimRef.current = 0;
        const now = nowMs();
        const n = marksRef.current.length;
        if (n === 0) {
          stopFadeLoop();
          const prepared = ensureCtx();
          if (prepared) {
            prepared.ctx.clearRect(0, 0, prepared.w, prepared.h);
          }
          drawnCountRef.current = 0;
          return;
        }
        if (isDriving(now, lastStampMsRef.current)) {
          stopFadeLoop();
          return;
        }
        if (now - lastFadePaintRef.current < PAINT_FADE_MS) {
          fadeAnimRef.current = requestAnimationFrame(tick);
          return;
        }
        lastFadePaintRef.current = now;
        paintFull(now);
        fadeAnimRef.current = requestAnimationFrame(tick);
      };
      fadeAnimRef.current = requestAnimationFrame(tick);
    };

    const touchStampActivity = () => {
      lastStampMsRef.current = nowMs();
    };

    const mergePending = (): {
      hadFull: boolean;
      appendCount: number;
      drawFrom: number;
    } => {
      const hadFull = pendingFullRef.current != null;
      const appendCount = pendingAppendRef.current.length;
      const drawFrom = drawnCountRef.current;

      const full = pendingFullRef.current;
      if (full) {
        marksRef.current = full;
        touchStampActivity();
        pendingFullRef.current = null;
        drawnCountRef.current = 0;
      }
      const append = pendingAppendRef.current;
      if (append.length > 0) {
        marksRef.current.push(...append);
        touchStampActivity();
        pendingAppendRef.current = [];
      }

      return { hadFull, appendCount, drawFrom };
    };

    const applyPaint = (now: number, hadFull: boolean, appendCount: number, drawFrom: number) => {
      if (marksRef.current.length === 0) return;

      const driving = isDriving(now, lastStampMsRef.current);
      if (hadFull || drawFrom === 0) {
        paintFull(now);
      } else if (appendCount > 0 && driving) {
        paintDrivingAppend(now, drawFrom);
      } else if (!driving) {
        paintFull(now);
        ensureFadeLoop();
        return;
      }

      if (!driving) ensureFadeLoop();
      else {
        stopFadeLoop();
        ensureDrivingEndWatch();
      }
    };

    const scheduleDrivePaint = () => {
      if (drivePaintRafRef.current) return;
      drivePaintRafRef.current = requestAnimationFrame(() => {
        drivePaintRafRef.current = 0;
        const now = nowMs();
        const { hadFull, appendCount, drawFrom } = mergePending();
        applyPaint(now, hadFull, appendCount, drawFrom);
      });
    };

    const flushFrameSync = () => {
      const now = nowMs();
      const { hadFull, appendCount, drawFrom } = mergePending();
      applyPaint(now, hadFull, appendCount, drawFrom);
    };

    const scheduleDraw = (payload: TireTracksFramePayload) => {
      workAreaRef.current = payload.workArea;
      if (payload.fullRedraw && payload.marks) {
        pendingFullRef.current = payload.marks;
        if (drivePaintRafRef.current) {
          cancelAnimationFrame(drivePaintRafRef.current);
          drivePaintRafRef.current = 0;
        }
        flushFrameSync();
        return;
      }
      if (payload.append?.length) {
        pendingAppendRef.current.push(...payload.append);
      }
      scheduleDrivePaint();
    };

    const hardClear = () => {
      pendingFullRef.current = null;
      pendingAppendRef.current = [];
      marksRef.current = [];
      drawnCountRef.current = 0;
      lastFadePaintRef.current = 0;
      lastStampMsRef.current = 0;
      stopFadeLoop();
      stopDrivingWatch();
      if (drivePaintRafRef.current) {
        cancelAnimationFrame(drivePaintRafRef.current);
        drivePaintRafRef.current = 0;
      }

      const prepared = ensureCtx();
      if (!prepared) return;
      prepared.ctx.clearRect(0, 0, prepared.w, prepared.h);
    };

    const offFrame = window.tireTracks?.onFrame(scheduleDraw) ?? (() => {});
    const offClear = window.tireTracks?.onClear(hardClear) ?? (() => {});
    return () => {
      offFrame();
      offClear();
      stopFadeLoop();
      stopDrivingWatch();
      if (drivePaintRafRef.current) {
        cancelAnimationFrame(drivePaintRafRef.current);
        drivePaintRafRef.current = 0;
      }
      marksRef.current = [];
      ctxRef.current = null;
    };
  }, []);

  return (
    <div className="tracks-stage" aria-hidden>
      <canvas
        ref={canvasRef}
        id="tracks-canvas"
        className="tracks-canvas"
      />
    </div>
  );
}
