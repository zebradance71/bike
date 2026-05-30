# Branding / Character-pack 置換ターゲット（Phase B 作業用チェックリスト）

Phase A 完了時点でベース層に残っている `Ninja|ninja` 出現を分類したメモ。
Phase B では `branding.json` と `CharacterPack` の inject 経由に置き換える。
作業時はカテゴリ A → B → C → D の順で置換し、各カテゴリ終了時に `npm run dev` で動作確認すると安全。

---

## A. Branding 文字列（`branding.json` 経由に置換）

`Ninja2` などの製品名・トレイラベルが直書きされている箇所。Phase B-4 で
`branding.json` を実装した後、main / tray / package.json から動的に
読み込む。

| ファイル | 行 | 現在の値 | 置換先 |
| --- | --- | --- | --- |
| `electron/main.ts` | 42, 213, 1017 | `Quit Ninja2` / `Ninja2` (コメント・ログ) | `branding.productName` |
| `electron/tray.ts` | 100 | `Ninja2 — ${visible ? "running" : "hidden"}` | `${branding.productName} — …` |
| `electron/tray.ts` | 105 | `Hide ninja` / `Show ninja` | `Hide ${branding.displayName}` 等 |
| `electron/tray.ts` | 178 | `Quit Ninja2` | `Quit ${branding.productName}` |
| `electron/tray.ts` | 193 | `tray.setToolTip("Ninja2")` | `tray.setToolTip(branding.productName)` |
| `package.json` | 2 | `"name": "ninja"` | `"name": "<pack-id>"`（テンプレ展開時） |
| `package.json` | 6 | `description` 内の "Ninja Companion" | `branding.description` |
| `package.json` | 49 | `appId: "com.toriilabs.ninja2"` | `branding.appId`（`electron-builder.config.cjs` で require） |
| `package.json` | 50 | `productName: "Ninja2"` | `branding.productName` |
| `package.json` | 100 | `shortcutName: "Ninja2"` | `branding.productName` |
| `src/launcher/App.tsx` | 7, 9, 13 | `bg-ninja-mist` `text-ninja-ink` `text-ninja-accent` 等 Tailwind class | パレットを `branding.palette` に外出し、または `companion-*` 命名に rename |

---

## B. ログ prefix `[ninja]`（汎用化）

全 `console.*("[ninja][...]")` を `[companion][...]` に統一する。
Phase B-6 で機械置換が安全（grep & replace_all）。

対象ファイル:

- `electron/main.ts`（89, 113, 115, 265, 506, 524, 637, 649, 671, 793, 846, 854, 902, 907 ほか）
- `electron/tray.ts`（76, 81, 162, 208）
- `electron/settings-store.ts`（40, 58, 71）
- `electron/title-watcher.ts`（114, 125, 157, 187, 207, 223, 279）
- `src/companion/engine/useCompanionBehavior.ts`（271, 451, 489, 576）
- `src/companion/App.tsx`（51, 64, 69, 74）

例外: `electron/title-watcher.ts:223` の `NINJA_TITLE_WATCHER` 環境変数名は
互換のため一定期間 alias を残す（`COMPANION_TITLE_WATCHER` も読む）。

---

## C. 構造的 `ninja` 参照（Phase B-1 / B-2 / B-3 で解消）

`characters/ninja/` への物理移動と CharacterPack inject で解消される import / 型参照。

| ファイル | 行 | 現状 | Phase B での移行先 |
| --- | --- | --- | --- |
| `src/companion/engine/types.ts` | 2, 4, 6, 8 | `NinjaActionKey` import / `CompanionId = "ninja"` | `CompanionActionKey` に rename、`CompanionId = string` に汎用化（`pack.id` を入れる） |
| `src/companion/engine/timing.ts` | 1 | `import { MISSION_HOLD_MS } from "../ninja/ninjaActionAssets"` | `pack.timing.missionHoldMs` 経由 |
| `src/companion/engine/useCompanionBehavior.ts` | 8, 79, 122, 135, 144, 153, 162, 171, 180, 189, 198 | 同上 import / `id: "ninja"` ハードコード | pack inject、`id: pack.id` |
| `src/companion/engine/useCompanionBehavior.ts` | 262, 481, 574, 588 | `window.ninja?.*` | `window.companion?.*`（Phase A の alias で動作はするが Phase B でクリーン化） |
| `src/companion/App.tsx` | 9-13, 107, 116 | `./ninja/*` import / `NinjaSpriteRenderer` / `NinjaActionDebugPanel` | `./characters/ninja/*` 経由（または `activeCharacter` から取得） |
| `src/companion/useDisplaySize.ts` | 15, 19, 32 | `window.ninja?.setDisplaySize?.(...)` | `window.companion?.setDisplaySize?.(...)` |
| `src/companion/useDevAnimPreview.ts` | 7, 11 | `NinjaActionKey` import | `pack.actions` キーから動的生成 |
| `src/companion/ninja/render/NinjaSpriteRenderer.tsx` | (file) | `useNinjaActionLayers` 直接 import | `pack.useLayers` 経由 |

---

## D. コメント内 `ninja` 言及（low priority）

機能には影響しないが、テンプレート公開後に「ninja アプリ専用」と
誤読されないよう、Phase B 完了直前に sweep 置換する。

例:

- `electron/main.ts:973` 「the user immediately sees a ninja head in the tray」 → 「the user immediately sees the companion in the tray」
- `electron/main.ts:990` 「the user expects the ninja to appear the instant the …」 → 「the user expects the companion to appear …」
- `electron/title-watcher.ts:65` 「defensive — ninja runs on Win primarily」 → 「defensive — companion runs on Win primarily」

---

## Phase A 完了状態の不変条件

- `window.companion` と `window.ninja` は **同一オブジェクト**（`Object.is` true）
- `CompanionAPI` 型 = `NinjaAPI` 型（後者は alias）
- `CompanionSpriteRenderer` = `NinjaSpriteRenderer` の re-export
- 既存の `window.ninja.*` 呼び出しは全て動作継続
- TypeScript エラーゼロ、`npm run dev` で警告なし
