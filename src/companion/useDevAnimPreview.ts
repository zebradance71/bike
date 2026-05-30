import { useCallback, useEffect, useState } from "react";
import { touchCompanionActivity } from "./engine/companionActivity";
import {
  useCompanionBehavior,
  type CompanionBehaviorApi,
} from "./engine/useCompanionBehavior";
import type { ActionKey } from "./characters/ninja/actions";
import type { DisplaySize } from "./displaySize";
import { useDisplaySize } from "./useDisplaySize";

const DEV_KEY_ACTION: Partial<Record<string, ActionKey>> = {
  KeyW: "walk",
  KeyP: "pose",
  KeyS: "smoke",
  KeyM: "mission",
  KeyR: "run",
  KeyL: "look",
  KeyK: "kunai",
};

export type CompanionAppController = CompanionBehaviorApi & {
  replaySeq: number;
  idleResetSeq: number;
  showActionDebug: boolean;
  toggleActionDebug: () => void;
  onTransientEnd: () => void;
  spriteSize: DisplaySize;
  setSpriteSize: (px: DisplaySize) => void;
};

/** Shared companion state + dev key triggers. */
export function useCompanionApp(): CompanionAppController {
  // Autonomous loop is always on. Dev keys (W/M/L/K/S) interrupt the current
  // action immediately and the autonomous scheduler resumes after the next
  // idle window. Previously this was `import.meta.env.DEV` which silently
  // disabled idle->action picking + wall-stuck rescue during dev, making
  // it impossible to verify production behavior without making a release.
  const paused = false;
  const [spriteSize, setSpriteSize] = useDisplaySize();
  const behavior = useCompanionBehavior(paused, setSpriteSize);
  const [replaySeq, setReplaySeq] = useState(0);
  const [idleResetSeq, setIdleResetSeq] = useState(0);
  const [showActionDebug, setShowActionDebug] = useState(false);

  const bumpReplay = useCallback(() => {
    setReplaySeq((n) => n + 1);
  }, []);

  const onTransientEnd = useCallback(() => {
    behavior.resetToIdle();
    setIdleResetSeq((n) => n + 1);
  }, [behavior.resetToIdle]);

  const toggleActionDebug = useCallback(() => {
    setShowActionDebug((v) => !v);
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyD" && e.altKey) {
        e.preventDefault();
        toggleActionDebug();
        return;
      }

      // Dev shortcut: toggle block-mode disruption loop. Lets us verify the
      // open/close ceremonies and phase-transitions without a real browser
      // tab event from the host.
      if (e.code === "KeyB") {
        e.preventDefault();
        touchCompanionActivity();
        behavior.setBlockMode(!behavior.blockMode);
        return;
      }

      const action = DEV_KEY_ACTION[e.code];
      if (!action) return;
      e.preventDefault();
      touchCompanionActivity();
      bumpReplay();

      if (e.code === "KeyS" && e.shiftKey) {
        behavior.beginShiftSmoke();
        return;
      }

      switch (action) {
        case "walk":
          behavior.beginWalk();
          break;
        case "pose":
          behavior.beginPose();
          break;
        case "smoke":
          behavior.beginSmoke();
          break;
        case "mission":
          behavior.beginMission();
          break;
        case "run":
          behavior.beginRun();
          break;
        case "look":
          behavior.beginLook();
          break;
        case "kunai":
          behavior.beginKunai();
          break;
        default:
          behavior.resetToIdle();
          setIdleResetSeq((n) => n + 1);
      }
    };

    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [behavior, bumpReplay, toggleActionDebug]);

  return {
    ...behavior,
    replaySeq,
    idleResetSeq,
    showActionDebug,
    toggleActionDebug,
    onTransientEnd,
    spriteSize,
    setSpriteSize,
  };
}
