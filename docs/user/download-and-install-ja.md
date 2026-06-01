# Ninja2 — ダウンロード・インストール（ユーザー向け）

## 必要環境

- **Windows 10 / 11（64-bit）**
- ARM PC（Surface Pro X 等）では **未対応**（起動時に案内が出ます）
- インターネット常時接続は **不要**（localhost のみ使用）

---

## どれをダウンロードする？

| 配布先 | ファイル | 向いている人 |
|--------|----------|--------------|
| **itch.io** | **ZIP のみ** | そのまま展開して使う |
| **GitHub Release** | `Ninja2-x.y.z-win64.zip` | 同上 |
| **GitHub Release** | `Ninja2-x.y.z-setup-x64.exe` | インストーラ（SmartScreen が厳しい場合あり） |
| **GitHub Release** | `Ninja2-x.y.z-portable-x64.exe` | 単体 exe |

**itch.io では ZIP だけ**配布しています（exe インストーラは SmartScreen で保存できないことが多いため）。

---

## itch.io / ZIP 版（メイン）

1. **Download** で ZIP を保存
2. ZIP を **右クリック → すべて展開**
3. 展開後の構成:

```
README.txt
Ninja2/
  Start Ninja2.bat   ← これをダブルクリック（おすすめ）
  README.txt
  Ninja2.exe
  licenses/          ← ライセンス文書
  locales/
  resources/
  *.dll / *.pak      ← 削除しない（Electron 必須）
```

4. **`Ninja2` フォルダ**を開き **`Start Ninja2.bat`** または **`Ninja2.exe`** を実行

※ `.dll` / `.pak` は exe の横に必要なため、**これ以上きれいには整理できません**（Discord 等と同じ）。

---

## GitHub — インストーラ（setup .exe）

1. `Ninja2-…-setup-x64.exe` を実行
2. Edge で SmartScreen が出たら **`Ctrl+J` → `…` → 保持**（FAQ の「詳細情報」では進めません）
3. 実行時 SmartScreen → **詳細情報 → 実行**

---

## 起動したか確認

- タスクバー右下（^）の **トレイ** に忍者アイコン
- 左クリック → コンパニオン表示 / 非表示
- 右クリック → メニュー（Block mode、終了 など）

**何も見えないとき**

1. トレイの ^ を開く
2. もう一度 `Start Ninja2.bat` を実行
3. ログ: トレイ → **Open user data folder** → `logs\startup.log`

---

## PowerShell で取得（Edge が ZIP もブロックするとき）

```powershell
$ver = "0.1.10"
$zip = "$env:USERPROFILE\Downloads\Ninja2-$ver-win64.zip"
Invoke-WebRequest -Uri "https://github.com/zebradance71/NINJA/releases/download/v$ver/Ninja2-$ver-win64.zip" -OutFile $zip
Expand-Archive -Path $zip -DestinationPath "$env:USERPROFILE\Downloads" -Force
Unblock-File "$env:USERPROFILE\Downloads\Ninja2\Ninja2.exe"
Start-Process "$env:USERPROFILE\Downloads\Ninja2\Start Ninja2.bat"
```

---

## よくあるつまずき

| 症状 | 対処 |
|------|------|
| itch / Edge で exe が保存できない | **ZIP を使う**（itch は ZIP のみ） |
| Edge SmartScreen「詳細情報」→ FAQ | **`Ctrl+J` → 保持** または PowerShell |
| zip から直接起動 | **必ず展開**してから `Start Ninja2.bat` |
| 2 回目クリックで反応しない | トレイを確認（既に起動中） |

---

## アンインストール

ZIP 版: `Ninja2` フォルダを削除。  
インストーラ版: **設定 → アプリ → Ninja2 → アンインストール**
