import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { CharacterPack } from "../characters/types";
import {
  endBlockCursorChase,
  runBlockCursorChase,
} from "../characters/active";
import type { DisplaySize } from "../displaySize";
import {
  BLOCK_GIVE_UP_MS,
  BLOCK_OFF_LOOK_MS,
  BLOCK_PHASES,
  BLOCK_SPRITE_PX,
  MISSION_HOLD_MS,
  NORMAL_SPRITE_PX,
} from "./timing";
import type { CompanionState } from "./types";

type BlockPickAction = "pose" | "look" | "run" | "kunai";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function pickFacing(): "left" | "right" {
  return Math.random() > 0.5 ? "right" : "left";
}

function randomBetween(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function nextDelay(range: { min: number; max: number }): number {
  return randomBetween(range.min, range.max);
}

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

export type BlockModeCeremony = {
  beginMission: (facing?: "left" | "right") => void;
  beginShiftSmoke: (facing?: "left" | "right") => void;
  beginPose: (facing?: "left" | "right") => void;
  beginRun: (facing?: "left" | "right") => void;
  beginLook: (facing?: "left" | "right") => void;
  beginKunai: (facing?: "left" | "right") => void;
  setIdle: (facing: "left" | "right") => void;
  waitUntilNotAction: (
    target: string,
    isCancelled: () => boolean
  ) => Promise<void>;
};

export function useBlockMode(
  pack: CharacterPack,
  characterId: string,
  setState: Dispatch<SetStateAction<CompanionState>>,
  setSpriteSize: ((px: DisplaySize) => void) | undefined,
  ceremony: BlockModeCeremony
): { blockMode: boolean; setBlockMode: (on: boolean) => void } {
  const [blockMode, setBlockModeState] = useState(false);
  const blockModeRef = useRef(false);
  const blockTaskRef = useRef<{ cancel: () => void } | null>(null);

  const {
    beginMission,
    beginShiftSmoke,
    beginPose,
    beginRun,
    beginLook,
    beginKunai,
    setIdle,
    waitUntilNotAction,
  } = ceremony;

  const setBlockMode = useCallback(
    (on: boolean) => {
      if (blockModeRef.current === on) return;
      blockModeRef.current = on;

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

        if (pack.blockChaseCursor) {
          void runBlockCursorChase({
            characterId,
            setState,
            setSpriteSize,
            setIdle,
            isCancelled: () => cancelled,
          });
          return;
        }

        void (async () => {
          setSpriteSize?.(BLOCK_SPRITE_PX);
          beginMission(pickFacing());
          await delay(MISSION_HOLD_MS + 200);
          if (cancelled) return;

          beginPose(pickFacing());
          await waitUntilNotAction("pose", () => cancelled);
          if (cancelled) return;

          const blockStart = Date.now();
          while (!cancelled) {
            if (Date.now() - blockStart >= BLOCK_GIVE_UP_MS) {
              beginShiftSmoke(pickFacing());
              while (!cancelled) await delay(1_000);
              break;
            }

            const phase = currentBlockPhase(Date.now() - blockStart);
            await delay(nextDelay(phase.gap));
            if (cancelled) break;

            const action = pickWeighted(phase.weights);
            const facing = pickFacing();

            if (action === "kunai") {
              const bounds = await window.companion?.getBounds?.();
              if (bounds) {
                const centerX =
                  bounds.workArea.x + bounds.workArea.width / 2;
                const winCenterX =
                  bounds.window.x + bounds.window.width / 2;
                if (winCenterX < centerX) {
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
        })();
        return;
      }

      setBlockModeState(false);

      if (pack.blockChaseCursor) {
        void endBlockCursorChase({
          characterId,
          setState,
          setSpriteSize,
          setIdle,
          isCancelled: () => cancelled,
        });
        return;
      }

      void (async () => {
        beginLook(pickFacing());
        await delay(BLOCK_OFF_LOOK_MS);
        if (cancelled) return;

        setSpriteSize?.(NORMAL_SPRITE_PX);
        beginMission(pickFacing());
        await delay(MISSION_HOLD_MS + 200);
        if (cancelled) return;

        setIdle(pickFacing());
      })();
    },
    [
      beginKunai,
      beginLook,
      beginMission,
      beginPose,
      beginRun,
      beginShiftSmoke,
      characterId,
      pack.blockChaseCursor,
      setIdle,
      setSpriteSize,
      setState,
      waitUntilNotAction,
    ]
  );

  useEffect(
    () => () => {
      blockTaskRef.current?.cancel();
      blockTaskRef.current = null;
    },
    []
  );

  useEffect(() => {
    const off = window.companion?.onBlockMode?.((on) => {
      if (import.meta.env.DEV) {
        console.debug("[companion][block][ipc]", { on });
      }
      setBlockMode(on);
    });
    return () => off?.();
  }, [setBlockMode]);

  useEffect(() => {
    void window.companion?.reportBlockMode?.(blockMode);
  }, [blockMode]);

  return { blockMode, setBlockMode };
}
