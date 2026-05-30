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
| テンプレ copy | `src/companion/characters/<id>/` |
| active 切替 | `src/companion/characters/active.ts` |
| branding | `branding.json` |
| package name | `package.json` → `name` |
| placeholder idle | `src/companion/assets/frames/idle.png` |
| icons | `build/icon.ico`, `assets/tray.*` |

---

## 2. ディレクトリ契約

```
src/companion/
├── characters/
│   ├── types.ts          # CharacterPack interface（共通）
│   ├── active.ts         # ★ 唯一の compile-time 切替点
│   └── <characterId>/
│       ├── pack.ts       # CharacterPack 実体
│       ├── actions.ts    # アクション catalog
│       ├── useLayers.ts  # 状態機械 → render layers
│       └── frames/
│           ├── frameAssetUrl.ts   # FRAME_ASSET_REV
│           └── tierCatalog.ts     # PNG stem 解決
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

### コマンド例（ninja pack）

```powershell
# S（座る）
py -3 scripts/characters/ninja/import-smoke-sit-from-magenta-cells.py

# RUN（2×2 シート）
py -3 scripts/characters/ninja/extract-run-cell-refs.py assets/run-sheet.png
py -3 scripts/characters/ninja/import-run-from-magenta-cells.py
```

旧パス `scripts/import-*.py` も互換シムとして動作する。

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

```powershell
py -3 tools/template/itch-page/generate-cover.py
# page-template.html を編集 → itch ページに貼付

$env:BUTLER_API_KEY = "..."
.\tools\template\itch-page\butler-upload.ps1 -User yourname -Game fox-companion
```

### GitHub Release

```powershell
git tag v0.2.0
git push origin v0.2.0
```

`.github/workflows/release.yml` がビルド → Release 資産アップロード。
`BUTLER_API_KEY` / `ITCH_USER` / `ITCH_GAME` を repo secrets/vars に設定すると itch へも push。

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
