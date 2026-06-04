import type { CharacterPack, UseLayersHook } from "../types";
import { actionAssets, REQUIRED_STEMS } from "./actions";
import { CharacterPackRenderer } from "./CharacterPackRenderer";
import { useCharacterLayers } from "./useLayers";

const useLayers: UseLayersHook = (state, renderWidthPx, options) =>
  useCharacterLayers(state, renderWidthPx, {
    idleResetSeq: options?.idleResetSeq ?? 0,
    replaySeq: options?.replaySeq ?? 0,
    onTransientEnd: options?.onTransientEnd,
    idleDevBeat: options?.idleDevBeat,
    idleDevBeatSeq: options?.idleDevBeatSeq ?? 0,
  });

/** Renamed to `<id>Pack` by init-new-pack. */
export const characterPack: CharacterPack = {
  id: "{{CHARACTER_ID}}",
  displayName: "{{DISPLAY_NAME}}",
  requiredStems: REQUIRED_STEMS,
  actions: actionAssets,
  useLayers,
  Renderer: CharacterPackRenderer,
  trayIconStem: "block-idle",
  blockChaseCursor: true,
  spriteAnchorBottomLeft: true,
};
