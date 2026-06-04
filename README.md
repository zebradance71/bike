# Companion base (Bike2)

デスクトップ常駐コンパニオンの **1 repo = 1 キャラ** 基盤。既定パックは **Bike**（ブロック時カーソル追従・タイヤ痕・idle 左下固定＋ドラッグ）。

## 開発

```bash
npm install
npm run dev
```

## 別キャラにする（fork 後）

```powershell
.\tools\template\init-new-pack.ps1 -CharacterId fox -DisplayName Fox -AppName FoxCompanion -ClearPreviousPacks
```

詳細: [docs/character-pack-spec.md](docs/character-pack-spec.md)

## 主な dev キー（Bike pack）

- **B** — ブロック追従プレビュー
- **V** / **E** — idle 振動 / 排気

## 配布

```powershell
npm run build:icons
npm run dist
```

体験チェック: [docs/experience-check.md](docs/experience-check.md)

## リリース（GitHub + itch.io）

リポジトリ: [github.com/zebradance71/bike](https://github.com/zebradance71/bike)

`bike` リモートに **Secrets / Variables** を設定（`BUTLER_API_KEY`, `ITCH_BUTLER_TARGET` または `ITCH_USER` + `ITCH_GAME`）。詳細は [docs/character-pack-spec.md](docs/character-pack-spec.md) の itch 節。

```powershell
# version bump → commit 後
git tag v0.1.10
git push bike bike-main:main
git push bike v0.1.10
```

タグ push で Release ワークフローがビルド → GitHub Release → butler で itch に ZIP を載せます。
