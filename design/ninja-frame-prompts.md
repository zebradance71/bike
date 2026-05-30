# NINJA 差分フレーム — 画像生成プロンプト

**参照元（必須）:** `src/companion/assets/char-concept-e-refined.png`  
**または:** `design/char-concepts/images/char-concept-e-refined.png`

clip-path リグは使用しない。同一キャラの差分 PNG のみ。

---

## 全フレーム共通 — 先頭に必ず付ける

```
[REFERENCE LOCK]
Use the attached reference image as the ONLY character design source.
Same chibi ninja: large round navy hood head, beige face opening, large black oval eyes with small white highlights (exact same eye shape and highlight position as reference), red forehead headband with knot and two short tails on viewer-left, deep navy gi with subtle fabric grain texture, red obi belt, small beige hands, stubby navy legs and rounded boot feet, soft oval ground shadow.
Same head-to-body ratio as reference (~1:1 chibi). Same colors: deep navy #1a2433, red #c41e2a, beige skin #e8b89a.
Same art style: soft 3D shading, NO black outlines, minimal cozy desktop companion, NOT anime, NOT realistic, NOT different character.
Full body visible, front-facing or very slight 3/4 (max 5 degrees), centered in frame.
Transparent background, no floor, no props, no text.
Output size and character scale MUST match reference (character occupies same % of canvas).
```

## 全フレーム共通 — Negative prompt

```
different character, new design, style change, anime style, manga screentone, harsh black outlines, realistic human, tall proportions, small head, different eye shape, different colors, green outfit, sword, weapon, shuriken, dramatic expression, angry, crying, open mouth smile, teeth, excessive detail, glowing effects, motion blur, speed lines, background, gradient background, cropped body, multiple characters, duplicate, deformed hands, extra limbs, low quality, blurry
```

## 技術メモ（生成後の処理）

- 背景: 四隅 flood fill 透明（`scripts/process-ninja-sprite.py` と同方針）
- 配置: 全フレームで足元・頭頂の位置を idle に揃える（sprite 基準点: bottom-center）
- ファイル名: `src/companion/assets/frames/idle.png`（既存流用）, `walk-1.png` … `peek-3.png`

---

## 1. Idle（4 frames + blink）— 商品ループ

**主役:** `idle-1.png` を常時表示（最も綺麗な基準）。

**ループ（実装）:** `idle-1` + **CSS 呼吸** + 稀に `idle-3` 420ms + `blink` 140ms。  
1→2→3→4 の画像サイクルは使わない（差分ショーケース禁止）。

| アセット | 役割 |
|----------|------|
| idle-1 | ヒーロー（メイン表示） |
| idle-2/4 | 比較・生成用（ループ非使用、呼吸は CSS） |
| idle-3 | 12–18s に1回・約420ms の柔らか空気 |
| blink | 10–40s / 140ms |

**CSS:** `translateY(-2px)` + `scaleY(1.01)` @ 4.5s ease-in-out

---

## 1b. Look around（4 frames）— 待機パターン2

**生成済み:** `look-1.png` … `look-4.png`

**実装:** idle 中に低頻度（30–90s）で `1→2→3→4→idle`、各 380ms。dev **L** で即再生。

| フレーム | 内容 |
|----------|------|
| look-1 | ニュートラル（idle 基準） |
| look-2 | 左見（頭 8–12°・目左・微好奇心） |
| look-3 | 右見 |
| look-4 | 中央へ戻る |

---

## 2. Walk（4 frames）— トコトコ・右へ進む（v2）

**v2 必須:** 真正面禁止。3/4 side view 25–35°、**右方向へ歩く**（前進が一目で分かる）。足踏み・立ち絵ズレ禁止。

**生成:** walk-1 アンカー → 2〜4。`walk-*-raw-v2.png` → `walk-*-raw.png` → `process-frame-sprites.py`

**磨き込み（再生成なし）:** `py -3 scripts/polish-walk-frames.py`

- 頭 bob: walk-1/3 UP 3px、walk-2/4 DOWN 5px（頭 3 + 重心 2）
- 目: walk-1/3 細め+前寄り、walk-2/4 やや広げ（マスク合成）
- ハチマキ尾: 1← 2↓ 3→ 4↓（2px オーバーレイ）
- バックアップ: `walk-*-pre-polish.png`

| フレーム | 構図 | 微表情 |
|----------|------|--------|
| walk-1 | 右足前・左足後・頭やや上・腕逆振り | 少し集中（目 3–5% sharper）mission mode |
| walk-2 | 通過・両足寄り・頭やや下 | 落ち着く・focus 弱め calm walk |
| walk-3 | walk-1 逆足（左前）・頭やや上 | walk-1 同様・集中 |
| walk-4 | 通過・ループ用・頭やや下 | idle 寄りニュートラルへ戻る |

### walk-1.png

```
3/4 ~30°, walking RIGHT. RIGHT foot forward, LEFT back. Opposite arm swing. Head UP. Lean 1-2°. Headband sway.
Eyes same shape, 3-5% sharper focus. Quiet mission. NOT front-facing.
```

### walk-2.png

```
Same 3/4 angle walking RIGHT. Passing: feet closer, head DOWN, lower COG.
Eyes same shape, calmer/weaker focus than walk-1.
```

### walk-3.png

```
Same 3/4 RIGHT. LEFT foot forward, RIGHT back. Head UP. Same focused expression as walk-1.
```

### walk-4.png

```
Same 3/4 RIGHT. Passing like walk-2, head DOWN. Expression neutral toward idle.
```

---

## 3. Sit（2 frames）— ちょっと休憩

**生成済み:** `sit-1.png`, `sit-2.png`（sit-2 本命 → sit-1）

**構図:** 正面寄り・**10–15°** のみ（walk の 3/4 ではない）。縮小座り禁止・ポーズで座る。

**表情:** 微表情のみ。眠すぎ・しょぼん・ギャグ・やりすぎマスコット NG。

| フレーム | ポーズ | 表情 |
|----------|--------|------|
| sit-1 | 座り始め・足やや前・頭やや下・肩ゆるむ | little rest・目 5–8% 柔らか・わずかなまぶた |
| sit-2 ★ | 安定座り・足前・胴低め・手膝/横・軽い猫背 | calm cozy break・idle より穏やか |

### sit-1.png

```
[SIT 1/2 — LOWERING] Front ~10-15°. Same character lock. NOT scale shrink.
Knees bending, legs forward starting, torso lowering, head slightly down, shoulders relaxed.
Eyes softer than idle, slight eyelid droop — NOT sleepy/sad/funny.
```

### sit-2.png

```
[SIT 2/2 — HERO REST] Front ~10-15°. Stable sit, legs forward, feet visible, slight slouch.
Hands on knees or sides. Calm cozy short break. Same canvas scale as idle.
```

---

## 4. Peek（3 frames）— 何してるの？（愛着ポイント）

**表情方針:** 大げさ禁止・**微表情のみ**。idle の顔から逸脱しない。驚き・笑い・ギャグ顔 NG。

| フレーム | 表情 |
|----------|------|
| peek-1 | 現状維持に近い・慎重気味 |
| peek-2 ★ | 目 5–8% 大きく感じ・視線やや上・calm curiosity「何してるの？」 |
| peek-3 | 少し引っ込み・「見つかったかも」程度（パニック・大げさ NG） |

### peek-1.png — 顔が出始める

```
[PEEK FRAME 1/3 — EMERGING — CAUTIOUS]
[REFERENCE LOCK] Same chibi ninja as char-concept-e-refined only.
Horizontal bottom cutoff 35-40%. Only head + tiny upper hood above edge. No full body.
Face just rising — slightly LESS visible than peek-2 (lower, less hood).
Expression: VERY close to idle. Cautious careful peek. Minimal micro-expression. Eyes almost same size as idle. NOT surprised, NOT silly, NO gag.
Transparent background.
```

### peek-2.png — 覗き込み（ホールド）★ 最初に生成

```
[PEEK FRAME 2/3 — HOLD — SUBTLE MICRO-EXPRESSION]
[REFERENCE LOCK] char-concept-e-refined.png as ONLY design source.

Composition: horizontal cutoff bottom 35-40%. ONLY head, face, headband, small upper hood/shoulders above line. No full body.
Head centered, slight forward lean 2-3°.

SUBTLE EXPRESSION ONLY:
- Same oval eye shape; 5-8% visually larger/wider feeling only
- Gaze slightly upward within eyes (looking up at user)
- Calm curiosity 「何してるの？」 affection, lives-on-desktop vibe
- NOT surprised, NOT laughing, NO gag, NO open mouth, NO teeth

Style: deep navy hood, red headband knot + two tails viewer-left, beige face, two white highlights same positions, soft 3D, no black outlines.
Transparent background.
```

**推奨 settings:** denoise 0.28–0.38 / reference lock strong / same character priority

### peek-3.png — 隠れる

```
[PEEK FRAME 3/3 — RETRACTING — FOUND?]
[REFERENCE LOCK] Same character as peek-2 and idle.
Head lowering below edge — LESS face visible than peek-2.
Subtle micro-expression: soft shy retreat, gentle「見つかったかも」. Eyes slightly softer/smaller feeling than peek-2, SAME shape as idle. NOT panicked, NOT exaggerated.
Transparent background.
```

---

## 5. Smoke

**画像不要** — `idle.png` + 既存 CSS（fade / 小煙 / teleport / fade in）。

---

## 生成ワークフロー推奨

**最初の看板: peek-2.png**（愛着ポイント・別キャラ判定に最適）

1. **img2img** または **reference + edit**: 必ず `char-concept-e-refined.png` を添付、denoise 低め（0.25〜0.40）
2. **peek-2 合格** → peek-1 / peek-3 を「same character as peek-2 + pose change」で生成
3. 次に walk-1 → walk 2〜4、sit-1 → sit-2
4. 崩れたフレームは破棄（別キャラ化はゼロ容認）

## 実装時メモ（将来・今はしない）

- walk: 4枚を 150〜220ms で `steps()` 切替 + ウィンドウ横移動
- sit / peek: 低頻度
- dev ホットキー I/W/S/P/M 維持
- clip-path リグ削除
