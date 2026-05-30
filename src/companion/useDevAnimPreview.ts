import { useCallback, useEffect, useMemo, useState } from "react";
import { activeCharacter } from "./characters/active";
import {
  buildDevKeyBindings,
  resolveDevKeyAction,
} from "./characters/devKeys";
import { touchCompanionActivity } from "./engine/companionActivity";
import {
  useCompanionBehavior,
  type CompanionBehaviorApi,
} from "./engine/useCompanionBehavior";
import type { DisplaySize } from "./displaySize";
import { useDisplaySize } from "./useDisplaySize";

export type CompanionAppController = CompanionBehaviorApi & {
  replaySeq: number;
  idleResetSeq: number;
  showActionDebug: boolean;
  toggleActionDebug: () => void;
  onTransientEnd: () => void;
  spriteSize: DisplaySize;
  setSpriteSize: (px: DisplaySize) => void;
};

function dispatchDevAction(
  action: string,
  behavior: CompanionBehaviorApi
): void {
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
    case "shiftSmoke":
      behavior.beginShiftSmoke();
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
  }
}

/** Shared companion state + dev key triggers. */
export function useCompanionApp(): CompanionAppController {
  const paused = false;
  const [spriteSize, setSpriteSize] = useDisplaySize();
  const behavior = useCompanionBehavior(activeCharacter, paused, setSpriteSize);
  const devKeyBindings = useMemo(
    () => buildDevKeyBindings(activeCharacter),
    []
  );
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

      if (e.code === "KeyB") {
        e.preventDefault();
        touchCompanionActivity();
        behavior.setBlockMode(!behavior.blockMode);
        return;
      }

      const action = resolveDevKeyAction(
        devKeyBindings,
        e.code,
        e.shiftKey
      );
      if (!action) return;
      e.preventDefault();
      touchCompanionActivity();
      bumpReplay();
      dispatchDevAction(action, behavior);
    };

    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [behavior, bumpReplay, devKeyBindings, toggleActionDebug]);

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
