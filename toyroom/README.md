# toyroom

おもちゃの目線で、夜の子供部屋をめぐる箱庭ゲーム（体験版・開発中）。

子どもが泣きながら寝た夜。一番のお気に入りだったスケーターのフィギュア「パーカー」が、丸めて捨てられた「がんばったで賞」を探して、巨大な部屋を旅する。

- 企画書: https://claude.ai/artifact/SAFTZZdq7PX592qyhCEEKi
- ルックテスト: https://claude.ai/artifact/WaaNy5iq3DqSN9ShdbQU4a
- 操作テスト: https://claude.ai/artifact/5QRkBB6uGePNLiWMJ3LUEr

## 開発

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # dist/ に静的ファイル
npm run build:single # dist-single/index.html に1枚で書き出し
npm run typecheck
```

`?debug` を付けて開くとカメラ調整のスライダーと負荷の表示が出ます（L キーで夕方と夜の切り替え、`window.__game.teleport(x, y, z, camYaw)` で移動）。

## 構成

- `src/game/Game.ts` 全体の組み立てとループ
- `src/game/Room.ts` 部屋と小物（仮モデル）と当たり判定
- `src/game/Hero.ts` 主人公の仮モデル、移動、アニメーション
- `src/game/CameraRig.ts` 三人称カメラ
- `src/game/Input.ts` キーボード、タッチ、ゲームパッド
- `src/game/Dialogue.ts` 黒帯の会話と選択肢
- `src/game/Post.ts` ポストエフェクトと画質段階
- `src/game/textures.ts` コード生成の素材
- `src/data/script.json` 台詞

単位は 1 = 10cm。主人公の身長は 12cm。部屋は `Room.ts` の `S = 5` で5倍にしてあり、相対的に主人公が小さく見える。

## フェーズ

- [x] 5-1 基盤: Vite、仮の部屋、歩き・ジャンプ・スケボー・カメラ、スマホ操作、会話の仕組み
- [x] 5-2 床・壁・布のスキャン素材、ラジコン「ダッシュ」の運転とライト、机の下の段ボール洞窟とロボット「ガチャ」、本のスロープからベッドの丘へ、ウサギ「ミミ」、賞の欠片2つ
- [x] 5-3 オープニング（寝ている子ども、窓の下の紙）、枕元の貼り直しと一筆選び、おもちゃたちの描き足し、朝への切り替え、独白、終了画面。綿の雲とベッドサイドのランプ、天井とドア
- [ ] 5-4 本番モデルへの差し替え
- [ ] 6 磨き込み
