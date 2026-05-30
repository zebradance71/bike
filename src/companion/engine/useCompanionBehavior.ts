import { useCallback, useEffect, useRef, useState } from "react";
import {
  afkMs,
  idleStreakMs,
  markIdleSince,
  touchCompanionActivity,
} from "./companionActivity";
import { MISSION_HOLD_MS } from "../characters/active";
import type { CharacterPack } from "../characters/types";
import type { DisplaySize } from "../displaySize";
import {
  BLOCK_GIVE_UP_MS,
  BLOCK_OFF_LOOK_MS,
  BLOCK_PHASES,
  BLOCK_SPRITE_PX,
  NORMAL_SPRITE_PX,
  getCompanionTiming,
} from "./timing";
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

type BlockPickAction = "pose" | "look" | "run" | "kunai";

function pickWeighted(
  weights: ReadonlyArray<{ action: BlockPickAction; weight: number }>
): BlockPickAction {
  const total = weights.reduce((sum, w) => sum + w.weight, 0);
  let roll = Math.random() * total;
  for (const w of weights) {
    roll -= w.weight;
    if (roll < 0) return w.action;
  }
  return weights[weights.length - 1].action;
}

function currentBlockPhase(elapsedMs: number) {
  let chosen = BLOCK_PHASES[0];
  for (const phase of BLOCK_PHASES) {
    if (elapsedMs >= phase.startsAtMs) chosen = phase;
  }
  return chosen;
}

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

  const [blockMode, setBlockModeState] = useState(false);
  /** Mirror state for synchronous reads (dedupe in setBlockMode). */
  const blockModeRef = useRef(false);
  /**
   * Outstanding block-sequence task. We keep it as a ref so back-to-back
   * `setBlockMode(true/false)` calls cancel the previous sequence cleanly
   * without re-renders racing the start/stop ceremonies.
   */
  const blockTaskRef = useRef<{ cancel: () => void } | null>(null);

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
        console.debug("[ninja][edge-rescue]", {
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

  /**
   * Block-mode disruption loop.
   *
   * Triggered manually by the host (browser-tab watcher / dev key `B`).
   * - On `true`: enlarge sprite (96px), play opening mission + peek, then
   *   loop random gap → weighted action by elapsed-time phase.
   * - On `false`: gracefully exit with closing look → mission and shrink
   *   back to the normal sprite size.
   *
   * The autonomous `idle → walk/smoke/...` loop above bails out while
   * `blockMode === true`, so there is no double-scheduling.
   */
  const setBlockMode = useCallback(
    (on: boolean) => {
      // Dedupe at the renderer too: the main-side broadcastBlockMode
      // already filters no-op transitions, but a renderer-only dev key
      // toggle (`B`) bypasses main, and the host IPC could in theory
      // arrive before the previous broadcast was applied. Skipping when
      // the requested value matches the current state avoids re-running
      // the open/close ceremony from scratch.
      if (blockModeRef.current === on) return;
      blockModeRef.current = on;

      // Always cancel any in-flight block sequence first so a rapid
      // toggle (close-then-reopen) doesn't leave dangling timers.
      blockTaskRef.current?.cancel();
      blockTaskRef.current = null;

      let cancelled = false;
      blockTaskRef.current = {
        cancel: () => {
          cancelled = true;
        },
      };

      if (on) {
        setBlockModeState(true);

        const runOpen = async () => {
          // 1. Enlarge sprite (64 -> 96) and play the entry mission.
          setSpriteSize?.(BLOCK_SPRITE_PX);
          beginMission(pickFacing());
          await delay(MISSION_HOLD_MS + 200);
          if (cancelled) return;

          // 2. Initial peek as the first warning.
          beginPose(pickFacing());
          await waitUntilNotAction("pose", () => cancelled);
          if (cancelled) return;

          // 3. Disruption loop driven by elapsed-time phase weights.
          const blockStart = Date.now();
          while (!cancelled) {
            // 10-minute give-up: switch to permanent meditation (Shift+S)
            // and exit the disruption loop. The action remains until
            // `setBlockMode(false)` cancels this task.
            if (Date.now() - blockStart >= BLOCK_GIVE_UP_MS) {
              if (import.meta.env.DEV) {
                console.debug("[ninja][block][give-up]", {
                  elapsedMs: Date.now() - blockStart,
                });
              }
              beginShiftSmoke(pickFacing());
              // Park here until the host toggles blockMode off; the shift-
              // smoke action loops indefinitely on its own state machine,
              // so we just need to keep this task alive without
              // overwriting it.
              while (!cancelled) await delay(1_000);
              break;
            }

            const phase = currentBlockPhase(Date.now() - blockStart);
            await delay(nextDelay(phase.gap));
            if (cancelled) break;

            const action = pickWeighted(phase.weights);
            const facing = pickFacing();

            // K (kunai) always throws toward the screen center, but the
            // sprite only renders/animates a left-facing throw and the main
            // process only expands the window leftward for the FX overflow.
            // If the ninja is currently in the *left* half of the screen,
            // a leftward kunai would visually fly *away* from the blocked
            // content. In that case we hot-swap the action to a mission
            // teleport so the next loop iteration fires from the right half
            // (mission's `awayFromCurrent: true` reliably crosses the
            // midline).
            if (action === "kunai") {
              const bounds = await window.companion?.getBounds?.();
              if (bounds) {
                const centerX =
                  bounds.workArea.x + bounds.workArea.width / 2;
                const winCenterX =
                  bounds.window.x + bounds.window.width / 2;
                if (winCenterX < centerX) {
                  if (import.meta.env.DEV) {
                    console.debug("[ninja][block][kunai-reposition]", {
                      winCenterX,
                      centerX,
                    });
                  }
                  beginMission(facing);
                  await delay(MISSION_HOLD_MS + 200);
                  if (cancelled) break;
                  continue;
                }
              }
            }

            switch (action) {
              case "pose":
                beginPose(facing);
                await waitUntilNotAction("pose", () => cancelled);
                break;
              case "look":
                beginLook(facing);
                await waitUntilNotAction("look", () => cancelled);
                break;
              case "run":
                beginRun(facing);
                await waitUntilNotAction("run", () => cancelled);
                break;
              case "kunai":
                beginKunai(facing);
                await waitUntilNotAction("kunai", () => cancelled);
                break;
            }
          }
        };
        void runOpen();
        return;
      }

      // off: closing ceremony, then hand control back to the autonomous loop.
      setBlockModeState(false);

      const runClose = async () => {
        // Stop whatever loop action is mid-flight by force-overwriting
        // the state to a calm look send-off.
        beginLook(pickFacing());
        await delay(BLOCK_OFF_LOOK_MS);
        if (cancelled) return;

        // Shrink back (96 -> 64) and play the closing mission.
        setSpriteSize?.(NORMAL_SPRITE_PX);
        beginMission(pickFacing());
        await delay(MISSION_HOLD_MS + 200);
        if (cancelled) return;

        setIdle(pickFacing());
      };
      void runClose();
    },
    [
      beginKunai,
      beginLook,
      beginMission,
      beginPose,
      beginRun,
      setIdle,
      setSpriteSize,
      waitUntilNotAction,
    ]
  );

  // Cancel any outstanding block task on unmount so we don't leak timers.
  useEffect(
    () => () => {
      blockTaskRef.current?.cancel();
      blockTaskRef.current = null;
    },
    []
  );

  /**
   * Bridge: host (browser extension via main's localhost HTTP server, or
   * any future menu / protocol handler) → renderer. The main process
   * pushes a boolean over the `companion-block-mode` channel; we hand it
   * straight to `setBlockMode`.
   */
  useEffect(() => {
    const off = window.companion?.onBlockMode?.((on) => {
      if (import.meta.env.DEV) {
        console.debug("[ninja][block][ipc]", { on });
      }
      setBlockMode(on);
    });
    return () => off?.();
  }, [setBlockMode]);

  /**
   * Echo blockMode back to main so the HTTP `GET /block` endpoint can
   * report the canonical state even when toggling came from dev key `B`.
   */
  useEffect(() => {
    void window.companion?.reportBlockMode?.(blockMode);
  }, [blockMode]);

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
