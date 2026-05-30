/** Future companions (SAMURAI, ZEN, …) — types only for v1 */
export type { ActionKey as NinjaActionKey } from "../characters/ninja/actions";

import type { ActionKey as NinjaActionKey } from "../characters/ninja/actions";

export type CompanionId = "ninja";

export type CompanionAction = NinjaActionKey;

export interface CompanionState {
  id: CompanionId;
  action: CompanionAction;
  facing: "left" | "right";
}
