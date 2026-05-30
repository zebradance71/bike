# Ninja2 Block Watcher (Chrome / Edge extension) — *optional*

> ⚠️ **これはオプションの拡張機能です。** 本体側に **アクティブウィンドウ・タイトル監視**
> （`electron/title-watcher.ts`、`active-win` ベース）が組み込まれているため、
> 拡張をインストールしなくても X / YouTube 等を開いた時に忍者が反応します。
>
> 拡張を入れる利点は **URL ベースの精密判定**（タイトル監視は誤検知の余地あり）と
> **ブラウザがバックグラウンドでも判定が可能**な点です。タイトル監視は
> アクティブウィンドウのみが対象なので、別アプリ作業中にバックグラウンドの
> YouTube タブを検知したい場合は拡張も併用してください。

Active タブが「集中阻害サイト」（X / YouTube / 任意設定）に該当している間だけ、
Ninja2 デスクトップコンパニオンの **block-mode** を ON にするブラウザ拡張です。

コンパニオン側の loopback HTTP bridge（既定 `http://127.0.0.1:7727`）を叩くだけ
なので、ブラウザのブロッキングや DNS フィルタとは独立して動作します。

---

## 構成

```
tools/extension/
├ manifest.json     # MV3 manifest
├ background.js     # service worker（タブ監視 → bridge ping）
├ options.html      # 設定ページ（ブロック対象ホスト編集）
├ options.js
├ popup.html        # ツールバーアイコン押下時のステータス表示
├ popup.js
└ README.md         # この文書
```

---

## インストール（unpacked）

1. デスクトップアプリを起動：

   ```powershell
   cd c:\Users\strea\Develop\ToriiLabs\Ninja2
   npm run dev
   ```

   起動ログに `[ninja][block-http] listening on 127.0.0.1:7727` が出ることを確認。

2. Chrome / Edge で `chrome://extensions`（Edge は `edge://extensions`）を開く。
3. 右上の **Developer mode** を ON。
4. **Load unpacked** → このフォルダ（`tools/extension`）を選択。
5. ツールバーの忍者アイコン → **Options** で対象ホストとポートを調整。

ポート番号を変更する場合はデスクトップ側も合わせて：

```powershell
$env:NINJA_BLOCK_PORT = 17270
npm run dev
```

---

## 動作

- `chrome.tabs.onActivated` / `chrome.tabs.onUpdated`（active タブのみ）/
  `chrome.windows.onFocusChanged` / 1 分間隔の `alarms` で active タブの URL を
  監視。
- ホスト名が設定リストに **suffix match** したら `GET /block/on`、外れたら
  `GET /block/off` を 1 回ずつ送信（連打防止のため遷移時のみ）。
- ステートは `chrome.storage.session` に保存。Service worker がスリープ復帰
  しても整合する。
- ブリッジ到達失敗（コンパニオン未起動など）はコンソール warn のみ。アクション
  はブロッキングしない。

---

## 既定のブロックリスト

```
x.com
twitter.com
youtube.com
```

`x.com` と書けば `x.com` も `www.x.com` も `mobile.x.com` もマッチします。
`#` で始まる行は無視されるので、メモがてら無効化したい行はコメントアウト可。

---

## 手動テスト（拡張なし）

```powershell
curl http://127.0.0.1:7727/block       # 現在状態 {"ok":true,"blockMode":false}
curl http://127.0.0.1:7727/block/on    # 強制 ON（ブロック演出開始）
curl http://127.0.0.1:7727/block/off   # 強制 OFF（終了演出 → idle）
```

ブラウザ側からは popup の **Test ping** ボタンで `GET /block` を確認できます。

---

## Permissions

| 権限 | 理由 |
|---|---|
| `tabs` | active タブの URL 取得 |
| `storage` | ユーザー編集のホストリスト・ポートの保存 |
| `alarms` | service worker スリープ対策の 1 分 heartbeat |
| `host_permissions: http://127.0.0.1/*` | コンパニオン bridge への fetch |

ホストの全ページ閲覧権限（`<all_urls>`）は要求しません。

---

## 既知の制約

- Active タブが Chrome 内部ページ（`chrome://...`）や `about:blank` の場合は
  ホスト判定対象外（自動的に `block-off` 扱い）。
- `service_worker` は MV3 仕様で 30 秒程度でアイドル停止します。`alarms` での
  1 分復帰がフォールバックなので、スリープ復帰直後 1 分以内は遷移検出が
  遅延することがあります。
- `host_permissions` で `http://127.0.0.1/*` を要求するため、初回インストール時に
  ブラウザが警告を出します。loopback 専用なので外部送信は発生しません。

---

## ライセンス

リポジトリ本体に準じる。
