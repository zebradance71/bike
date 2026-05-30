import { ninjaPack } from "./ninja/pack";

export type { ActionKey } from "./ninja/actions";
export { MISSION_HOLD_MS } from "./ninja/actions";

/**
 * The single character pack baked into this build.
 *
 * 1 リポジトリ = 1 キャラ = 1 .exe の原則のもと、ここを書き換える
 * だけで別キャラリポジトリに切り替わる。`tools/template/init-new-pack.ps1`
 * がこのファイルを自動更新する（Phase C-4 で実装）。
 *
 * Treat this as the *only* place the application picks its character.
 * Everything downstream (App.tsx, useCompanionBehavior, tray icon
 * resolution) reads from here.
 */
export const activeCharacter = ninjaPack;
