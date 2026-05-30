export type { ActionKey } from "../characters/active";

export type CompanionId = string;

/** Runtime action id — narrowed per pack in actions.ts, string at engine layer. */
export type CompanionAction = string;

export interface CompanionState {
  id: CompanionId;
  action: CompanionAction;
  facing: "left" | "right";
}
