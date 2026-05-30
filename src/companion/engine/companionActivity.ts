/** Tracks idle streak and last user interaction (companion window). */

let lastInteractionAt = Date.now();
let idleSinceAt = Date.now();

export function touchCompanionActivity(): void {
  lastInteractionAt = Date.now();
}

export function markIdleSince(now = Date.now()): void {
  idleSinceAt = now;
}

export function afkMs(now = Date.now()): number {
  return now - lastInteractionAt;
}

export function idleStreakMs(now = Date.now()): number {
  return now - idleSinceAt;
}
