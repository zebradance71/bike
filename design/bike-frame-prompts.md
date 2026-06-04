# BIKE フレーム — 画像生成プロンプト

**コンセプト**

| モード | バイク型 | 雰囲気 | カラー目安 |
|--------|----------|--------|------------|
| 通常 | Honda **CB400 Super Four** 風ネイキッド | 画面端で静か・相棒 | Honda: タンク **赤**、白/青ストライプ、シルバーフレーム、黒シート |
| ブロック | Suzuki **GSX-R1000** 風スーパースポーツ | カーソル追従・本気で邪魔 | Suzuki: **青×白**（MotoGP 風）または黒×黄アクセント |

- **ドット絵 / ピクセルアート** — 正方形ブロックの集合体（Minecraft / GBA 風）。大きなピクセルグリッド、硬いエッジ、グラデーション最小
- リアル写真・イラスト風・ソフト3Dシェーディングは禁止
- 各社ロゴ・商標文字は入れない。シルエットと配色で「Honda ネイキッド」「Suzuki レプリカ」が一瞬で分かる程度
- **透過 PNG 禁止** — 背景は常に `solid #FF00FF magenta background only, no transparency, no black, no checkerboard`
- **1ポーズ1枚**。2枚目以降は直前の採用フレームを参照ロック

---

## 全フレーム共通 — 先頭

```
[BIKE REFERENCE LOCK — 2枚目以降のみ]
Use the attached reference as the ONLY bike design source.
Same chibi proportions, same wheel size, same art style, same camera angle.
Only change pose/action as specified.

[STYLE — 全フレーム]
Retro pixel art motorcycle built from visible SQUARE COLOR BLOCKS (chunky voxels / 8–16px tiles).
Low resolution sprite look: limited palette (8–16 colors), NO smooth gradients, NO photorealism, NO soft 3D shading.
Side view facing RIGHT. Bike height ~50–60% of canvas; wheels on lower third.
Each part reads as stacked rectangles: tank, frame, engine block, wheels as circle-ish pixel clusters.
No rider, no text, no logos.
solid #FF00FF magenta background only, no transparency, no black, no checkerboard
Square 1:1 composition.
```

## Negative prompt（共通）

```
photorealistic, photo, 3D render, smooth gradients, airbrush, illustration, painted metal reflections,
anime cel shading, vector art, high detail, glossy render,
rider, person, helmet on seat, text, logo, watermark, Suzuki logo, Honda logo,
transparent background, checkerboard, gray background, black background,
multiple bikes, cropped wheels, motion blur, extreme perspective, front view, top view,
monster truck, car, bicycle, scooter, Harley cruiser only, dirt bike mud
```

---

## フレーム一覧（生成順）

| # | ファイル（magenta） | 用途 | 仕様 |
|---|---------------------|------|------|
| 1 | `idle-magenta.png` | 通常待機・基準 | CB400SF 風・停車・基準コマ |
| 1a | `idle-vibrate-a-magenta.png` | 振動 | 全体 2px 下ボブ + エンジン付近の短い振動線 |
| 1b | `idle-vibrate-b-magenta.png` | 振動 | 全体 2px 上ボブ（a と交互） |
| 1c | `idle-exhaust-a-smoke-only-magenta.png` | 排気 | **煙のみ**（バイク描かない）・マフラー後方左から |
| 1d | `idle-exhaust-b-smoke-only-magenta.png` | 排気 | 煙のみ・やや大きい |
| 2 | `block-idle-magenta.png` | ブロック待機 | GSX-R1000 風・低アグレッシブ構え・青白 |
| 3+ | `block-run-{a,b,c,d}-magenta.png` | ブロック追従 | スポーツバイク走行 2×2（後日） |

**通常 idle ループ（実装済）:** `idle` 常時 + 稀に vibrate / より稀に exhaust（自動）。

**dev 確認（`npm run dev`、Bike のみ）:** コンパニオンにフォーカス → **V** = 振動即再生、**E** = 排気即再生。画面上部ヒントにも表示。

import 後: `scripts/characters/bike/import-idle-from-magenta.py` 等 → `src/companion/assets/frames/*.png` → `FRAME_ASSET_REV` bump

---

## 2. block-idle（ブロック・GSX-R1000）— 生成済

**ポーズ:** 同ピクセル密度。前傾り、アグレッシブ。ヘッドライト ON（白ピクセル）。

**Suzuki 配色:** 青フェアリング + 白アクセント、黄色 or 黒の小アクセント。

```
Pixel-art Suzuki GSX-R1000 style full fairing sportbike, side view facing right.
Same square-pixel block style as idle reference. Blue+white fairing blocks, sharp nose, crouched race pose.
Headlight bright white pixels ON. No rider. solid #FF00FF magenta only.
```

---

## 1a–1d. idle 差分（振動・排気）

参照: `idle-magenta.png`。バイク本体は同一、差分のみ。

**排気（exhaust-a/b）必須:** ホイールベース・前後輪位置・接地線は idle と **完全一致**。マフラーから煙ピクセルのみ追加。ホイール間を詰めない・バイクを縮小しない。

import 後: `composite-exhaust-on-idle.py` — **idle.png そのまま** + 煙のみレイヤーを **後方マフラー（左下）** に合成。二重バイク禁止。

---

## 1. idle（通常・CB400SF）— 生成済

**ポーズ:** 画面下端に寄せた相棒感。キックスタンド気味にわずかに傾き、**静か**（排気・炎なし、ライトはオフまたは弱いアンバー一点）。

**Honda 配色:** 赤タンク + 白/青の細ストライプ、シルバー/グレーフレーム、黒シート、丸ヘッドライト（ネイキッド）。

**プロンプト本文:**

```
Pixel-art Honda CB400 Super Four style naked bike, side view facing right.
Built from visible square color blocks (retro game sprite). Round pixel headlight, blocky twin engine, no full fairing.
Honda colors as flat pixels: red tank, white+blue stripe blocks, gray frame blocks, black seat blocks.
Parked quietly — kickstand lean, calm mood. Headlight off (dark pixel circle) or single amber pixel.
No rider. Chunky 16-bit / GBA companion scale.
solid #FF00FF magenta background only, no transparency, no black, no checkerboard
```
