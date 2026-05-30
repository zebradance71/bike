# Ninja Companion — アプリ基盤仕様

NINJA は「Silent Ninja Companion」というデスクトップ常駐コンパニオン。Electron + Vite + React + TypeScript で構築されており、本ドキュメントはアプリの土台部分（プロセス構成・ウィンドウ・ビルド・IPC・状態管理）をまとめる。アクション固有の挙動は別ドキュメント [`ninja-companion-spec.md`](./ninja-companion-spec.md) を参照。

---

## 1. アプリ概要

| 項目 | 値 |
|---|---|
| 名前 | `ninja`（package name） / NINJA Companion |
| バージョン | `0.1.0`（private） |
| 種別 | Electron デスクトップアプリ（Windows / macOS） |
| キャラクター | 1 体常駐の忍者コンパニオン（透明・クリックスルー） |
| コンセプト | "Silent Ninja Companion — a small desktop friend" |

---

## 2. プロセス & ウィンドウ構成

```
┌─ Electron main process (electron/main.ts) ─────────────────┐
│  app lifecycle / BrowserWindow / IPC handlers              │
│                                                             │
│  ┌─ launcherWindow (360×280, 通常ウィンドウ) ──────────┐    │
│  │  src/launcher/  — START MISSION ボタンのみ          │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─ companionWindow (透過 / フレームレス / 常時最前面) ─┐    │
│  │  src/companion/ — 忍者スプライトレンダラ             │    │
│  │  • transparent: true / frame: false                  │    │
│  │  • alwaysOnTop / skipTaskbar / hasShadow: false      │    │
│  │  • visibleOnAllWorkspaces: true                      │    │
│  │  • prod: setIgnoreMouseEvents(true) → クリックスルー │    │
│  │  • dev: 入力可、devtools detach 表示                 │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 起動フロー

1. `app.whenReady()` で `createLauncherWindow()`
2. ユーザーが launcher の `START MISSION` を押す → `window.ninja.startMission()` IPC
3. main process で `createCompanionWindow()` → launcher を hide
4. companion ウィンドウが画面下端 + 横方向ランダム位置に出現

### ウィンドウサイズ

`displaySize.ts`:

| 項目 | 値 |
|---|---|
| `DISPLAY_SIZES` | `[48, 64, 96]` |
| `DEFAULT_DISPLAY_SIZE` | `64` |
| `WINDOW_CHROME_PX` | `24`（透明パディング） |
| `SPRITE_RENDER_SCALE` | `1.1` |
| companion window | `spritePx + 24` 正方形 |
| sprite 描画 | `Math.round(spritePx * 1.1)` |

dev key `4 / 6 / 9` でランタイム切替可能。

### ウィンドウ位置決定ロジック（`pickTargetSpriteCenterX`）

- `lastTeleportSide`（"left" / "right"）を毎回反転させ、左右ゾーンを交互に選択
- 各ゾーン内でランダム X を採取（minCenter / maxCenter は `marginX`、span の 38% / 62% を境界とする）
- 結果として「同じ場所に連続出現しない」 + 「画面の左右に住んでいる感」を担保

---

## 3. ビルド構成（Vite + electron plugin）

`vite.config.ts`:

```ts
plugins: [
  react(),
  electron({
    main:    { entry:  "electron/main.ts" },
    preload: { input:  "electron/preload.ts" },
  }),
],
build: {
  rollupOptions: {
    input: {
      launcher:  "launcher.html",
      companion: "companion.html",
    },
  },
},
```

| ファイル | 役割 |
|---|---|
| `launcher.html` | `src/launcher/main.tsx` をマウント |
| `companion.html` | `src/companion/main.tsx` をマウント |
| `dist-electron/main.js` | Electron main bundle |
| `dist-electron/preload.mjs` | preload bundle |
| `dist/{launcher,companion}.html` | renderer bundle（prod） |

### npm scripts

| コマンド | 内容 |
|---|---|
| `npm run dev` | Vite dev server + electron 同時起動 |
| `npm run build` | renderer + main + preload を一括ビルド |
| `npm run start` | `build` 後に `electron .` で起動 |
| `npm run regen:presence` | スプライト再生成（presence） |
| `npm run regen:display` | display tier 再生成 |
| `npm run regen:frames` | フレーム alpha 修復 |

### 依存

- **runtime**: `react@^18.3.1` / `react-dom@^18.3.1` / `framer-motion@^11.18.0`
- **build**: `vite@^6` / `electron@^33` / `vite-plugin-electron` / `tailwindcss@^3.4` / `typescript@^5.7`

---

## 4. IPC — `window.ninja` API

`electron/preload.ts` で `contextBridge.exposeInMainWorld("ninja", { ... })` 公開。`contextIsolation: true / nodeIntegration: false` を維持。

| API | 引数 | 戻り値 | 用途 |
|---|---|---|---|
| `startMission()` | – | – | launcher → main: companion を起動 |
| `teleport(options?)` | `{ marginX?, marginY?, direction?, distancePx?, random?, phase? }` | `{ x, y }` | companion ウィンドウを瞬間移動。`random` で交互ゾーン選択 |
| `setSmokeMode(enabled, extraWidthPx?)` | `boolean, number` | `void` | 煙演出のため一時的にウィンドウ幅を拡張（中心固定） |
| `setDisplaySize(px)` | `48 \| 64 \| 96` | `void` | スプライトサイズ変更（dev key 4/6/9） |
| `slideX(deltaPx, durationMs)` | `number, number` | `void` | 横方向にイージングつき移動（walk / run） |
| `getBounds()` | – | `{ window, workArea } \| null` | 現在のウィンドウ位置と作業領域。方向決定に使用 |
| `peekEdge(side, durationMs)` | `"left"\|"right", number` | `void` | 画面端に約 48% 隠れる位置へ移動（peek 用） |
| `restorePosition(durationMs)` | `number` | `void` | `peekEdge` 前の位置へ戻す |

### main 側の状態（`electron/main.ts`）

- `companionWindow` / `launcherWindow`: BrowserWindow 参照
- `lastTeleportSide`: テレポート時の左右ゾーン交互制御
- `spriteSizePx`: 現在のスプライトサイズ（48/64/96）
- `savedCompanionPosition`: `peekEdge` 復帰用
- `smokeMode` / `appliedSmokeExtraPx`: 煙拡張モード

---

## 5. Renderer 構成（`src/companion/`）

```
src/companion/
├ main.tsx                       # ReactDOM.createRoot
├ App.tsx                        # ルート、debug 行、size hint
├ companion.css                  # ウィンドウ全体の透明背景など
├ displaySize.ts                 # サイズ定数 / 計算
├ useDisplaySize.ts              # サイズ state + dev key 4/6/9
├ useDevAnimPreview.ts           # dev key (W/P/S/Shift+S/M/R/L) → behavior
├ engine/
│  ├ types.ts                    # CompanionAction / CompanionState
│  ├ timing.ts                   # 確率テーブル（DEV/PROD）
│  ├ companionActivity.ts        # AFK / idle streak 追跡
│  └ useCompanionBehavior.ts     # autonomous loop + begin* メソッド
└ ninja/
   ├ ninjaActionAssets.ts        # アクション定義 + 定数
   ├ frames/
   │  ├ frameAssetUrl.ts         # FRAME_ASSET_REV（cache bust）
   │  └ frameTierCatalog.ts      # tier (h53/h70/h106) 解決
   ├ debug/
   │  └ NinjaActionDebugPanel.tsx # Alt+D で開閉
   └ render/
      ├ NinjaSpriteRenderer.tsx  # Sprite slot 描画（rev28 base 固定）
      ├ ninja-renderer.css       # 共通 CSS（action 別 CSS なし）
      └ useNinjaActionLayers.ts  # 各アクションの state machine
```

---

## 6. 状態管理レイヤー

### 6.1 CompanionState（`engine/types.ts`）

```
{ id: "ninja", action: NinjaActionKey, facing: "left" | "right" }
```

`NinjaActionKey` は `ninjaActionAssets.ts` の export から派生（`idle / mission / smoke / shiftSmoke / pose / walk / run / look`）。

### 6.2 useCompanionBehavior（autonomous）

- `paused = import.meta.env.DEV`：dev では autonomous 停止、dev key で個別検証
- prod では `useEffect` 内で再帰的に:
  - `firstAction` 遅延 → `pickPostIdleAction()` でアクション抽選
  - 各 action の `run*` を実行 → 完了後 `scheduleAfterIdle()` で次サイクル
- `pickPostIdleAction` は `timing.ts` の累積確率（`smokeChance / sitChance / peekChance / lookChance`）で抽選、残りを `walk` フォールバック
- `sitIdleBefore` 経過まで sit は walk 格下げ、AFK が長ければ shiftSmoke 化（`sitMeditationChance`）

### 6.3 useNinjaActionLayers（state machine）

- `action` が変わるたびに各 state をリセット
- 各 action 専用の `useEffect` が起動して内部時系列を進行
- transient action は `onTransientEnd?.()` で終了通知 → `useDevAnimPreview` の `resetToIdle()` 経由で idle に戻る
- 出力レイヤー: `{ body, fxBack, fxFront, mirror, phase, frameIndex }`

### 6.4 dev key（`useDevAnimPreview.ts`）

| Key | 用途 |
|---|---|
| `W / P / S / Shift+S / M / R / L` | 各 action 起動 |
| `Alt+D` | デバッグパネル開閉 |
| `4 / 6 / 9` | スプライトサイズ切替（`useDisplaySize`） |

---

## 7. アセットパイプライン

### 7.1 配置

- 取り込み済み 512×512 PNG: `src/companion/assets/frames/<stem>.png`
- 高解像度 tier（任意）: `<stem>-h{53,70,106}.png` で `frameTierCatalog` が `renderWidthPx` に応じて選択
- 中間生成物（マゼンタ素材 / ref）: `assets/`（プロジェクトルート）または Cursor の workspace storage `C:\Users\strea\.cursor\projects\c-Users-strea-Develop-ToriiLabs-Ninja2\assets\`

### 7.2 取り込みワークフロー（共通）

`.cursor/rules/ninja-frame-import.mdc` に厳格化。

1. リファレンスシート → `extract-*-cell-refs.py` でセル分割
2. 1 ポーズ 1 枚 マゼンタ生成（`#FF00FF` 背景のみ）
3. `import-*-from-magenta-cells.py` で取り込み（chroma key + bbox + idle 高さ揃え + `FOOT_Y` 配置）
4. 期待ログ: `chroma sheet (Cursor #FF00FF style) - key only, no black paint`
5. `FRAME_ASSET_REV` を bump して dev 再起動

詳細は `ninja-companion-spec.md` の §4 を参照。

### 7.3 cache bust

`FRAME_ASSET_REV`（`frameAssetUrl.ts`）を bump すると、`frameSrc(url)` が `?rev=NN` クエリを付与してブラウザキャッシュを破棄する。アセットを更新したら必ず bump する。

---

## 8. デザイン制約（不変）

renderer や CSS の追加で挙動を変えないこと。アクションは state machine と画像差し替えだけで完結させる。

- `rev28` 基盤
- `SpriteBodySlot` 固定
- `object-fit: contain`
- scale 禁止
- action 別 CSS 禁止
- renderer 変更禁止（`useNinjaActionLayers` の解決ロジックでのみ対応）
- 透過 PNG 禁止 / 黒シート import 禁止（必ずマゼンタ chroma 経由）

---

## 9. 拡張・運用ノート

- 新規アクション追加手順は `ninja-companion-spec.md` §8 を参照
- ウィンドウ挙動を増やしたい場合は `electron/main.ts` に IPC handler 追加 → `preload.ts` で `window.ninja` に公開 → `src/vite-env.d.ts` で型定義
- 体験チェックは `docs/experience-check.md`（Phase 2 用テンプレ）を流用

---

## 10. 関連ドキュメント

- `docs/ninja-companion-spec.md` — アクション仕様 / 状態機械 / 取り込み詳細
- `docs/experience-check.md` — 体験チェックリスト
- `.cursor/rules/ninja-frame-import.mdc` — 画像取り込み公式ルール
