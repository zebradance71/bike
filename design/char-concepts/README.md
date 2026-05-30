# キャラ案 — 画像ファースト

**方針変更:** コード/SVG で形をこねるのは一旦停止。  
**先に** 完成に近いキャラの「方向」を **画像** で作り、縮小して判断する。

## 目的（2つ同時）

1. **0.3秒で忍者** と分かる  
2. **PCに住み着いてほしい**（相棒・欲しい）

## 判断のしかた

1. `preview.html` を開く  
2. 各案を **48px → 64px → 96px** の順で見る（実運用はこの付近）  
3. 0.3秒テスト:
   - 忍者？
   - 四角い汎用キャラではない？
   - 欲しい / 相棒？
   - 敵・雑魚ではない？

## 案一覧（AI ラフ）

| ID | 方向 | ファイル |
|----|------|----------|
| A | Cozy squat — 2頭身・indie NPC 寄り | `images/char-concept-a-cozy-squat.png` |
| B | Edge peek — 端に覗く相棒 | `images/char-concept-b-edge-peek.png` |
| C | Chibi read — 小サイズ可読性最優先 | `images/char-concept-c-chibi-read.png` |
| D | Warm companion — 愛着・暖色ライト | `images/char-concept-d-warm-companion.png` |
| E | Silhouette icon — 記号の強さ | `images/char-concept-e-silhouette-icon.png` |

※ 完成度はラフ。採用案が決まってから手描き修正 → sprite 化。

## 共通ルール（全案）

- deep navy / charcoal（黒単色禁止）
- 赤ハチマキ
- 刀なし
- 2〜3頭身
- 敵キャラ・雑魚感なし

## 採用方向（確定）

- **本命 E**（Silhouette Icon）85%  
- **D**（Warm Companion）15% — 愛着・柔らかさ  

リファイン画像: `images/char-concept-e-refined.png`  
48px テスト: **`preview-refined.html`**

## アプリ ICON（確定）

- **ソース:** `design/icon/app-icon-source.png`（run ポーズ・chibi）  
  フォールバック: `design/icon/app-icon.svg`（シルエット）
- **生成:** `npm run build:icons` → `build/icon.ico`（EXE）+ `assets/tray.*`（トレイ）
- **itch カバー:** `npm run build:itch-cover` → `design/icon/itch-cover.png`

## 次のステップ

1. 48px でリファインを確認  
2. OK → 必要なら `design/icon/app-icon.svg` を手描き修正  
3. その後 **初めて** スプライト実装（`idle.png` 系）

## 検証用仮実装（アプリ）

`char-concept-e-refined.png` を companion に表示中（最終採用前）。

- 標準 **64px**
- dev のみ: キー **4** = 48px / **6** = 64px / **9** = 96px / **S** = サイクル
- 右上に小さく `48px` 等のヒント（設定画面ではない）

背景処理の再実行（**必ず** `char-concept-e-refined-original.png` から）:

```bash
py -3 scripts/process-ninja-sprite.py
```

- 外側背景: 四隅 flood fill のみ  
- 足元ベージュ: 画像下 18% のみ  
- 顔・目・ハイライト: 除去しない

**今はアプリの `NinjaSvg` は触らない。**
