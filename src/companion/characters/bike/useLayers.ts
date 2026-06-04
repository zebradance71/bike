import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CompanionState } from "../../engine/types";
import type { IdleDevBeat } from "../types";
import {
  actionAssets,
  EXHAUST_FRAME_MS,
  EXHAUST_STEMS,
  IDLE_BASE_STEM,
  isAnimatedBody,
  VIBRATE_FRAME_MS,
  VIBRATE_STEMS,
  exhaustGapMs,
  getActionDef,
  resolveBodyUrl,
  resolveStemUrl,
  vibrateGapMs,
  type ActionKey,
} from "./actions";
import { BLOCK_CHASE_ACTION } from "./blockCursorChase";
import { useBlockChaseFacing } from "./blockChaseFacingStore";

export type CharacterRenderLayers = {
  action: ActionKey;
  body: string | null;
  fxBack: string | null;
  fxFront: string | null;
  mirror: boolean;
  phase: string;
  frameIndex: number;
};

type Options = {
  idleResetSeq?: number;
  replaySeq?: number;
  onTransientEnd?: () => void;
  idleDevBeat?: IdleDevBeat;
  idleDevBeatSeq?: number;
};

function nextDelay(minMs: number, maxMs: number): number {
  return minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
}

export function useCharacterLayers(
  state: CompanionState,
  renderWidthPx: number,
  options: Options = {}
): CharacterRenderLayers {
  const {
    idleResetSeq = 0,
    idleDevBeat,
    idleDevBeatSeq = 0,
  } = options;

  const action: ActionKey =
    state.action in actionAssets ? (state.action as ActionKey) : "idle";
  const def = getActionDef(action);
  const blockChaseFacing = useBlockChaseFacing();
  const mirrorFacing =
    action === BLOCK_CHASE_ACTION ? blockChaseFacing : state.facing;

  const actionRef = useRef(action);
  actionRef.current = action;

  const loopGenRef = useRef(0);
  const timersRef = useRef<number[]>([]);

  const [idleStem, setIdleStem] = useState(IDLE_BASE_STEM);
  const [idlePhase, setIdlePhase] = useState("base");
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    setFrameIndex(0);
  }, [action, idleResetSeq]);

  useEffect(() => {
    const body = getActionDef(action).body;
    if (!isAnimatedBody(body)) return;
    const id = window.setInterval(() => {
      setFrameIndex((i) => (i + 1) % body.stems.length);
    }, body.frameMs);
    return () => window.clearInterval(id);
  }, [action]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  }, []);

  const invalidateLoop = useCallback(() => {
    loopGenRef.current += 1;
    clearTimers();
  }, [clearTimers]);

  const wait = useCallback((ms: number, gen: number) => {
    return new Promise<void>((resolve) => {
      const id = window.setTimeout(() => {
        if (loopGenRef.current !== gen) return;
        resolve();
      }, ms);
      timersRef.current.push(id);
    });
  }, []);

  const playSequence = useCallback(
    async (stems: readonly string[], frameMs: number, phase: string, gen: number) => {
      for (let i = 0; i < stems.length; i++) {
        if (loopGenRef.current !== gen || actionRef.current !== "idle") return;
        setIdlePhase(phase);
        setIdleStem(stems[i]!);
        setFrameIndex(i);
        await wait(frameMs, gen);
      }
      if (loopGenRef.current !== gen || actionRef.current !== "idle") return;
      setIdleStem(IDLE_BASE_STEM);
      setIdlePhase("base");
      setFrameIndex(0);
    },
    [wait]
  );

  useEffect(() => {
    invalidateLoop();
    setIdleStem(IDLE_BASE_STEM);
    setIdlePhase("base");
    setFrameIndex(0);
  }, [action, idleResetSeq, invalidateLoop]);

  useEffect(() => {
    if (action !== "idle" || !idleDevBeat || idleDevBeatSeq === 0) return;

    const gen = ++loopGenRef.current;
    clearTimers();

    const stems = idleDevBeat === "vibrate" ? VIBRATE_STEMS : EXHAUST_STEMS;
    const frameMs =
      idleDevBeat === "vibrate" ? VIBRATE_FRAME_MS : EXHAUST_FRAME_MS;

    void playSequence(stems, frameMs, idleDevBeat, gen);

    return () => {
      if (loopGenRef.current === gen) {
        loopGenRef.current += 1;
      }
      clearTimers();
    };
  }, [action, idleDevBeat, idleDevBeatSeq, clearTimers, playSequence]);

  useEffect(() => {
    if (action !== "idle") return;

    const gen = ++loopGenRef.current;

    const loop = async () => {
      while (loopGenRef.current === gen && actionRef.current === "idle") {
        await wait(nextDelay(...vibrateGapMs()), gen);
        if (loopGenRef.current !== gen || actionRef.current !== "idle") break;

        if (Math.random() < 0.32) {
          await wait(nextDelay(...exhaustGapMs()), gen);
          if (loopGenRef.current !== gen || actionRef.current !== "idle") break;
          await playSequence(EXHAUST_STEMS, EXHAUST_FRAME_MS, "exhaust", gen);
        } else {
          await playSequence(VIBRATE_STEMS, VIBRATE_FRAME_MS, "vibrate", gen);
        }
      }
    };

    void loop();

    return () => {
      if (loopGenRef.current === gen) {
        loopGenRef.current += 1;
      }
      clearTimers();
    };
  }, [action, idleResetSeq, clearTimers, playSequence, wait]);

  const bodyUrl = useMemo(() => {
    if (action === "idle") {
      return resolveStemUrl(idleStem, renderWidthPx);
    }
    if (action in actionAssets) {
      return resolveBodyUrl(action, renderWidthPx, frameIndex);
    }
    return resolveStemUrl(IDLE_BASE_STEM, renderWidthPx);
  }, [action, frameIndex, idleStem, renderWidthPx]);

  return useMemo(
    () => ({
      action,
      body: bodyUrl,
      fxBack: null,
      fxFront: null,
      mirror: def.mirrorOnFacing !== false && mirrorFacing === "left",
      phase: action === "idle" ? idlePhase : action,
      frameIndex,
    }),
    [action, bodyUrl, def.mirrorOnFacing, frameIndex, idlePhase, mirrorFacing]
  );
}
