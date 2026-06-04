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
import type { IdleDevBeat } from "./characters/types";

export type CompanionAppController = CompanionBehaviorApi & {
  replaySeq: number;
  idleResetSeq: number;
  idleDevBeat: IdleDevBeat | undefined;
  idleDevBeatSeq: number;
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
  const [idleDevBeat, setIdleDevBeat] = useState<IdleDevBeat | undefined>(
    undefined
  );
  const [idleDevBeatSeq, setIdleDevBeatSeq] = useState(0);
  const [showActionDebug, setShowActionDebug] = useState(false);

  const triggerIdleDevBeat = useCallback((beat: IdleDevBeat) => {
    behavior.resetToIdle();
    setIdleDevBeat(beat);
    setIdleDevBeatSeq((n) => n + 1);
  }, [behavior.resetToIdle]);

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

      if (
        activeCharacter.id === "bike" &&
        !e.altKey &&
        !e.ctrlKey &&
        !e.metaKey
      ) {
        if (e.code === "KeyV" && !e.shiftKey) {
          e.preventDefault();
          touchCompanionActivity();
          triggerIdleDevBeat("vibrate");
          return;
        }
        if (e.code === "KeyE" && !e.shiftKey) {
          e.preventDefault();
          touchCompanionActivity();
          triggerIdleDevBeat("exhaust");
          return;
        }
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
  }, [behavior, bumpReplay, devKeyBindings, toggleActionDebug, triggerIdleDevBeat]);

  return {
    ...behavior,
    replaySeq,
    idleResetSeq,
    idleDevBeat,
    idleDevBeatSeq,
    showActionDebug,
    toggleActionDebug,
    onTransientEnd,
    spriteSize,
    setSpriteSize,
  };
}
