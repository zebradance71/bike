import { ninjaPack } from "./ninja/pack";
import { resolveStemUrl } from "./ninja/actions";

export type { ActionKey } from "./ninja/actions";
export { MISSION_HOLD_MS } from "./ninja/actions";
export { FRAME_ASSET_REV } from "./ninja/frames/frameAssetUrl";
export { frameTierResolveDebug } from "./ninja/frames/tierCatalog";

export function resolvePackStemUrl(
  stem: string,
  renderWidthPx: number
): string | null {
  return resolveStemUrl({ stem }, renderWidthPx);
}

/**
 * The single character pack baked into this build.
 *
 * 1 リポジトリ = 1 キャラ = 1 .exe の原則のもと、ここを書き換える
 * だけで別キャラリポジトリに切り替わる。`tools/template/init-new-pack.ps1`
 * がこのファイルを自動更新する。
 */
export const activeCharacter = ninjaPack;
