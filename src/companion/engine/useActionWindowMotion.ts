import type { CompanionState } from "./types";

/** Window slide / peek motion disabled during action-system reset. */
export function useActionWindowMotion(
  _state: CompanionState,
  _onPeekEdge: (edge: "left" | "right") => void
): void {
  /* teleport, smoke window expand, peek slide — re-enable after renderer is stable */
}
