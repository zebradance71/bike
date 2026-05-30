import type { CharacterPack } from "./types";

export type DevKeyBinding = {
  /** Pack action id (e.g. "walk", "shiftSmoke"). */
  action: string;
  /** KeyboardEvent.code (e.g. "KeyW"). */
  code: string;
  /** When true, KeyboardEvent.shiftKey must also be pressed. */
  requireShift: boolean;
};

/**
 * Build dev-key bindings from a pack's `actions[*].devKey` fields.
 * Example: devKey "M" → { code: "KeyM", requireShift: false, action: "mission" }
 *          devKey "Shift+S" → { code: "KeyS", requireShift: true, action: "shiftSmoke" }
 */
export function buildDevKeyBindings(pack: CharacterPack): DevKeyBinding[] {
  const out: DevKeyBinding[] = [];
  for (const [actionKey, def] of Object.entries(pack.actions)) {
    if (!def.devKey) continue;
    const raw = def.devKey.trim();
    const requireShift = /^shift\+/i.test(raw);
    const letter = (requireShift ? raw.slice(6) : raw).trim();
    if (!letter) continue;
    out.push({
      action: actionKey,
      code: `Key${letter.toUpperCase()}`,
      requireShift,
    });
  }
  return out;
}

/** Resolve a keyboard event to a pack action id, or null if unbound. */
export function resolveDevKeyAction(
  bindings: readonly DevKeyBinding[],
  code: string,
  shiftKey: boolean
): string | null {
  const match = bindings.find(
    (b) => b.code === code && b.requireShift === shiftKey
  );
  return match?.action ?? null;
}
