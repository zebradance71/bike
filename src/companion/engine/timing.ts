/** Mission teleport hold (smoke-only + smoke-big + arrive). Pack-agnostic default. */
export const MISSION_HOLD_MS = 420;

export type TimingRange = { min: number; max: number };

export type CompanionTiming = {
  firstAction: TimingRange;
  walk: TimingRange;
  idle: TimingRange;
  smoke: TimingRange;
  peek: TimingRange;
  /** Min idle streak before sit can be chosen */
  sitIdleBefore: TimingRange;
  sitHoldNormal: TimingRange;
  sitHoldMeditation: TimingRange;
  /** AFK duration before meditation sit is eligible */
  sitAfkForMeditation: TimingRange;
  /**
   * Per post-idle decision, probability of staying idle (no transition).
   * Hits compound geometrically: e.g. 0.75 ≒ average idle dwell × 4.
   */
  idleStayChance: number;
  sitChance: number;
  smokeChance: number;
  peekChance: number;
  /** LOOK (chira-mi): light alert glance triggered between idle bursts. */
  lookChance: number;
  /** Among eligible sits, chance of meditation vs normal */
  sitMeditationChance: number;
};

// DEV: idleStayChance 低めで動きを多めに観察できるようにしてある。
// 1 ロール内訳（idleStayChance 通過後の roll、合計 1.0）:
//   smokeChance(=mission): 0.20  -> 全体 12%
//   sitChance(=smoke):     0.20  -> 全体 12%
//   peekChance(=pose):     0.00  -> 0%（販売仕様で凍結）
//   lookChance:            0.10  -> 全体 6%
//   walk(残り):            0.50  -> 全体 30%
const DEV_TIMING: CompanionTiming = {
  firstAction: { min: 2_000, max: 4_000 },
  walk: { min: 2_000, max: 4_000 },
  idle: { min: 6_000, max: 12_000 },
  smoke: { min: MISSION_HOLD_MS, max: MISSION_HOLD_MS },
  peek: { min: 3_000, max: 3_800 },
  sitIdleBefore: { min: 8_000, max: 20_000 },
  sitHoldNormal: { min: 3_000, max: 8_000 },
  sitHoldMeditation: { min: 5_000, max: 15_000 },
  sitAfkForMeditation: { min: 45_000, max: 90_000 },
  idleStayChance: 0.4,
  sitChance: 0.2,
  smokeChance: 0.2,
  peekChance: 0,
  lookChance: 0.1,
  sitMeditationChance: 0.1,
};

// PROD 目標分布: idle 75% / walk 14% / mission 5% / smoke 4% / look 2% / pose 0%
// idleStayChance 通過後の roll（合計 1.0、25% 帯の内訳）:
//   smokeChance(=mission): 0.20  -> 全体 5%
//   sitChance(=smoke):     0.16  -> 全体 4%
//   peekChance(=pose):     0.00  -> 0%
//   lookChance:            0.08  -> 全体 2%
//   walk(残り):            0.56  -> 全体 14%
const PROD_TIMING: CompanionTiming = {
  firstAction: { min: 8_000, max: 15_000 },
  walk: { min: 3_000, max: 6_000 },
  idle: { min: 25_000, max: 60_000 },
  smoke: { min: MISSION_HOLD_MS, max: MISSION_HOLD_MS },
  peek: { min: 3_100, max: 4_000 },
  sitIdleBefore: { min: 30_000, max: 90_000 },
  sitHoldNormal: { min: 3_000, max: 8_000 },
  sitHoldMeditation: { min: 5_000, max: 15_000 },
  sitAfkForMeditation: { min: 180_000, max: 300_000 },
  idleStayChance: 0.75,
  sitChance: 0.16,
  smokeChance: 0.2,
  peekChance: 0,
  lookChance: 0.08,
  sitMeditationChance: 0.1,
};

export function getCompanionTiming(): CompanionTiming {
  return import.meta.env.DEV ? DEV_TIMING : PROD_TIMING;
}

/**
 * Block-mode timing: when a blocked URL (X / YouTube / etc.) is open the
 * companion enters an aggressive 3-phase loop until the page is closed.
 *
 *   Phase 1 (warn):   0–30s      P / L / R     loose interval
 *   Phase 2 (annoy):  30–90s     R / K / L     tight interval
 *   Phase 3 (rage):   90s+       K / K / R     short interval
 *
 * Each phase has its own random interval and action weights. Switching is
 * driven by elapsed-time-in-blockMode (not action count), so rapid manual
 * close/reopen still feels fresh.
 */
export type BlockPhase = "warn" | "annoy" | "rage";
export type BlockPhaseDef = {
  /** Lower bound (ms) of elapsed time at which this phase starts. */
  startsAtMs: number;
  /** Random gap range between consecutive disruption actions. */
  gap: TimingRange;
  /**
   * Weighted action pool. Picked uniformly by weight; keys reuse existing
   * CompanionAction values so no new action types are needed.
   */
  weights: ReadonlyArray<{ action: "pose" | "look" | "run" | "kunai"; weight: number }>;
};

export const BLOCK_PHASES: ReadonlyArray<BlockPhaseDef> = [
  {
    // Warn: L (look) is reserved for the closing send-off, so the warn
    // phase is P / R only. Keeps L's "I'm onto you" beat unique to the
    // off-ceremony.
    startsAtMs: 0,
    gap: { min: 8_000, max: 15_000 },
    weights: [
      { action: "pose", weight: 2 },
      { action: "run", weight: 1 },
    ],
  },
  {
    startsAtMs: 30_000,
    gap: { min: 5_000, max: 10_000 },
    weights: [
      { action: "run", weight: 2 },
      { action: "kunai", weight: 2 },
      { action: "look", weight: 1 },
    ],
  },
  {
    startsAtMs: 90_000,
    gap: { min: 3_000, max: 7_000 },
    weights: [
      { action: "kunai", weight: 3 },
      { action: "run", weight: 1 },
    ],
  },
];

/** Sprite size (px) used during block mode (vs default 64). */
export const BLOCK_SPRITE_PX = 96;
/** Default sprite size restored on block-off. */
export const NORMAL_SPRITE_PX = 64;
/** Hold time for the closing "look" send-off before the final mission. */
export const BLOCK_OFF_LOOK_MS = 1_400;

/**
 * After this many ms of continuous block-mode the companion gives up
 * disrupting and switches to a permanent meditation pose (Shift+S).
 * The disruption loop exits and the only way back is `setBlockMode(false)`.
 */
export const BLOCK_GIVE_UP_MS = 10 * 60_000; // 10 minutes

function randomBetween(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** Total hold for smoke (S) enter + loop before returning to idle. */
export function pickSmokeHoldMs(): number {
  const { sitHoldNormal } = getCompanionTiming();
  return randomBetween(sitHoldNormal.min, sitHoldNormal.max);
}

/** Total hold for shiftSmoke (enter + loop) before returning to idle. */
export function pickShiftSmokeHoldMs(): number {
  const { sitHoldMeditation } = getCompanionTiming();
  return randomBetween(sitHoldMeditation.min, sitHoldMeditation.max);
}
