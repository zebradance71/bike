import { useMemo } from "react";

import type { CompanionState } from "../../engine/types";
import { actionAssets, getActionDef, resolveStemUrl, type ActionKey } from "./actions";

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
};

export function useCharacterLayers(
  state: CompanionState,
  renderWidthPx: number,
  _options: Options = {}
): CharacterRenderLayers {
  const action: ActionKey =
    state.action in actionAssets ? (state.action as ActionKey) : "idle";
  const def = getActionDef(action);
  const bodyStem = "stem" in def.body ? def.body.stem : "idle";

  return useMemo(
    () => ({
      action,
      body: resolveStemUrl(bodyStem, renderWidthPx),
      fxBack: null,
      fxFront: null,
      mirror: def.mirrorOnFacing !== false && state.facing === "left",
      phase: "idle",
      frameIndex: 0,
    }),
    [action, bodyStem, def.mirrorOnFacing, renderWidthPx, state.facing]
  );
}
