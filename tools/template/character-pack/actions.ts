import { frameTierSrc } from "./frames/tierCatalog";

export type AssetStemRef = { readonly stem: string };

export type ActionAssetDef = {
  readonly label: string;
  readonly devKey?: string;
  readonly body: AssetStemRef;
  readonly fxBack?: AssetStemRef | null;
  readonly fxFront?: AssetStemRef | null;
  readonly mirrorOnFacing?: boolean;
};

export const actionAssets = {
  idle: {
    label: "待機",
    body: { stem: "idle" },
  },
} as const satisfies Record<string, ActionAssetDef>;

export type ActionKey = keyof typeof actionAssets;

export const REQUIRED_STEMS = ["idle"] as const;

export function resolveStemUrl(stem: string, renderWidthPx: number): string | null {
  return frameTierSrc(stem, renderWidthPx);
}

export function getActionDef(action: ActionKey): ActionAssetDef {
  return actionAssets[action];
}
