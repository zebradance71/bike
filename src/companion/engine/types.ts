import type { ActionKey } from "../characters/active";

export type { ActionKey as NinjaActionKey } from "../characters/active";

export type CompanionId = string;

export type CompanionAction = ActionKey;

export interface CompanionState {
  id: CompanionId;
  action: CompanionAction;
  facing: "left" | "right";
}
