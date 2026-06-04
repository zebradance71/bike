# Character import scripts

このリポジトリのデフォルトテンプレは **Bike2**（ブロック追従・タイヤ痕・idle 左下固定）です。

新規キャラでは `scripts/characters/bike/` を `scripts/characters/<characterId>/` にコピーし、各スクリプト内のパス定数（`CHAR_DIR` など）を差し替えてください。

フレーム import のマゼンタ手順は `.cursor/rules/ninja-frame-import.mdc`（compose 共通）と `design/bike-frame-prompts.md`（Bike 用 stem 一覧）を参照。
