import { useCallback, useEffect, useRef, useState } from "react";
import {
  afkMs,
  idleStreakMs,
  markIdleSince,
  touchCompanionActivity,
} from "./companionActivity";
import type { CharacterPack } from "../characters/types";
import { useBlockMode } from "./useBlockMode";
import { MISSION_HOLD_MS } from "./timing";
import type { DisplaySize } from "../displaySize";
import { getCompanionTiming } from "./timing";
import type { CompanionAction, CompanionState } from "./types";

function randomBetween(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function nextDelay(range: { min: number; max: number }): number {
  return randomBetween(range.min, range.max);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function pickFacing(): "left" | "right" {
  return Math.random() > 0.5 ? "right" : "left";
}

export type CompanionBehaviorApi = {
  state: CompanionState;
  resetToIdle: (facing?: "left" | "right") => void;
  beginMission: (facing?: "left" | "right") => void;
  beginSmoke: (facing?: "left" | "right") => void;
  beginShiftSmoke: (facing?: "left" | "right") => void;
  beginPose: (facing?: "left" | "right") => void;
  beginWalk: (facing?: "left" | "right") => void;
  beginRun: (facing?: "left" | "right") => void;
  beginLook: (facing?: "left" | "right") => void;
  beginKunai: (facing?: "left" | "right") => void;
  /** Block-mode: aggressive disruption loop while a blocked site is open. */
  blockMode: boolean;
  setBlockMode: (on: boolean) => void;
};

export function useCompanionBehavior(
  pack: CharacterPack,
  paused: boolean,
  setSpriteSize?: (px: DisplaySize) => void
): CompanionBehaviorApi {
  const characterId = pack.id;

  const [state, setState] = useState<CompanionState>({
    id: characterId,
    action: "idle",
    facing: "right",
  });

  const sitIdleGateMs = useRef(0);
  const scheduleAfterIdleRef = useRef<() => void>(() => {});
  const facingRef = useRef(state.facing);
  const actionRef = useRef(state.action);
  facingRef.current = state.facing;
  actionRef.current = state.action;

  const waitUntilNotAction = useCallback(
    (target: CompanionAction, isCancelled: () => boolean): Promise<void> =>
      new Promise((resolve) => {
        if (isCancelled() || actionRef.current !== target) {
          resolve();
          return;
        }
        const id = setInterval(() => {
          if (isCancelled() || actionRef.current !== target) {
            clearInterval(id);
            resolve();
          }
        }, 32);
      }),
    []
  );

  const setIdle = useCallback((facing: "left" | "right") => {
    markIdleSince();
    const timing = getCompanionTiming();
    sitIdleGateMs.current = nextDelay(timing.sitIdleBefore);
    setState({ id: characterId, action: "idle", facing });
  }, [characterId]);

  const resetToIdle = useCallback(
    (facing?: "left" | "right") => {
      setIdle(facing ?? facingRef.current);
    },
    [setIdle]
  );

  const beginMission = useCallback((facing?: "left" | "right") => {
    touchCompanionActivity();
    setState({
      id: characterId,
      action: "mission",
      facing: facing ?? pickFacing(),
    });
  }, []);

  const beginSmoke = useCallback((facing?: "left" | "right") => {
    touchCompanionActivity();
    setState({
      id: characterId,
      action: "smoke",
      facing: facing ?? pickFacing(),
    });
  }, []);

  const beginShiftSmoke = useCallback((facing?: "left" | "right") => {
    touchCompanionActivity();
    setState({
      id: characterId,
      action: "shiftSmoke",
      facing: facing ?? pickFacing(),
    });
  }, []);

  const beginPose = useCallback((facing?: "left" | "right") => {
    touchCompanionActivity();
    setState({
      id: characterId,
      action: "pose",
      facing: facing ?? pickFacing(),
    });
  }, []);

  const beginWalk = useCallback((facing?: "left" | "right") => {
    touchCompanionActivity();
    setState({
      id: characterId,
      action: "walk",
      facing: facing ?? pickFacing(),
    });
  }, []);

  const beginRun = useCallback((facing?: "left" | "right") => {
    touchCompanionActivity();
    setState({
      id: characterId,
      action: "run",
      facing: facing ?? pickFacing(),
    });
  }, []);

  const beginLook = useCallback((facing?: "left" | "right") => {
    touchCompanionActivity();
    setState({
      id: characterId,
      action: "look",
      facing: facing ?? pickFacing(),
    });
  }, []);

  const beginKunai = useCallback((facing?: "left" | "right") => {
    touchCompanionActivity();
    setState({
      id: characterId,
      action: "kunai",
      facing: facing ?? pickFacing(),
    });
  }, []);

  const { blockMode, setBlockMode } = useBlockMode(
    pack,
    characterId,
    setState,
    setSpriteSize,
    {
      beginMission,
      beginShiftSmoke,
      beginPose,
      beginRun,
      beginLook,
      beginKunai,
      setIdle,
      waitUntilNotAction,
    }
  );

  useEffect(() => {
    markIdleSince();
    sitIdleGateMs.current = nextDelay(getCompanionTiming().sitIdleBefore);
  }, []);

  useEffect(() => {
    if (paused) return;
    if (blockMode) return; // block-mode disruption loop owns the schedule

    const timing = getCompanionTiming();
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const canPickSit = (): boolean =>
      idleStreakMs() >= sitIdleGateMs.current;

    /**
     * Returns the next action to run, or `null` to stay idle (re-schedule).
     * `idleStayChance` makes idle the dominant state by short-circuiting
     * before the action roll.
     */
    const pickPostIdleAction = (): CompanionAction | null => {
      if (Math.random() < timing.idleStayChance) return null;
      const roll = Math.random();
      if (roll < timing.smokeChance) return "mission";
      if (roll < timing.smokeChance + timing.sitChance) {
        if (!canPickSit()) return "walk";
        return afkMs() >= timing.sitAfkForMeditation.min &&
          Math.random() < timing.sitMeditationChance
          ? "shiftSmoke"
          : "smoke";
      }
      if (roll < timing.smokeChance + timing.sitChance + timing.peekChance) {
        return "pose";
      }
      if (
        roll <
        timing.smokeChance +
          timing.sitChance +
          timing.peekChance +
          timing.lookChance
      ) {
        return "look";
      }
      return "walk";
    };

    /**
     * Edge rescue: if the companion ended up pressed against a wall (e.g.
     * after kunai-spam clamp glitches, walk drift, or a manual drag close
     * to the screen edge), force a mission action regardless of the normal
     * roll. mission's teleport is now `awayFromCurrent: true` so it always
     * sends the sprite to the opposite side of the screen.
     *
     * Threshold: whichever is larger of `100px` or `8% of workArea width`,
     * so it scales sensibly across FHD/WQHD/4K.
     */
    const isWallStuck = async (): Promise<boolean> => {
      const bounds = await window.companion?.getBounds?.();
      if (!bounds) return false;
      const { window: win, workArea } = bounds;
      const leftSpace = win.x - workArea.x;
      const rightSpace =
        workArea.x + workArea.width - (win.x + win.width);
      const threshold = Math.max(100, Math.round(workArea.width * 0.08));
      const stuck = Math.min(leftSpace, rightSpace) < threshold;
      if (import.meta.env.DEV) {
        console.debug("[companion][edge-rescue]", {
          win,
          workArea,
          leftSpace,
          rightSpace,
          threshold,
          stuck,
        });
      }
      return stuck;
    };

    const scheduleAfterIdle = () => {
      timer = setTimeout(async () => {
        if (cancelled) return;
        if (await isWallStuck()) {
          if (cancelled) return;
          void runMission();
          return;
        }
        const next = pickPostIdleAction();
        if (next === null) {
          scheduleAfterIdle();
          return;
        }
        runAction(next);
      }, nextDelay(timing.idle));
    };
    scheduleAfterIdleRef.current = scheduleAfterIdle;

    const runWalk = async () => {
      const facing = pickFacing();
      beginWalk(facing);
      await waitUntilNotAction("walk", () => cancelled);
      if (cancelled) return;
      scheduleAfterIdle();
    };

    const runSitLike = async (action: "smoke" | "shiftSmoke") => {
      const facing = pickFacing();
      if (action === "shiftSmoke") {
        beginShiftSmoke(facing);
        await waitUntilNotAction("shiftSmoke", () => cancelled);
        if (cancelled) return;
        scheduleAfterIdle();
        return;
      }
      beginSmoke(facing);
      await waitUntilNotAction("smoke", () => cancelled);
      if (cancelled) return;
      scheduleAfterIdle();
    };

    const runPose = () => {
      const facing = pickFacing();
      beginPose(facing);
      timer = setTimeout(() => {
        if (cancelled) return;
        setIdle(facing);
        scheduleAfterIdle();
      }, nextDelay(timing.peek));
    };

    const runMission = async () => {
      const facing = pickFacing();
      beginMission(facing);
      await delay(MISSION_HOLD_MS);
      if (cancelled) return;
      setIdle(facing);
      scheduleAfterIdle();
    };

    const runLook = async () => {
      const facing = pickFacing();
      beginLook(facing);
      await waitUntilNotAction("look", () => cancelled);
      if (cancelled) return;
      scheduleAfterIdle();
    };

    const runAction = (action: CompanionAction) => {
      if (action === "walk") void runWalk();
      else if (action === "smoke" || action === "shiftSmoke") {
        void runSitLike(action);
      } else if (action === "pose") runPose();
      else if (action === "mission") void runMission();
      else if (action === "look") void runLook();
      else setIdle(pickFacing());
    };

    timer = setTimeout(async () => {
      if (cancelled) return;
      if (await isWallStuck()) {
        if (cancelled) return;
        void runMission();
        return;
      }
      const first = pickPostIdleAction();
      if (first === null) {
        scheduleAfterIdle();
        return;
      }
      runAction(first);
    }, nextDelay(timing.firstAction));

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    paused,
    blockMode,
    beginMission,
    beginSmoke,
    beginShiftSmoke,
    beginPose,
    beginWalk,
    beginLook,
    setIdle,
    waitUntilNotAction,
  ]);

  return {
    state,
    resetToIdle,
    beginMission,
    beginSmoke,
    beginShiftSmoke,
    beginPose,
    beginWalk,
    beginRun,
    beginLook,
    beginKunai,
    blockMode,
    setBlockMode,
  };
}
