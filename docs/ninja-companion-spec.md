# Ninja Companion 仕様（rev 97 時点）

デスクトップ常駐の忍者コンパニオン。クリックスルーの透明 Electron ウィンドウに 1 体表示し、idle を中心に各種アクションをランダム発動する。

---

## 1. 設計の固定ルール（rev28 base）

すべてのアクションは下記制約を守る。

- `SpriteBodySlot` 固定 / `object-fit: contain` / scale 禁止 / action 別 CSS 禁止
- 1 アクション = 1 ステート機械（`useNinjaActionLayers.ts`）
- renderer は touchしない（layer 解決のみ変える）
- 画像取り込みは `#FF00FF magenta` ワークフローに統一（透過 PNG / 黒シート禁止）
- すべての transient アクションは `onTransientEnd → resetToIdle()` で必ず idle に戻る

---

## 2. アクション一覧

| Key | action | label | 用途 / コンセプト | 発動 | 移動 | 向き |
|---|---|---|---|---|---|---|
| — | `idle` | 待機 | ベース。立ち姿 1 枚 | 常時 | – | facing |
| `M` | `mission` | M（teleport） | 「任務に向かう」演出。煙とテレポート | autonomous | teleport 1 回 | – |
| `S` | `smoke` | S（座る） | 一服する休憩。enter → rest a/b 一度ループ | autonomous（sit gate 経由） | – | facing 反転 |
| `Shift+S` | `shiftSmoke` | Shift+S（瞑想） | 長時間 AFK 中の瞑想。enter → rest a/b 永続交互 | sit 内 ~10% | – | facing 反転 |
| `P` | `pose` | P（覗き） | 「覗いてる感」を出す peek。各フレームで random teleport | autonomous | random teleport（毎フレーム） | mirror なし（固定） |
| `W` | `walk` | W（移動） | 通常の散歩。スタート位置から広い側へ連続移動 | autonomous（fallback） | `slideX 36px / 360ms` × 多数 | direction 連動 |
| `R` | `run` | R（索敵移動） | 「索敵しながら移動する忍者」。base = `run-c`、`run-b/d` で scouting | dev key のみ（autonomous 未配線） | `slideX 56px / 650ms` × 多数 | direction 連動 |
| `L` | `look` | L（チラ見警戒） | 「何か気になって横をチラッと確認」。`look-2 → look-3 → look-2 → idle` | autonomous | – | facing 反転 |
| `K` | `kunai` | K（クナイ投擲） | 単発の transient。`kunai-a`（windup）→ `kunai-b`（release、fxFront に `kunai-fx-1..4` を 80ms ずつ切替）→ `kunai-c`（残心）→ idle。**期間中だけ companion ウィンドウを左に `~spritePx × 2` 拡張**しクナイが viewport 左端まで飛ぶ | dev key のみ（autonomous なし） | – | **左投擲固定**（`facing` 無視、常に mirror なし＝素材通り左向き） |
| `B` | – | block mode toggle | ブロックサイト（X / YouTube 等）を開いている間の妨害ループを on/off。詳細は §6 | dev key（host が IPC で叩く想定） | – | – |
| `Alt+D` | – | デバッグパネル | 状態確認用 | – | – | – |

### アクション別タイミング定数

`src/companion/ninja/ninjaActionAssets.ts` 参照。

| 定数 | 値 | 用途 |
|---|---|---|
| `MISSION_HOLD_MS` | `120 + 120 + 180 = 420ms` | smokeOnly / smokeBig / arrive の合計 |
| `POSE_HOLD_MS` | `2600ms` | （現状未使用、`EnterLoopBodyRef` で制御） |
| `WALK_HOLD_MS` | `5200ms` | walk の最低保証時間（実際は画面比例で動的に計算、上限 12s） |
| `WALK_SLIDE_PX` | `36px` | 1tick の横移動量 |
| `WALK_SLIDE_TICK_MS` | `360ms` | 1tick の経過時間 |
| `RUN_HOLD_MS` | `7000ms` | run の総セッション時間 |
| `RUN_SCAN_GAP_MS` | `900–2000ms` | scouting 試行間隔 |
| `RUN_SCAN_HOLD_MS` | `400–900ms` | scouting 表示時間 |
| `RUN_SCAN_CHANCE` | `0.65` | scouting tick の発火率 |
| `RUN_SCAN_PRE_PAUSE_MS` | `120ms` | scouting 前の停止 |
| `RUN_SLIDE_PX` | `56px` | 1tick の横移動量 |
| `RUN_SLIDE_TICK_MS` | `650ms` | 1tick の経過時間 |
| `KUNAI_WINDUP_MS` | `250ms` | a 構えの表示時間 |
| `KUNAI_FLY_FRAME_MS` | `80ms` | b 中の各飛翔フレーム表示時間 |
| `KUNAI_FLY_STEMS` | `[fx-1, fx-2, fx-3, fx-4]` | b で順番に切替える飛翔 fxFront、最終 fx-4 は α=0.4 で彼方へフェード |
| `KUNAI_FLY_EXTRA_PX_MULT` | `2` | kunai 中、companion ウィンドウ＆viewport を左に `renderWidth × N` 拡張する係数 |
| `KUNAI_RELEASE_MS` | `80ms × 4 = 320ms` | b 全体（飛翔合計） |
| `KUNAI_ZANSHIN_MS` | `350ms` | c 残心の表示時間 |
| `KUNAI_TOTAL_MS` | `920ms` | a+b+c 合計 |

### 自動発動確率（`src/companion/engine/timing.ts`）

販売仕様 (PROD) の目標分布: **idle 75% / walk 14% / mission 5% / smoke 4% / look 2% / pose 0%**。

`pickPostIdleAction` は 2 段ロール:
1. `idleStayChance` ロールでヒットしたら `null` を返し、`scheduleAfterIdle` を再呼び出し（idle 継続）
2. 抜けた場合のみ従来の累積ロールで action を選ぶ

| 項目 | Dev | Prod | 全体％ (Prod) |
|---|---|---|---|
| `idleStayChance`（idle 継続） | 0.40 | **0.75** | 75% |
| `smokeChance`（→ mission） | 0.20 | 0.20 | 5% |
| `sitChance`（→ smoke / shiftSmoke） | 0.20 | 0.16 | 4% |
| `peekChance`（→ pose） | 0.00 | **0.00** | 0%（販売仕様で凍結） |
| `lookChance`（→ look） | 0.10 | 0.08 | 2% |
| 残り | walk（fallback） | walk（fallback） | 14% |
| `sitMeditationChance` | 0.10 | 0.10 | – |

`sitChance` 帯では `sitIdleBefore` が経過するまで walk に格下げ、AFK が長ければ shiftSmoke 化。

`idle` Range は PROD `25–60s`、平均 idle 滞在 ≒ `42.5s × 1/(1 - idleStayChance)` ≒ **約 2.8 分** に伸びる。

---

## 3. 状態機械（`useNinjaActionLayers.ts`）

action 切替で各 state がリセットされ、対応する `useEffect` が起動する。

| action | state | 主処理 |
|---|---|---|
| `idle` | – | `idle.png` を表示するだけ |
| `mission` | `missionPhase` | `start → smokeOnly →（teleport）→ smokeBig → arrive` を時間制御 |
| `smoke` / `shiftSmoke` / `pose` | `enterLoopPhase / enterLoopIndex` | `EnterLoopBodyRef`（enter → loop、`loopOnce` で 1 周完了 or 永続交互） |
| `walk` | `walkDirection` | `getBounds()` で広い側決定 → 開始時に「**空きスペース × 50%**」を目標移動量にし `ticks × WALK_SLIDE_TICK_MS`（下限 `WALK_HOLD_MS = 5.2s`、上限 12s）を `maxMs` として `slideX` を繰り返し、端到達で早期 break → `onTransientEnd`。FHD/WQHD/4K で同じ画面比率の散歩感を保つ |
| `run` | `runDirection / runPhase` | walk と同方式 + scouting 周期で `run-b/d` を挟む |
| `look` | `enterLoopPhase / enterLoopIndex`（`loopOnce: true`） | `look-2 → look-3 → look-2 → onTransientEnd`、各フレーム 500–900ms ジッター |
| `kunai` | `kunaiPhase` (`a`/`b`/`c`) + `kunaiFlyIndex` (0..3) | timeline 開始で `setKunaiThrowMode(true, renderWidth × 2)` → `a (250ms) → b (80ms × 4 で fxFront を fx-1→fx-2→fx-3→fx-4 に切替。tip_x= 0.44 → 0.28 → 0.12 → 0.02 (in 1536px wide canvas)、α= 1.0 → 1.0 → 0.85 → 0.40 でフェード) → c (350ms)` → `setKunaiThrowMode(false)` → `onTransientEnd`。cleanup でも必ず false を呼ぶ。`teleport / slideX` なし |

`pose` のみ `enterLoopPhase` / `enterLoopIndex` が変わるたびに `window.ninja.teleport({ random: true })` を呼ぶ（覗き位置をランダム化）。

mirror 計算:
```
action === "run"   → runDirection === -1
action === "walk"  → walkDirection === -1
action === "kunai" → false           ※左投擲固定（素材通り、facing 無視）
それ以外           → mirrorOnFacing && action !== "pose" && facing === "left"
```

---

## 4. 画像取り込みワークフロー（共通）

`.cursor/rules/ninja-frame-import.mdc` に記載。すべてのアクションで以下を踏む。

1. リファレンスシートを `assets/<action>-ref/` に展開（`extract-*-cell-refs.py`）
2. 各 `*-ref.png` を添付して 1 ポーズ 1 枚 マゼンタ生成（`#FF00FF` 背景のみ、透過 / 黒 / チェッカー禁止）
3. `import-*-from-magenta-cells.py` で取り込み
   - chroma key（`is_magenta_strict` + 軽い `despill_magenta_fringe`）
   - `padded_bbox(BBOX_PAD=36)` でクロップ
   - `idle` 高さに合わせてスケール
   - 512×512 キャンバスに `FOOT_Y` 揃えで配置
4. ログに `chroma sheet (Cursor #FF00FF style) - key only, no black paint` が出ることを確認
5. `FRAME_ASSET_REV` を bump
6. dev 再起動

| アクション | extract | import |
|---|---|---|
| M | `extract-mission-cell-refs.py`（2×3, 左上スキップ） | `import-mission-from-magenta-cells.py` |
| S | – | `import-smoke-sit-from-magenta-cells.py` |
| Shift+S | – | `import-shift-smoke-from-magenta-cells.py` |
| P | `extract-pose-cell-refs.py`（3 列） | `import-pose-from-magenta-cells.py`（`compose_peek` で頭が下端） |
| R | `extract-run-cell-refs.py`（2×2） | `import-run-from-magenta-cells.py` |
| W | （idle 参照で 1 枚ずつ生成） | `import-walk-from-magenta-cells.py` |
| L | （`look-2/3` は既存流用） | – |
| K | （idle 参照で `kunai-{a,b,c}` 本体のみ + `kunai-fx-magenta.png` 1 枚から飛翔位置・α 違いの `kunai-fx-{1..4}` を生成） | `import-kunai-from-magenta-cells.py`（fx は **横長 1536×512 canvas** に compose、scale = `idle_h * 0.55`、tip_x_frac = 0.44/0.28/0.12/0.02、α = 1.0/1.0/0.85/0.40 で配置。runtime で object-fit:contain により viewport 全幅に展開） |

---

## 5. 必須スプライト

`REQUIRED_NINJA_STEMS`（`ninjaActionAssets.ts`）:

```
idle, look-2, look-3,
mission-start, mission-run, smoke-only, smoke-big, mission-arrive,
smoke-sit-enter, smoke-sit-rest-a, smoke-sit-rest-b,
shift-smoke-enter, shift-smoke-rest-a, shift-smoke-rest-b,
peek-1, peek-2, peek-3,
walk-1, walk-2, walk-3, walk-4,
run-a, run-b, run-c, run-d,
kunai-a, kunai-b, kunai-c,
kunai-fx-1, kunai-fx-2, kunai-fx-3, kunai-fx-4
```

---

## 6. IPC（`electron/main.ts` ↔ `preload.ts` ↔ `window.ninja`）

すべての位置計算は `workAreaBounds()` を経由する。これは `companionWindow` が存在すれば `screen.getDisplayMatching({ x, y, width, height })` で **companion ウィンドウを最も多く含むディスプレイの workArea** を返す = マルチモニタ環境で companion を移動しても座標破綻しない。

| API | 用途 | 使用箇所 |
|---|---|---|
| `teleport({ random?, marginX?, phase? })` | ウィンドウを別位置へ瞬間移動 | `mission` / `pose` |
| `slideX(dx, durationMs)` | 横方向にスライド移動 | `walk` / `run` |
| `getBounds()` → `{ window, workArea }` | 現在の window 位置と work area 取得 | `walk` / `run` の方向決定・端検知 |
| `setSmokeMode(enabled, extraWidthPx?)` | mission の `smoke-big` 期間ウィンドウを左右に拡張 | `mission` |
| `setKunaiThrowMode(enabled, leftExtraPx?)` | kunai 期間ウィンドウを **左側のみ** 拡張（クナイが左へ飛ぶため） | `kunai` |

---

## 6.5 ブロックモード（block mode）

ホスト側（ブラウザ拡張など）が「X / YouTube などの集中阻害サイトが開かれた」ことを検知したら、`window.ninja?.setBlockMode(true)` 相当を呼ぶ想定。本リポジトリでは現状 dev key `B` で toggle 可能。

### サイクル

1. **block-on（開始演出）**
   1. `setSpriteSize(96)` で本体を一段大きくする（`NORMAL=64 → BLOCK=96`）。
   2. `mission`（M）でドロン登場。
   3. その直後 `pose`（P）一発で「気付いてるぞ」演出。
2. **disruption loop**（経過時間でフェーズ遷移、`BLOCK_PHASES` in `timing.ts`）

   | フェーズ | 開始 | 間隔 (gap) | 重み |
   |---|---|---|---|
   | warn | 0s〜 | 8–15s | pose×2 / run×1 |
   | annoy | 30s〜 | 5–10s | run×2 / kunai×2 / look×1 |
   | rage | 90s〜 | 3–7s | kunai×3 / run×1 |

   L（look）は warn フェーズには含めず、終了演出（block-off の見送り 1.4s）専用にしてある。これで「ブロック解除→ L 見送り」のビートが他フェーズと混ざらない。

3. **block-off（終了演出）**
   1. `look`（L）で 1.4s 見送り（`BLOCK_OFF_LOOK_MS`）。
   2. `setSpriteSize(64)` で元サイズに戻し、`mission`（M）でドロン退場。
   3. autonomous loop へ復帰（次の idle 待ち）。

4. **諦め演出（give-up）**
   - `BLOCK_GIVE_UP_MS = 10 * 60_000`（10 分）連続でブロック中の場合、
     `Shift+S`（瞑想）に遷移し、disruption ループを終了する。
   - `Shift+S` は永続ループの瞑想なので、`setBlockMode(false)` が呼ばれるまで
     その姿勢のまま。`setBlockMode(false)` 時は通常通り終了演出に移る。

### K（kunai）の方向制御

K は素材的に **左向き左投擲固定**で window 拡張も左方向限定。ブロック中、companion が画面の **左半分** にいる状態で K が選ばれた場合は K をスキップして `mission` に置き換える（teleport は `awayFromCurrent: true` なので右半分へ高確率で飛ぶ）→ 次のループで右側から発動 = 結果的に K が **画面中央方向** に飛ぶ。

### autonomous との競合

`useCompanionBehavior` の autonomous useEffect は `paused || blockMode` で early return する。block 中は `idle → walk/smoke/...` の通常スケジューラは動かないので二重発動しない。

### 関連定数（`timing.ts`）

| 定数 | 値 | 用途 |
|---|---|---|
| `BLOCK_SPRITE_PX` | `96` | block 中のスプライトサイズ |
| `NORMAL_SPRITE_PX` | `64` | 復帰サイズ |
| `BLOCK_OFF_LOOK_MS` | `1400` | 終了演出の look 表示時間 |
| `BLOCK_GIVE_UP_MS` | `600_000` (10 min) | 諦め発動までの連続ブロック時間 |
| `BLOCK_PHASES` | `warn / annoy / rage` の 3 段 | 経過時間 → gap + 重み |

### ホスト連携（HTTP bridge）

main プロセスは起動時に **localhost:7727** で簡易 HTTP server を立てる
（`NINJA_BLOCK_PORT` env で上書き可）。ブラウザ拡張など外部ホストが、
ブロック対象サイトを開いたタイミングで叩く想定:

```
GET http://127.0.0.1:7727/block/on    → block-mode ON
GET http://127.0.0.1:7727/block/off   → block-mode OFF
GET http://127.0.0.1:7727/block       → 現在状態 ({"blockMode": true})
```

CORS は `*` で開けてあるので拡張から fetch 1 回で叩ける。

main → renderer は `webContents.send("companion-block-mode", on)`。
renderer 側は `window.ninja.onBlockMode((on) => setBlockMode(on))` で
受け、dev key `B` 経由のトグルも `window.ninja.reportBlockMode(on)` で
main 側ミラーに同期する。

参考実装の MV3 ブラウザ拡張は `tools/extension/`。Chrome / Edge の
**Developer mode → Load unpacked** でそのまま読み込める。詳しくは
`tools/extension/README.md`。

#### 拡張なしの組み込みフォールバック（タイトル監視）

`electron/title-watcher.ts` が `active-win` を使ってフォアグラウンド
ウィンドウのタイトルとプロセス名を 1.5 秒間隔で polling し、ブロック
対象パターンとマッチした場合に `broadcastBlockMode(on, "title-watcher")`
を呼ぶ。拡張をインストールしなくても動作するので、ユーザー初期セット
アップは「アプリを起動するだけ」で済む。

**信頼性のための実装上の配慮:**

- `active-win` の動的 import 失敗時は警告ログのみ出力し、main プロセス
  は続行（HTTP bridge / dev key は引き続き動作）
- 5 回連続エラーで 30 秒間 cooldown
- 状態遷移は **debounce 付き**（block 化は 2 tick ≈ 3s 必要、unblock は
  1 tick ≈ 1.5s で即時）→ 通知数の変動でちらつかず、サイトを閉じた時は
  すぐ反応
- `broadcastBlockMode` 側で **同一値の再 broadcast を抑制**（HTTP・dev
  key・タイトル監視の 3 経路が並走しても無害）
- 自分（Electron）のウィンドウに対しては反応しない（`selfPids` で除外）

**設定オーバーライド（再ビルド不要、env のみ）:**

| 環境変数 | 既定 | 用途 |
|---|---|---|
| `NINJA_TITLE_WATCHER` | `on` | `off` で完全無効化 |
| `NINJA_TITLE_PATTERNS` | `YouTube,Twitter,TikTok,…` | カンマ区切りの正規表現 |
| `NINJA_TITLE_BROWSERS` | `chrome.exe,msedge.exe,…` | 監視対象プロセス名 |
| `NINJA_TITLE_POLL_MS` | `1200` | ポーリング間隔（小さくすると反応速いが CPU 微増） |
| `NINJA_TITLE_TICKS_TO_BLOCK` | `1` | block-on 確定までの連続マッチ回数 |
| `NINJA_TITLE_TICKS_TO_UNBLOCK` | `1` | block-off 確定までの連続不一致回数 |
| `NINJA_BLOCK_PORT` | `7727` | HTTP bridge ポート |

---

## 6.6 トレイ常駐（system tray）

`electron/tray.ts` がシステムトレイにアイコンを常駐させ、アプリのライフ
サイクル全体を制御する。**Quit Ninja2** メニュー項目以外でアプリは終了
しない（ウィンドウの × は hide 動作）。

### 起動経路

| 経路 | argv | 挙動 |
|---|---|---|
| 通常起動（ショートカット） | `Ninja2.exe` | Launcher window + Tray + 任意で companion |
| OS auto-start | `Ninja2.exe --hidden` | Launcher 非表示、companion + Tray のみ |
| 二重起動 | (任意) | `requestSingleInstanceLock` で 2 つ目はすぐ終了し、既存インスタンスの Launcher を前面化 |

### 自動起動

- **初回起動時に自動的に ON** にする（`hasCompletedFirstRun` センチネル）
- トレイの「Start with Windows」チェックボックスでいつでも切替可能
- `app.setLoginItemSettings({ openAtLogin, openAsHidden: true, args: ["--hidden"] })`
  で Windows / macOS のログインアイテムに登録
- 設定は `app.getPath("userData")/settings.json` に永続化（`autoStart`,
  `hasCompletedFirstRun`, `lastSpritePx`）

### トレイメニュー

```
Ninja2 — running / hidden    (状態ラベル)
─────────────────────────────
Hide ninja / Show ninja      (companion 表示トグル)
Open settings…               (Launcher を表示)
─────────────────────────────
Block mode  ▸  Currently: ON/OFF
                Force ON
                Force OFF
─────────────────────────────
☑ Start with Windows         (auto-start トグル)
─────────────────────────────
Open user data folder        (settings.json 等の調査用)
Reload assets                (DEV のみ表示)
─────────────────────────────
Quit Ninja2                  (実際に終了する唯一の経路)
```

### 左クリック / ダブルクリック

- **左クリック**: companion の表示・非表示を即トグル（軽い操作）
- **ダブルクリック**: Launcher を前面化（設定や状態確認用）

### アイコン

`assets/tray.ico`（Windows）と `assets/tray.png`（macOS / Linux）を参照。
両方とも `idle.png` から `scripts/build-tray-icon.py` で自動生成する：

```powershell
py -3 scripts/build-tray-icon.py
```

ファイルが見つからない場合は 1×1 透過 PNG をフォールバックとして使い、
警告ログを出すので tray の生成自体は失敗しない（後から差し替え可）。

### 信頼性の配慮

- `app.requestSingleInstanceLock()` を `app.whenReady()` より前に取得
- `setLoginItemSettings` 失敗時はトレイチェックボックスを実際の OS 状態に再同期
- `Tray()` 生成失敗（X11 なし環境など）でも main は続行
- すべての Window close は `wantsQuit=false` のとき hide に preventDefault

---

## 7. ファイル構成

```
src/companion/
├ App.tsx                         # ルート、デバッグ行
├ useDevAnimPreview.ts            # dev key (W/P/S/Shift+S/M/R/L/K/B) → behavior
├ engine/
│  ├ types.ts                     # CompanionAction / CompanionState
│  ├ timing.ts                    # 確率テーブル（DEV/PROD）
│  └ useCompanionBehavior.ts      # autonomous loop + begin* メソッド
└ ninja/
   ├ ninjaActionAssets.ts         # アクション定義 + 定数
   ├ frames/
   │  ├ frameAssetUrl.ts          # FRAME_ASSET_REV（cache bust）
   │  └ frameTierCatalog.ts       # tier (h53/h70/h106) 解決
   └ render/
      ├ NinjaSpriteRenderer.tsx   # Sprite 描画
      ├ ninja-renderer.css        # 共通 CSS（action 別 CSS なし）
      └ useNinjaActionLayers.ts   # 全 state machine
```

---

## 8. 拡張ポイント

新規アクション追加時は以下を順に進める:

1. リファレンスシートを extract で展開
2. マゼンタで 1 ポーズずつ生成
3. `import-*-from-magenta-cells.py` を作成し取り込み
4. `ninjaActionAssets.ts` に action 定義 + 必要なら timing 定数 + `REQUIRED_NINJA_STEMS` 追記
5. `useNinjaActionLayers.ts` に state machine の `useEffect`
6. `useCompanionBehavior.ts` に `begin*` + autonomous の `pickPostIdleAction`/`run*`
7. `useDevAnimPreview.ts` に dev key
8. `App.tsx` のデバッグ行
9. `FRAME_ASSET_REV` bump

renderer / CSS は触らないこと。

---

## 9. 既知の未配線

- `run` の autonomous 発動（現状 dev key 専用）。必要なら `timing.runChance` を追加して `pickPostIdleAction` の累積に組み込む。
