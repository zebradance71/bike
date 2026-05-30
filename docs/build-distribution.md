# Ninja2 配布ビルド（Phase 1 — minimum）

無料公開 → itch.io 配布を想定した最小ビルド構成。コード署名 / 自動更新 /
ライセンス管理は Phase 2 以降で追加する。

---

## 0. 前提

- Node.js 20+（`electron-builder` 25 系の動作要件）
- Python 3.10+ ＆ Pillow（アイコン生成用）— なくてもビルドは通るがアイコンが
  プレースホルダになる
- Windows 10/11 64bit でのビルドを想定。クロスビルドは PR ベースの WSL でも
  可能だが本書では扱わない
- **Visual Studio Build Tools は不要** — `active-win` は N-API prebuild 同梱のため、
  `electron-builder.config.cjs` で `npmRebuild: false` にしている（ローカル dist 用）

---

## 1. 初回セットアップ

```powershell
cd c:\Users\strea\Develop\ToriiLabs\Ninja2

# 依存導入（electron-builder と terser が追加されている）
npm install

# Python + Pillow（一度だけ）
py -3 -m pip install Pillow

# アイコン生成（tray + アプリ両方）
npm run build:icons
```

`build/icon.ico`, `assets/tray.ico`, `assets/tray.png` ができる。

---

## 2. 配布ビルド

### A. インストーラ + ZIP 両方（推奨）

```powershell
npm run dist
```

`dist-app/` に以下が出力される:

```
dist-app/
├ Ninja2-0.1.0-x64.exe            # NSIS インストーラ（クリック→次へ→完了）
├ Ninja2-0.1.0-x64.zip            # ポータブル ZIP（解凍してそのまま起動可）
├ Ninja2-0.1.0-x64.exe.blockmap   # 差分更新用メタ（Phase 2 で活用）
└ latest.yml                       # auto-update 用メタ（Phase 2 で活用）
```

### B. インストーラのみ / ZIP のみ

```powershell
npm run dist:installer    # NSIS .exe のみ
npm run dist:portable     # ZIP + portable .exe のみ
```

### C. ディレクトリ展開（テスト用、起動して挙動確認）

```powershell
npm run dist:dir
# → dist-app/win-unpacked/Ninja2.exe を直接ダブルクリック
```

---

## 3. ビルド検証チェックリスト

`npm run dist` の **postdist** で `scripts/verify-dist.ps1` が自動実行されます（exe / tray / active-win win32 同梱を確認）。

手動:

```powershell
npm run dist:dir
pwsh -File scripts/verify-dist.ps1
```

インストーラを動かす前に確認:

- [ ] `dist-app/Ninja2-x.y.z-x64.exe` のサイズが ~120–180MB に収まっている（Electron ベース + active-win prebuild）
- [ ] インストーラのアイコンが忍者になっている（Explorer で右クリック → プロパティ）
- [ ] 起動後、システムトレイに忍者顔アイコンが出る
- [ ] 「Start with Windows」が ON で登録される
- [ ] PC を再起動しても auto-start でトレイに常駐する
- [ ] YouTube / X を開くと block-mode が発動する
- [ ] アンインストール（コントロールパネル → アプリ）でショートカット・Run キー・実行ファイルが消える
- [ ] `%APPDATA%\Ninja\` の `settings.json` は残っている（再インストール時の設定保持）

---

## 4. itch.io への公開

### A. プロジェクト作成

1. https://itch.io/game/new → 「Project type: Software」を選択
2. **Title**: `Ninja2` または好きな名前
3. **Project URL**: 例 `https://toriilabs.itch.io/ninja2`
4. **Short description**: 1 行紹介
5. **Classification**: `Tools`
6. **Pricing**: `No payments` → 後で `Pay what you want` / 固定価格に変更可

### B. ファイルアップロード

| ファイル | uploads タブで設定 |
|---|---|
| `Ninja2-x.y.z-x64.exe`（NSIS） | `This file will be played in the browser`: OFF、`Platform: Windows` |
| `Ninja2-x.y.z-x64.zip`（ポータブル） | 同上、 portable 派ユーザー向け |

両方をアップして、ユーザーが用途に応じて選べるようにすると親切。

### C. itch.io 用メタ

- **Cover image** (630x500): キャラのアートワーク
- **Screenshots** (1920x1080 推奨): デモ画面、ブロック動作のシーンなど
- **Trailer**: YouTube 動画 URL
- **Genre/Tag**: `productivity`, `desktop`, `companion`, `mascot`, `electron`, `japanese`

### D. README / 説明文に含めるべき項目

- 必要環境: Windows 10/11 64bit
- 容量: ~250MB（インストール後）
- 自動起動・トレイ常駐の動作説明
- localhost HTTP server (127.0.0.1:7727) を使用する旨と、**外部通信は一切行わない** ことの明記
- アンインストール手順
- 既知の制約 / 動作しないケース

itch.io ユーザーは技術リテラシーが高めなので、こうした情報は信頼性アップに直結する。

### E. 配布ライセンス文（itch.io の `EULA` フィールド）

最小構成のサンプル:

```
Ninja2 — End User License Agreement

Copyright © 2026 ToriiLabs. All rights reserved.

This software is provided "as is" without warranty of any kind. You may
install and use Ninja2 on any number of personal devices. Redistribution
of the binaries or any portion thereof is prohibited without prior
written consent.

Ninja2 communicates exclusively with localhost (127.0.0.1) on the user's
machine and does not transmit data over the public internet.
```

商用化フェーズで法務に確認して差し替える。

---

## 5. バージョン更新フロー

```powershell
# 1. バージョン bump
npm version patch    # 0.1.0 → 0.1.1
                     # または minor / major

# 2. ビルド
npm run dist

# 3. itch.io にアップロード（同じプロジェクトに新しいファイルを追加 → 古いのは
#    "Hide" にする / 削除する）
```

`auto-update` 配線は Phase 2。現状はユーザーが itch.io から手動再インストール。

---

## 6. Phase 2 で追加予定

| 項目 | 目的 |
|---|---|
| `electron-updater` | アプリ内で更新通知 → ワンクリック更新 |
| `electron-log` | ログを `userData/logs/` にローテート保存、`Open log folder` で開く |
| **コード署名（OV または EV）** | Windows SmartScreen 警告を消す、ユーザー信頼性向上 |
| Sentry / minidump | クラッシュ時のスタックトレース収集 |
| ライセンスキー | 商用化したい時の認証基盤 |
| 多言語化（i18next） | 海外ユーザー向け |

---

## 7. トラブルシュート

### `electron-builder` が `code signing identity` 関連で警告

→ 無視 OK。`win.signingHashAlgorithms` を設定していない＝無署名ビルドという宣言で、ビルド自体は通る。

### `Could not find any Visual Studio installation`（node-gyp / active-win）

→ `electron-builder` が native モジュールを再コンパイルしようとして失敗。
本リポジトリは `npmRebuild: false` で prebuild をそのまま使う設定。
それでも出る場合は `npm ci` のあと `npm run dist` を再実行。

### Block HTTP bridge（127.0.0.1:7727）

- **GET `/block`** — 状態読み取りのみ
- **POST `/block`** — `{ "on": boolean, "token": "<blockBridgeToken>" }` で ON/OFF
- トークン: トレイ → **Copy block bridge token**、または `userData/settings.json`
- `GET /block/on|off` は CSRF 対策で **405**

### Renderer ハードニング

- `sandbox: true` / navigation・popup ブロック（`electron/window-hardening.ts`）
- launcher preload は `startMission` のみ（`launcher-preload.ts`）
- smoke / kunai ウィンドウ拡張は sprite 幅 ×3 上限

### npm audit（high in devDependencies）

`electron-builder` / `node-gyp` / `tar` 経由の high は **ビルド時のみ**。
runtime 依存（`active-win` 等）に critical は無し。CI は `--audit-level=critical`。

### `active-win` の native binary が見つからない

→ `npm install` が走っていない、または `optionalDependencies` の OS 固有
バイナリが落ちていない。`npm install active-win --force` で再導入を試す。

### NSIS インストーラのサイズが大きすぎる

→ `node_modules` 内の不要なファイル（テスト・サンプル）は `files` フィルタで
除外。現状 `active-win/main` / `main-arm64`（macOS バイナリ）は除外済み。

### Smart Screen で「不明な発行元」警告

→ 無署名ビルドの宿命。回避策:
1. 「詳細情報」→「実行」をユーザーに案内
2. Phase 2 でコード署名導入
3. itch.io 経由でダウンロードしたファイルは Mark-of-the-Web が付き、警告強度
   が緩和される（ただし完全には消えない）

### 起動時に AntiVirus が誤検知

→ localhost HTTP server / 自動起動レジストリ登録のセットで一部 AV が反応
する事がある。Phase 2 で対応:
- 信頼できる証明書での署名
- 透明性のあるプライバシーポリシーを itch.io ページに掲載
