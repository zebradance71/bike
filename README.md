# NINJA — Silent Ninja Companion

小さな忍者がデスクトップに静かにいる、ミニマルな常駐コンパニオン。

## 開発

```bash
npm install
npm run dev
```

別ターミナルで Electron を起動する場合は `vite` の dev server が立ったあと:

```bash
npx electron .
```

（`vite-plugin-electron` 利用時は `npm run dev` で main も起動）

## 現在

- Phase 1: 起動 / 常駐 / idle・walk
- Phase 2: sit / smoke teleport

体験チェック: [docs/experience-check.md](docs/experience-check.md)

## 今後

- Phase 3: X / YouTube 検知リアクション（未実装）
