# Character pack spec — 1 repo = 1 character = 1 .exe

このリポジトリは **デスクトップコンパニオン基盤 + 1 キャラクターパック** で 1 つの Windows アプリを構成する。
別キャラを出すときは **リポジトリを fork / clone して init-new-pack** する（ランタイム切替なし）。

---

## 1. 新規キャラの bootstrap

### Windows (PowerShell)

```powershell
.\tools\template\init-new-pack.ps1 `
  -CharacterId fox `
  -DisplayName Fox `
  -AppName FoxCompanion `
  -Author "Your Name" `
  -Description "A fox desktop friend"
```

### macOS / Linux

```bash
chmod +x tools/template/init-new-pack.sh
./tools/template/init-new-pack.sh fox Fox FoxCompanion
```

### 実行内容

| ステップ | 出力 |
|---------|------|
| テンプレ copy（再帰） | `src/companion/characters/<id>/` 一式（block chase / tire tracks / useLayers） |
| active 切替 | `src/companion/characters/active.ts` + `runBlockCursorChase` export |
| branding | `branding.json` |
| package name | `package.json` → `name` |
| placeholder idle | `src/companion/assets/frames/idle.png` |
| icons | `build/icon.ico`, `assets/tray.*` |

Bike2 から fork したときは **`-ClearPreviousPacks`** で既存 `characters/bike/` などを削除してから新 ID を展開する。

### テンプレに含まれるランタイム（Ninja 妨害ループではない）

- **ブロック ON**: カーソル追従（main `block-chase` tick）+ 全画面タイヤ痕オーバーレイ
- **idle**: 画面左下固定、`companionX/Y` ドラッグ保存
- **idle ビート**: V/E dev キー（振動・排気）
- **トレイ icon**: 既定 `block-idle` stem（`pack.trayIconStem`）

---

## 2. ディレクトリ契約

```
src/companion/
├── characters/
│   ├── types.ts          # CharacterPack interface（共通）
│   ├── active.ts         # ★ 唯一の compile-time 切替点
│   └── <characterId>/
│       ├── pack.ts
│       ├── actions.ts
│       ├── useLayers.ts
│       ├── blockCursorChase.ts
│       ├── CharacterPackRenderer.tsx
│       ├── tireTracks/useCharacterTireTracks.ts
│       └── frames/
│           ├── frameAssetUrl.ts
│           └── tierCatalog.ts
├── assets/frames/*.png   # スプライト（全 pack 共有パス）
├── engine/               # 自律行動（触らない）
└── frames/               # 汎用 DOM slot（触らない）

scripts/
├── pack-tools/           # frame import 共通
└── characters/
    └── <characterId>/    # import / extract スクリプト

branding.json             # appId, displayName, blockBridgePort
tools/template/           # init-new-pack, cursor-rules, itch テンプレ
```

---

## 3. フレーム import ワークフロー

### 共通ルール

- 背景は **#FF00FF マゼンタのみ**（透過 PNG 禁止）
- 参照シートを添付し **1 ポーズ 1 枚** 生成
- import 後ログ: `chroma sheet - key only, no black paint`
- `FRAME_ASSET_REV` を bump → `npm run dev` 再起動

### コマンド例（Bike pack — fork 後は `<id>` にコピー）

```powershell
# block-run（2×2）
py -3 scripts/characters/bike/import-block-run-from-magenta.py

# idle 振動 / 排気
py -3 scripts/characters/bike/import-idle-vibrate-from-magenta.py
py -3 scripts/characters/bike/import-idle-exhaust-from-magenta.py
```

Ninja 系（座る / mission / kunai）は `scripts/characters/ninja/`。compose 共通は `scripts/pack-tools/frame_import_common.py`。

### アイコン再生成

```powershell
npm run build:icons
```

---

## 4. アクション追加チェックリスト

1. `actions.ts` — `ActionDef` + `REQUIRED_STEMS` 更新
2. `useLayers.ts` — transient / loop ロジック
3. PNG import → `FRAME_ASSET_REV` bump
4. `devKey` を付ければ dev プレビューキー自動バインド
5. `npm run dev` で確認

---

## 5. ビルド & 配布

```powershell
npm install
npm run build:icons
npm run dist          # NSIS + ZIP → dist-app/
```

詳細: [build-distribution.md](./build-distribution.md)

### itch.io

**GitHub repo 設定（Release ワークフロー用）**

| 種別 | 名前 | 例 | 説明 |
|------|------|-----|------|
| Secret | `BUTLER_API_KEY` | `itchio_...` | [itch.io → API keys](https://itch.io/user/settings/api-keys) |
| Variable | `ITCH_USER` | `zebradance71` | プロフィール URL `https://itch.io/profile/NAME` の **NAME** |
| Variable | `ITCH_GAME` | `ninja2` | ゲーム URL `https://itch.io/USER/GAME-SLUG` の **GAME-SLUG** |
| Variable | `ITCH_CHANNEL` | `windows` | 省略時 `windows` |
| Variable | `ITCH_BUTLER_TARGET` | `zebradance71/ninja2:windows` | 上3つより優先（1行で指定） |

`invalid target (bad user)` = **ITCH_USER が itch のユーザー名と一致していない**（GitHub 名・表示名・URL 全体を入れている等）。

**手動アップロード（CI 失敗時・Release ZIP は GitHub から取得可）**

```powershell
$env:BUTLER_API_KEY = "..."
.\tools\template\itch-page\butler-upload.ps1 -User yourname -Game ninja2 -Channel windows
```

### GitHub Release

**タグ push（通常リリース）**

```powershell
# package.json version を bump → commit → push
git tag v0.1.5
git push origin v0.1.5
```

**手動実行（Actions → Release → Run workflow）**

| mode | 用途 | release_tag 入力値 |
|------|------|-------------------|
| `full` | ビルド + GitHub Release + itch | **`v0.1.6` のみ**（ラベル不要） |
| `itch-only` | itch 再 push のみ（ビルドなし） | 既存タグ **`v0.1.6` のみ** |

- GitHub Release 成功後、**itch 失敗でもワークフロー全体は成功**（itch ステップのみ warning）
- itch だけやり直す: mode=`itch-only`、release_tag=`v0.1.6`（**`release_tag:` は付けない**）

---

## 6. Cursor rules 同梱

新規 fork 時に `tools/template/cursor-rules/*.mdc` を `.cursor/rules/` にコピー:

```powershell
Copy-Item tools\template\cursor-rules\*.mdc .cursor\rules\
```

---

## 7. fox-demo ブランチ（検証用）

main に merge せず、init-new-pack の動作確認用:

```powershell
git checkout -b fox-demo
.\tools\template\init-new-pack.ps1 -CharacterId fox -DisplayName Fox -AppName FoxDemo
npm run dev
# 確認後: main には merge しない
```

---

## 8. 関連ドキュメント

- [app-architecture.md](./app-architecture.md)
- [build-distribution.md](./build-distribution.md)
- [refactor-branding-targets.md](./refactor-branding-targets.md)
