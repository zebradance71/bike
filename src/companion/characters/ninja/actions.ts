import { frameTierSrc, frameTierSrcOptional } from "./frames/tierCatalog";

/** Asset reference by stem (resolved via tier catalog at render time). */
export type AssetStemRef = { readonly stem: string };

export type AnimatedBodyRef = {
  readonly stems: readonly string[];
  readonly frameMs: number;
};

/** enter once, then loop frames (smoke / shiftSmoke). */
export type EnterLoopBodyRef = {
  readonly enter: readonly string[];
  readonly enterFrameMs: number;
  /** When set, enter duration is enterFrameMs ± this (ms). */
  readonly enterFrameMsJitter?: number;
  readonly loop: readonly string[];
  readonly loopFrameMs: number;
  readonly loopFrameMsJitter: number;
  /** true: play loop frames once in order then end (S). false: alternate forever (Shift+S). */
  readonly loopOnce?: boolean;
};

export type ActionAssetDef = {
  readonly label: string;
  readonly devKey?: string;
  readonly body: AssetStemRef | AnimatedBodyRef | EnterLoopBodyRef;
  readonly fxBack?: AssetStemRef | null;
  readonly fxFront?: AssetStemRef | null;
  /** Mirror body when facing left (default true). */
  readonly mirrorOnFacing?: boolean;
};

export const actionAssets = {
  idle: {
    label: "待機",
    body: { stem: "idle" },
  },
  mission: {
    label: "M（teleport）",
    devKey: "M",
    body: { stem: "idle" },
    fxBack: null,
  },
  smoke: {
    label: "S（座る）",
    devKey: "S",
    body: {
      enter: ["smoke-sit-enter"],
      enterFrameMs: 425,
      enterFrameMsJitter: 75,
      loop: ["smoke-sit-rest-a", "smoke-sit-rest-b"],
      loopFrameMs: 1150,
      loopFrameMsJitter: 250,
      loopOnce: true,
    },
  },
  shiftSmoke: {
    label: "Shift+S（瞑想）",
    devKey: "Shift+S",
    body: {
      enter: ["shift-smoke-enter"],
      enterFrameMs: 420,
      loop: ["shift-smoke-rest-a", "shift-smoke-rest-b"],
      loopFrameMs: 1200,
      loopFrameMsJitter: 200,
      loopOnce: true,
    },
  },
  pose: {
    label: "P（覗き）",
    devKey: "P",
    body: {
      enter: ["peek-1"],
      enterFrameMs: 900,
      loop: ["peek-2", "peek-3"],
      loopFrameMs: 1100,
      loopFrameMsJitter: 150,
      loopOnce: true,
    },
    mirrorOnFacing: false,
  },
  walk: {
    label: "W（移動）",
    devKey: "W",
    body: {
      stems: ["walk-1", "walk-2", "walk-3", "walk-4"],
      frameMs: 185,
    },
    mirrorOnFacing: true,
  },
  run: {
    label: "R（索敵移動）",
    devKey: "R",
    body: { stem: "run-c" },
    mirrorOnFacing: true,
  },
  look: {
    label: "L（チラ見警戒）",
    devKey: "L",
    body: {
      enter: ["look-2"],
      enterFrameMs: 700,
      enterFrameMsJitter: 200,
      loop: ["look-3", "look-2"],
      loopFrameMs: 700,
      loopFrameMsJitter: 200,
      loopOnce: true,
    },
    mirrorOnFacing: true,
  },
  kunai: {
    label: "K（クナイ投擲）",
    devKey: "K",
    body: { stem: "kunai-a" },
    fxFront: null,
    // 左投擲固定。useLayers の mirror 計算で kunai は常に false。
    mirrorOnFacing: false,
  },
} as const satisfies Record<string, ActionAssetDef>;

export type ActionKey = keyof typeof actionAssets;

export const ACTION_KEYS = Object.keys(actionAssets) as ActionKey[];

export function isActionKey(value: string): value is ActionKey {
  return value in actionAssets;
}

export function getActionDef(action: ActionKey): ActionAssetDef {
  return actionAssets[action];
}

export function isAnimatedBody(
  body: AssetStemRef | AnimatedBodyRef | EnterLoopBodyRef
): body is AnimatedBodyRef {
  return "stems" in body;
}

export function isEnterLoopBody(
  body: AssetStemRef | AnimatedBodyRef | EnterLoopBodyRef
): body is EnterLoopBodyRef {
  return "enter" in body && "loop" in body;
}

export const SMOKE_SIT_ENTER_MS = 425;
export const SMOKE_SIT_ENTER_JITTER_MS = 75;
export const SMOKE_SIT_LOOP_MS = 1150;
export const SMOKE_SIT_LOOP_JITTER_MS = 250;

export const SHIFT_SMOKE_ENTER_MS = 420;
export const SHIFT_SMOKE_LOOP_MS = 1200;
export const SHIFT_SMOKE_LOOP_JITTER_MS = 200;

export function enterLoopEnterDelayMs(body: EnterLoopBodyRef): number {
  const j = body.enterFrameMsJitter ?? 0;
  if (j === 0) return body.enterFrameMs;
  const delta = Math.floor(Math.random() * (2 * j + 1)) - j;
  return body.enterFrameMs + delta;
}

export function enterLoopFrameDelayMs(body: EnterLoopBodyRef): number {
  const j = body.loopFrameMsJitter;
  const delta = Math.floor(Math.random() * (2 * j + 1)) - j;
  return body.loopFrameMs + delta;
}

export function resolveStemUrl(
  ref: AssetStemRef,
  renderWidthPx: number
): string | null {
  return frameTierSrc(ref.stem, renderWidthPx);
}

export function resolveStemUrlOptional(
  ref: AssetStemRef,
  renderWidthPx: number
): string | null {
  return frameTierSrcOptional(ref.stem, renderWidthPx);
}

export function resolveBodyUrl(
  action: ActionKey,
  renderWidthPx: number,
  frameIndex = 0,
  options?: { enterLoopPhase?: "enter" | "loop" }
): string | null {
  const { body } = getActionDef(action);
  if (isEnterLoopBody(body)) {
    const stem =
      options?.enterLoopPhase === "enter"
        ? body.enter[0]!
        : body.loop[frameIndex % body.loop.length]!;
    return frameTierSrc(stem, renderWidthPx);
  }
  if (isAnimatedBody(body)) {
    const stem = body.stems[frameIndex % body.stems.length]!;
    return frameTierSrc(stem, renderWidthPx);
  }
  return resolveStemUrl(body, renderWidthPx);
}

export function resolveFxBackUrl(
  action: ActionKey,
  renderWidthPx: number
): string | null {
  const fx = getActionDef(action).fxBack;
  if (!fx) return null;
  return resolveStemUrl(fx, renderWidthPx);
}

export function resolveFxFrontUrl(
  action: ActionKey,
  renderWidthPx: number
): string | null {
  const fx = getActionDef(action).fxFront;
  if (!fx) return null;
  return resolveStemUrl(fx, renderWidthPx);
}

/** Human-readable path for debug (stem-based, not import URL). */
export function describeAssetPath(
  ref: AssetStemRef,
  renderWidthPx: number
): string {
  const tier =
    renderWidthPx <= 62 ? 53 : renderWidthPx <= 88 ? 70 : 106;
  return `frames/${ref.stem}-h${tier}.png`;
}

export const MISSION_TELEPORT_STEMS = {
  missionStart: "mission-start",
  missionRun: "mission-run",
  smokeOnly: "smoke-only",
  smokeBig: "smoke-big",
  missionArrive: "mission-arrive",
} as const;

export const MISSION_TELEPORT_MS = {
  smokeOnly: 120,
  smokeBig: 120,
  missionArrive: 180,
} as const;

export const MISSION_HOLD_MS =
  MISSION_TELEPORT_MS.smokeOnly +
  MISSION_TELEPORT_MS.smokeBig +
  MISSION_TELEPORT_MS.missionArrive;
export const POSE_HOLD_MS = 2600;

/** WALK action: how long the walk session lasts before returning to idle. */
export const WALK_HOLD_MS = 5200;
/** Per-tick slide distance and duration while walking. */
export const WALK_SLIDE_PX = 36;
export const WALK_SLIDE_TICK_MS = 360;

/** KUNAI throw timeline: a (windup) -> b (release + flying fx) -> c (zanshin) -> idle. */
export const KUNAI_WINDUP_MS = 250;
/** Left-side window expansion multiplier (× sprite render width). */
export const KUNAI_FLY_EXTRA_PX_MULT = 2;
/** Per-frame display time of the flying kunai sprite. */
export const KUNAI_FLY_FRAME_MS = 80;
/** Flight stems (left-bound). fxFront swaps through these during phase b.
 *  Last frame fades out so the kunai "vanishes into the distance". */
export const KUNAI_FLY_STEMS = [
  "kunai-fx-1",
  "kunai-fx-2",
  "kunai-fx-3",
  "kunai-fx-4",
] as const;
/** Total release/flight duration. */
export const KUNAI_RELEASE_MS = KUNAI_FLY_FRAME_MS * KUNAI_FLY_STEMS.length;
export const KUNAI_ZANSHIN_MS = 350;
export const KUNAI_TOTAL_MS =
  KUNAI_WINDUP_MS + KUNAI_RELEASE_MS + KUNAI_ZANSHIN_MS;

/** RUN action: how long the whole "scouting move" session lasts before returning to idle. */
export const RUN_HOLD_MS = 7000;
/** Gap between scans (random pick from min..max). */
export const RUN_SCAN_GAP_MS = { min: 900, max: 2000 } as const;
/** How long to display a scan frame (run-b / run-d). */
export const RUN_SCAN_HOLD_MS = { min: 400, max: 900 } as const;
/** Chance that a scan tick actually triggers a side look. */
export const RUN_SCAN_CHANCE = 0.65;
/** Pre-scan pause (freeze on run-c) before showing the side look. */
export const RUN_SCAN_PRE_PAUSE_MS = 120;
/** Per-tick slide distance and duration while moving on run-c. */
export const RUN_SLIDE_PX = 56;
export const RUN_SLIDE_TICK_MS = 650;

export const REQUIRED_STEMS = [
  "idle",
  "look-2",
  "look-3",
  "mission-start",
  "mission-run",
  "smoke-only",
  "smoke-big",
  "mission-arrive",
  "smoke-sit-enter",
  "smoke-sit-rest-a",
  "smoke-sit-rest-b",
  "shift-smoke-enter",
  "shift-smoke-rest-a",
  "shift-smoke-rest-b",
  "peek-1",
  "peek-2",
  "peek-3",
  "walk-1",
  "walk-2",
  "walk-3",
  "walk-4",
  "run-a",
  "run-b",
  "run-c",
  "run-d",
  "kunai-a",
  "kunai-b",
  "kunai-c",
  "kunai-fx-1",
  "kunai-fx-2",
  "kunai-fx-3",
  "kunai-fx-4",
] as const;
