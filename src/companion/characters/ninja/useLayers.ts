import { useEffect, useMemo, useState } from "react";

import type { CompanionState } from "../../engine/types";
import {
  enterLoopEnterDelayMs,
  enterLoopFrameDelayMs,
  getActionDef,
  isAnimatedBody,
  isEnterLoopBody,
  MISSION_TELEPORT_MS,
  MISSION_TELEPORT_STEMS,
  RUN_HOLD_MS,
  RUN_SCAN_CHANCE,
  RUN_SCAN_GAP_MS,
  RUN_SCAN_HOLD_MS,
  RUN_SCAN_PRE_PAUSE_MS,
  RUN_SLIDE_PX,
  RUN_SLIDE_TICK_MS,
  WALK_HOLD_MS,
  WALK_SLIDE_PX,
  WALK_SLIDE_TICK_MS,
  KUNAI_WINDUP_MS,
  KUNAI_ZANSHIN_MS,
  KUNAI_FLY_FRAME_MS,
  KUNAI_FLY_STEMS,
  KUNAI_FLY_EXTRA_PX_MULT,
  resolveBodyUrl,
  resolveFxBackUrl,
  resolveFxFrontUrl,
  resolveStemUrl,
  resolveStemUrlOptional,
  type ActionKey,
} from "./actions";

export type NinjaRenderLayers = {
  action: ActionKey;
  body: string | null;
  fxBack: string | null;
  fxFront: string | null;
  mirror: boolean;
  phase: string;
  frameIndex: number;
};

function isEnterLoopAction(action: ActionKey): boolean {
  return isEnterLoopBody(getActionDef(action).body);
}

export function useNinjaLayers(
  state: CompanionState,
  renderWidthPx: number,
  options: {
    idleResetSeq: number;
    replaySeq: number;
    onTransientEnd?: () => void;
  }
): NinjaRenderLayers {
  const { action, facing } = state;
  const { idleResetSeq, replaySeq, onTransientEnd } = options;

  const [frameIndex, setFrameIndex] = useState(0);
  const [missionPhase, setMissionPhase] = useState<
    "start" | "smokeOnly" | "smokeBig" | "arrive"
  >("start");
  const [enterLoopPhase, setEnterLoopPhase] = useState<"enter" | "loop">("enter");
  const [enterLoopIndex, setEnterLoopIndex] = useState(0);
  const [runPhase, setRunPhase] = useState<"run-c" | "run-b" | "run-d">("run-c");
  const [runDirection, setRunDirection] = useState<1 | -1>(1);
  const [walkDirection, setWalkDirection] = useState<1 | -1>(1);
  const [kunaiPhase, setKunaiPhase] = useState<"a" | "b" | "c">("a");
  const [kunaiFlyIndex, setKunaiFlyIndex] = useState(0);

  const def = getActionDef(action as ActionKey);
  const mirror =
    action === "run"
      ? runDirection === -1
      : action === "walk"
        ? walkDirection === -1
        : action === "kunai"
          ? false
          : def.mirrorOnFacing !== false && action !== "pose" && facing === "left";

  useEffect(() => {
    setFrameIndex(0);
    setMissionPhase("start");
    setEnterLoopPhase("enter");
    setEnterLoopIndex(0);
    setRunPhase("run-c");
    setKunaiPhase("a");
    setKunaiFlyIndex(0);
  }, [action, replaySeq, idleResetSeq]);

  useEffect(() => {
    const body = getActionDef(action as ActionKey).body;
    if (!isAnimatedBody(body)) return;
    const id = window.setInterval(() => {
      setFrameIndex((i) => (i + 1) % body.stems.length);
    }, body.frameMs);
    return () => window.clearInterval(id);
  }, [action, replaySeq]);

  useEffect(() => {
    if (action !== "pose") return;
    void window.companion?.teleport?.({
      random: true,
      marginX: 56,
      phase: `pose-${enterLoopPhase}-${enterLoopIndex}`,
    });
  }, [action, replaySeq, enterLoopPhase, enterLoopIndex]);

  useEffect(() => {
    if (action !== "kunai") return;
    let cancelled = false;
    const wait = (ms: number): Promise<void> =>
      new Promise((resolve) => window.setTimeout(resolve, ms));
    const extraPx = Math.round(renderWidthPx * KUNAI_FLY_EXTRA_PX_MULT);
    if (import.meta.env.DEV) {
      console.debug("[companion][kunai-extra]", {
        renderWidthPx,
        KUNAI_FLY_EXTRA_PX_MULT,
        extraPx,
      });
    }
    const timeline = async () => {
      await window.companion?.setKunaiThrowMode?.(true, extraPx);
      setKunaiPhase("a");
      await wait(KUNAI_WINDUP_MS);
      if (cancelled) return;
      setKunaiPhase("b");
      for (let i = 0; i < KUNAI_FLY_STEMS.length; i++) {
        setKunaiFlyIndex(i);
        await wait(KUNAI_FLY_FRAME_MS);
        if (cancelled) return;
      }
      setKunaiPhase("c");
      await wait(KUNAI_ZANSHIN_MS);
      if (cancelled) return;
      await window.companion?.setKunaiThrowMode?.(false);
      onTransientEnd?.();
    };
    void timeline();
    return () => {
      cancelled = true;
      void window.companion?.setKunaiThrowMode?.(false);
    };
  }, [action, replaySeq, renderWidthPx, onTransientEnd]);

  useEffect(() => {
    if (action !== "walk") return;
    let cancelled = false;

    const wait = (ms: number): Promise<void> =>
      new Promise((resolve) => window.setTimeout(resolve, ms));

    const pickWalkDirection = async (): Promise<1 | -1> => {
      const bounds = await window.companion?.getBounds?.();
      if (!bounds) return facing === "left" ? -1 : 1;
      const { window: win, workArea } = bounds;
      const leftSpace = win.x - workArea.x;
      const rightSpace = workArea.x + workArea.width - (win.x + win.width);
      return rightSpace >= leftSpace ? 1 : -1;
    };

    const runWalk = async () => {
      let direction = await pickWalkDirection();
      if (cancelled) return;
      setWalkDirection(direction);

      // Wedge rescue: if the window is sitting flush against (or somehow
      // outside) a workArea edge, the chosen direction may end up pointing
      // INTO the wall when bounds was momentarily stale. Re-derive direction
      // from a fresh bounds snapshot and force-rescue if the chosen-side
      // space is essentially zero so we can never get stuck on an edge.
      const startBounds = await window.companion?.getBounds?.();
      if (startBounds) {
        const ls = startBounds.window.x - startBounds.workArea.x;
        const rs =
          startBounds.workArea.x +
          startBounds.workArea.width -
          (startBounds.window.x + startBounds.window.width);
        const chosen = direction === 1 ? rs : ls;
        const other = direction === 1 ? ls : rs;
        if (chosen < WALK_SLIDE_PX && other > chosen) {
          direction = (-direction) as 1 | -1;
          setWalkDirection(direction);
        }
      }

      // Resolution-aware target travel: walk roughly half of the available
      // space on the chosen side. Keeps the visual ratio consistent across
      // FHD/WQHD/4K. Hard cap at 12s so 4K runs don't drag forever.
      const availableSpace = startBounds
        ? direction === 1
          ? startBounds.workArea.x +
            startBounds.workArea.width -
            (startBounds.window.x + startBounds.window.width)
          : startBounds.window.x - startBounds.workArea.x
        : 0;
      const targetTravelPx = Math.max(
        180,
        Math.round(availableSpace * 0.5)
      );
      const ticks = Math.ceil(targetTravelPx / WALK_SLIDE_PX);
      const maxMs = Math.min(
        Math.max(ticks * WALK_SLIDE_TICK_MS, WALK_HOLD_MS),
        12_000
      );

      const start = Date.now();
      let lastX = startBounds?.window.x ?? Number.NaN;
      let stuckTicks = 0;
      while (!cancelled && Date.now() - start < maxMs) {
        const remaining = maxMs - (Date.now() - start);
        const tickMs = Math.min(WALK_SLIDE_TICK_MS, Math.max(80, remaining));
        await window.companion?.slideX?.(direction * WALK_SLIDE_PX, tickMs);
        if (cancelled) return;
        const post = await window.companion?.getBounds?.();
        if (post) {
          // Wall-stuck detection: bail if x didn't change for 2 ticks.
          if (Number.isFinite(lastX) && post.window.x === lastX) {
            stuckTicks += 1;
            if (stuckTicks >= 2) break;
          } else {
            stuckTicks = 0;
          }
          lastX = post.window.x;

          const leftSpace = post.window.x - post.workArea.x;
          const rightSpace =
            post.workArea.x + post.workArea.width - (post.window.x + post.window.width);
          const minSpace = direction === 1 ? rightSpace : leftSpace;
          if (minSpace <= WALK_SLIDE_PX / 2) break;
        }
      }

      if (!cancelled) {
        await wait(80);
        if (!cancelled) onTransientEnd?.();
      }
    };

    void runWalk();

    return () => {
      cancelled = true;
    };
  }, [action, replaySeq, facing, onTransientEnd]);

  useEffect(() => {
    if (action !== "run") return;
    setRunPhase("run-c");
    let cancelled = false;

    const wait = (ms: number): Promise<void> =>
      new Promise((resolve) => window.setTimeout(resolve, ms));

    const rand = (min: number, max: number): number =>
      min + Math.floor(Math.random() * (max - min));

    const pickDirectionFromBounds = async (): Promise<1 | -1> => {
      const bounds = await window.companion?.getBounds?.();
      if (!bounds) return facing === "left" ? -1 : 1;
      const { window: win, workArea } = bounds;
      const leftSpace = win.x - workArea.x;
      const rightSpace = workArea.x + workArea.width - (win.x + win.width);
      return rightSpace >= leftSpace ? 1 : -1;
    };

    const runScout = async () => {
      const direction = await pickDirectionFromBounds();
      if (cancelled) return;
      setRunDirection(direction);
      const start = Date.now();
      let nextScanAt = start + rand(RUN_SCAN_GAP_MS.min, RUN_SCAN_GAP_MS.max);

      while (!cancelled && Date.now() - start < RUN_HOLD_MS) {
        const now = Date.now();

        if (now >= nextScanAt) {
          if (Math.random() < RUN_SCAN_CHANCE) {
            await wait(RUN_SCAN_PRE_PAUSE_MS);
            if (cancelled) return;
            const side = Math.random() < 0.5 ? "run-b" : "run-d";
            setRunPhase(side);
            await wait(rand(RUN_SCAN_HOLD_MS.min, RUN_SCAN_HOLD_MS.max));
            if (cancelled) return;
            setRunPhase("run-c");
          }
          nextScanAt =
            Date.now() + rand(RUN_SCAN_GAP_MS.min, RUN_SCAN_GAP_MS.max);
          continue;
        }

        const remaining = RUN_HOLD_MS - (Date.now() - start);
        const tickMs = Math.min(RUN_SLIDE_TICK_MS, Math.max(80, remaining));
        await window.companion?.slideX?.(direction * RUN_SLIDE_PX, tickMs);
        if (cancelled) return;

        const post = await window.companion?.getBounds?.();
        if (post) {
          const leftSpace = post.window.x - post.workArea.x;
          const rightSpace =
            post.workArea.x + post.workArea.width - (post.window.x + post.window.width);
          const minSpace = direction === 1 ? rightSpace : leftSpace;
          if (minSpace <= RUN_SLIDE_PX / 2) break;
        }
      }

      if (!cancelled) onTransientEnd?.();
    };

    void runScout();

    return () => {
      cancelled = true;
    };
  }, [action, replaySeq, facing, onTransientEnd]);

  useEffect(() => {
    if (action !== "mission") return;
    let cancelled = false;

    const wait = (ms: number): Promise<void> =>
      new Promise((resolve) => window.setTimeout(resolve, ms));

    const runMissionTeleport = async () => {
      setMissionPhase("smokeOnly");
      await wait(MISSION_TELEPORT_MS.smokeOnly);
      if (cancelled) return;

      await window.companion.teleport?.({
        random: true,
        // mission ALWAYS jumps to the opposite side of the screen so that
        // edge-rescue (auto-mission when the companion is wall-stuck) is
        // guaranteed to leave the wall.
        awayFromCurrent: true,
        marginX: 56,
        phase: "mission-teleport",
      });
      if (cancelled) return;

      setMissionPhase("smokeBig");
      await wait(MISSION_TELEPORT_MS.smokeBig);
      if (cancelled) return;

      setMissionPhase("arrive");
      await wait(MISSION_TELEPORT_MS.missionArrive);
      if (cancelled) return;
      onTransientEnd?.();
    };

    void runMissionTeleport();

    return () => {
      cancelled = true;
    };
  }, [action, replaySeq, onTransientEnd]);

  useEffect(() => {
    if (!isEnterLoopAction(action as ActionKey)) return;
    const bodyDef = getActionDef(action as ActionKey).body;
    if (!isEnterLoopBody(bodyDef)) return;

    let cancelled = false;
    let timer = 0;

    const runLoopOnce = (index: number) => {
      if (cancelled) return;
      if (index >= bodyDef.loop.length) {
        onTransientEnd?.();
        return;
      }
      setEnterLoopPhase("loop");
      setEnterLoopIndex(index);
      timer = window.setTimeout(() => {
        runLoopOnce(index + 1);
      }, enterLoopFrameDelayMs(bodyDef));
    };

    const runLoopRepeat = () => {
      const scheduleLoopTick = () => {
        timer = window.setTimeout(() => {
          if (cancelled) return;
          setEnterLoopIndex((i) => (i + 1) % bodyDef.loop.length);
          scheduleLoopTick();
        }, enterLoopFrameDelayMs(bodyDef));
      };
      setEnterLoopPhase("loop");
      setEnterLoopIndex(0);
      scheduleLoopTick();
    };

    timer = window.setTimeout(() => {
      if (cancelled) return;
      if (bodyDef.loopOnce) runLoopOnce(0);
      else runLoopRepeat();
    }, enterLoopEnterDelayMs(bodyDef));

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [action, replaySeq, onTransientEnd]);

  const bodyFrameIndex = frameIndex;

  const defaultBody = resolveBodyUrl(action as ActionKey, renderWidthPx, bodyFrameIndex);
  const body = useMemo(() => {
    if (isEnterLoopBody(def.body)) {
      return resolveBodyUrl(action as ActionKey, renderWidthPx, enterLoopIndex, {
        enterLoopPhase: enterLoopPhase,
      });
    }
    if (action === "run") {
      return (
        resolveStemUrlOptional({ stem: runPhase }, renderWidthPx) ?? defaultBody
      );
    }
    if (action === "kunai") {
      return (
        resolveStemUrlOptional({ stem: `kunai-${kunaiPhase}` }, renderWidthPx) ??
        defaultBody
      );
    }
    if (action !== "mission") return defaultBody;
    const stem =
      missionPhase === "smokeOnly"
        ? MISSION_TELEPORT_STEMS.smokeOnly
        : missionPhase === "smokeBig"
          ? MISSION_TELEPORT_STEMS.smokeBig
          : missionPhase === "arrive"
            ? MISSION_TELEPORT_STEMS.missionArrive
            : MISSION_TELEPORT_STEMS.missionStart;

    return (
      resolveStemUrlOptional({ stem }, renderWidthPx) ??
      resolveStemUrlOptional({ stem: MISSION_TELEPORT_STEMS.missionRun }, renderWidthPx) ??
      defaultBody
    );
  }, [
    action,
    def.body,
    defaultBody,
    enterLoopIndex,
    enterLoopPhase,
    missionPhase,
    runPhase,
    kunaiPhase,
    renderWidthPx,
  ]);

  const resolvedBody =
    body ?? (action === "idle" ? resolveStemUrl({ stem: "idle" }, renderWidthPx) : null);

  const fxBack = resolveFxBackUrl(action as ActionKey, renderWidthPx);

  const fxFront =
    action === "kunai" && kunaiPhase === "b"
      ? resolveStemUrlOptional(
          {
            stem:
              KUNAI_FLY_STEMS[
                Math.min(kunaiFlyIndex, KUNAI_FLY_STEMS.length - 1)
              ] ?? KUNAI_FLY_STEMS[0]!,
          },
          renderWidthPx
        )
      : resolveFxFrontUrl(action as ActionKey, renderWidthPx);

  const enterLoopActive = isEnterLoopBody(def.body);

  return {
    action: action as ActionKey,
    body: resolvedBody,
    fxBack,
    fxFront,
    mirror,
    phase:
      action === "mission"
        ? `${action}-${missionPhase}`
        : action === "run"
          ? `run-${runPhase}`
          : action === "kunai"
            ? `kunai-${kunaiPhase}`
            : enterLoopActive
              ? `${action}-${enterLoopPhase}-${enterLoopIndex}`
              : `${action}-${bodyFrameIndex + 1}`,
    frameIndex: bodyFrameIndex,
  };
}
