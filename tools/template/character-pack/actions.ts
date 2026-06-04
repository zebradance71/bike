import { frameTierSrc } from "./frames/tierCatalog";
import { BLOCK_CHASE_ACTION } from "./blockCursorChase";

export type AssetStemRef = { readonly stem: string };

export type AnimatedBodyRef = {
  readonly stems: readonly string[];
  readonly frameMs: number;
};

export type ActionAssetDef = {
  readonly label: string;
  readonly devKey?: string;
  readonly body: AssetStemRef | AnimatedBodyRef;
  readonly fxBack?: AssetStemRef | null;
  readonly fxFront?: AssetStemRef | null;
  readonly mirrorOnFacing?: boolean;
};

export const IDLE_BASE_STEM = "idle" as const;

export const VIBRATE_STEMS = ["idle-vibrate-a", "idle-vibrate-b"] as const;
export const EXHAUST_STEMS = ["idle-exhaust-a", "idle-exhaust-b"] as const;

export const VIBRATE_FRAME_MS = 150;
export const EXHAUST_FRAME_MS = 250;

export function vibrateGapMs(): [number, number] {
  return [8_000, 14_000];
}

export function exhaustGapMs(): [number, number] {
  return [4_000, 9_000];
}

export function isAnimatedBody(
  body: AssetStemRef | AnimatedBodyRef
): body is AnimatedBodyRef {
  return "stems" in body;
}

export const actionAssets = {
  idle: {
    label: "待機",
    body: { stem: IDLE_BASE_STEM },
  },
  [BLOCK_CHASE_ACTION]: {
    label: "ブロック（追従）",
    body: {
      stems: ["block-run-a", "block-run-b", "block-run-c", "block-run-d"],
      frameMs: 85,
    },
    mirrorOnFacing: true,
  },
} as const satisfies Record<string, ActionAssetDef>;

export type ActionKey = keyof typeof actionAssets;

export const REQUIRED_STEMS = [
  IDLE_BASE_STEM,
  ...VIBRATE_STEMS,
  ...EXHAUST_STEMS,
  "block-idle",
  "block-run-a",
  "block-run-b",
  "block-run-c",
  "block-run-d",
] as const;

export function resolveStemUrl(stem: string, renderWidthPx: number): string | null {
  return frameTierSrc(stem, renderWidthPx);
}

export function resolveBodyUrl(
  action: ActionKey,
  renderWidthPx: number,
  frameIndex = 0
): string | null {
  const { body } = actionAssets[action];
  if (isAnimatedBody(body)) {
    const stem = body.stems[frameIndex % body.stems.length]!;
    return frameTierSrc(stem, renderWidthPx);
  }
  return resolveStemUrl(body.stem, renderWidthPx);
}

export function getActionDef(action: ActionKey): ActionAssetDef {
  return actionAssets[action];
}
