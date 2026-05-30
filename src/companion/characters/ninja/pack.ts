import type { CharacterPack, UseLayersHook } from "../types";
import { actionAssets, REQUIRED_STEMS, KUNAI_FLY_EXTRA_PX_MULT } from "./actions";
import { ActionDebugPanel } from "./debug/ActionDebugPanel";
import { useNinjaLayers } from "./useLayers";

/**
 * Adapt the ninja-specific `useNinjaLayers` (which has required
 * idleResetSeq/replaySeq) to the pack-level `UseLayersHook` shape
 * (which makes them optional with a sensible default).
 */
const useLayers: UseLayersHook = (state, renderWidthPx, options) =>
  useNinjaLayers(state, renderWidthPx, {
    idleResetSeq: options?.idleResetSeq ?? 0,
    replaySeq: options?.replaySeq ?? 0,
    onTransientEnd: options?.onTransientEnd,
  });

/**
 * The complete Ninja character pack. Wired into the build through
 * `src/companion/characters/active.ts`. To ship a different character,
 * fork the repo, drop a sibling pack folder (`characters/<id>/`), and
 * re-point `active.ts`.
 */
export const ninjaPack: CharacterPack = {
  id: "ninja",
  displayName: "Ninja",
  requiredStems: REQUIRED_STEMS,
  actions: actionAssets,
  useLayers,
  trayIconStem: "idle",
  devDebugPanel: ActionDebugPanel,
  viewportWidthExtra: (action, renderWidthPx) =>
    action === "kunai" ? Math.round(renderWidthPx * KUNAI_FLY_EXTRA_PX_MULT) : 0,
};
