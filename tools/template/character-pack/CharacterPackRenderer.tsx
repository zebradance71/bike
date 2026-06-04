import type { RendererProps } from "../types";
import { CompanionSpriteRenderer } from "../../render/CompanionSpriteRenderer";
import { BLOCK_CHASE_ACTION } from "./blockCursorChase";
import { useCharacterTireTracks } from "./tireTracks/useCharacterTireTracks";

export function CharacterPackRenderer({
  state,
  spriteSize,
  draggable,
  ...rest
}: RendererProps) {
  const chaseActive = state.action === BLOCK_CHASE_ACTION;
  useCharacterTireTracks(chaseActive);

  return (
    <CompanionSpriteRenderer
      state={state}
      spriteSize={spriteSize}
      draggable={draggable}
      {...rest}
    />
  );
}
