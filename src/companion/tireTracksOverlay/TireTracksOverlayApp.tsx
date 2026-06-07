import { useEffect, useRef } from "react";

import {
  TIRE_TRACK_FADE_MS,
  TIRE_TRACK_MAX_AGE_MS,
  TIRE_TRACK_OVERLAY_MAX_DPR,
} from "./constants";
import { drawTrailAppend, drawTrailFull } from "./drawTrail";
import type { TireTracksFramePayload, TireTrackMarkPayload } from "./types";

type Layout = { w: number; h: number; dpr: number };

/** While chasing, skip expensive full redraws (opacity ≈1 on fresh marks). */
const CHASE_FADE_HOLD_MS = 280;

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

function pruneMarksInPlace(marks: TireTrackMarkPayload[], now: number): number {
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

function fadeIntervalMs(markCount: number, chasing: boolean): number {
  if (chasing) {
    if (markCount > 800) return 200;
    if (markCount > 400) return 150;
    return 100;
  }
  if (markCount > 800) return 66;
  if (markCount > 400) return 50;
  return TIRE_TRACK_FADE_MS;
}

export function TireTracksOverlayApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const layoutRef = useRef<Layout>({ w: 0, h: 0, dpr: 1 });
  const marksRef = useRef<TireTrackMarkPayload[]>([]);
  const workAreaRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const animRef = useRef(0);
  const lastFadePaintMsRef = useRef(0);
  const lastAppendMsRef = useRef(0);
  const needsFullRedrawRef = useRef(true);

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
      return { ctx, w, h, dpr };
    };

    const paintFull = (now: number) => {
      const prepared = ensureCtx();
      if (!prepared) return;
      const { ctx, w, h } = prepared;
      const removed = pruneMarksInPlace(marksRef.current, now);
      ctx.clearRect(0, 0, w, h);
      drawTrailFull(ctx, marksRef.current, now);
      needsFullRedrawRef.current = false;
      if (removed > 0 && marksRef.current.length === 0) {
        stopAnim();
      }
    };

    const paintAppend = (firstMarkIndex: number, now: number) => {
      const prepared = ensureCtx();
      if (!prepared) return;
      const { ctx } = prepared;
      drawTrailAppend(ctx, marksRef.current, firstMarkIndex, now);
    };

    const stopAnim = () => {
      if (!animRef.current) return;
      cancelAnimationFrame(animRef.current);
      animRef.current = 0;
    };

    const ensureAnim = () => {
      if (animRef.current) return;
      const tick = () => {
        animRef.current = 0;
        const now = Date.now();
        const markCount = marksRef.current.length;
        if (markCount === 0) return;

        const chasing = now - lastAppendMsRef.current < CHASE_FADE_HOLD_MS;
        const fadeMs = fadeIntervalMs(markCount, chasing);

        if (now - lastFadePaintMsRef.current >= fadeMs) {
          lastFadePaintMsRef.current = now;
          paintFull(now);
        }

        animRef.current = requestAnimationFrame(tick);
      };
      animRef.current = requestAnimationFrame(tick);
    };

    const onFrame = (payload: TireTracksFramePayload) => {
      workAreaRef.current = payload.workArea;
      const now = Date.now();
      const prevLen = marksRef.current.length;

      if (payload.fullRedraw && payload.marks) {
        marksRef.current = payload.marks;
        needsFullRedrawRef.current = true;
      } else if (payload.append?.length) {
        marksRef.current.push(...payload.append);
        lastAppendMsRef.current = now;
      }

      if (marksRef.current.length === 0) {
        stopAnim();
        const prepared = ensureCtx();
        if (prepared) {
          prepared.ctx.clearRect(0, 0, prepared.w, prepared.h);
        }
        needsFullRedrawRef.current = true;
        return;
      }

      const removed = pruneMarksInPlace(marksRef.current, now);
      if (removed > 0) {
        needsFullRedrawRef.current = true;
      }

      if (needsFullRedrawRef.current || payload.fullRedraw) {
        paintFull(now);
      } else if (payload.append?.length) {
        paintAppend(prevLen, now);
      }

      ensureAnim();
    };

    const onClear = () => {
      marksRef.current = [];
      needsFullRedrawRef.current = true;
      lastAppendMsRef.current = 0;
      stopAnim();
      const prepared = ensureCtx();
      if (prepared) {
        prepared.ctx.clearRect(0, 0, prepared.w, prepared.h);
      }
    };

    const offFrame = window.tireTracks?.onFrame(onFrame) ?? (() => {});
    const offClear = window.tireTracks?.onClear(onClear) ?? (() => {});
    return () => {
      offFrame();
      offClear();
      stopAnim();
      marksRef.current = [];
      ctxRef.current = null;
    };
  }, []);

  return (
    <div className="tracks-stage" aria-hidden>
      <canvas ref={canvasRef} id="tracks-canvas" className="tracks-canvas" />
    </div>
  );
}
