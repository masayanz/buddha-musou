# 仏像無双（仮）

このリポジトリは、ブラウザで動作する「仏像 vs 落武者」の無双風3Dアクションゲームを、
Three.jsで実装するプロトタイプです。金色の仏像で群れを薙ぎ払い、1,000体撃破と三拠点の怨将討伐を目指します。

## 開発中の起動（Windows 11 / PowerShell）

Node.js 22.12以上とnpmを用意し、cloneしたフォルダーで実行します。

```powershell
cd D:\vsgame\buddha-musou
npm ci
npm run dev
```

表示されたURL（通常は `http://127.0.0.1:5173/`）をChrome / Edgeで開きます。
`npm run dev:open` なら開発サーバーの起動時に既定のブラウザーも開きます。停止は `Ctrl+C` です。
`index.html` を直接ダブルクリックして `file://` で開くとゲームは起動しません。

## Production確認

```powershell
npm run build
npm run preview
```

プレビュー用に表示されたURLをブラウザーで開きます。ビルド結果は `dist/` に出力されます。
GitHub Pages向けのビルドをWindows PowerShellで確認する場合は、引数を正しく渡すため次を実行します。

```powershell
npm.cmd run build -- --mode pages --base=/buddha-musou/
```

## ブラウザーで遊ぶ

[仏像無双をプレイ](https://masayanz.github.io/buddha-musou/) — PC・キーボード向け。インストール不要です（本家のGitHub Pages公開後）。

`masayanz/buddha-musou` の `main` 更新時に、GitHub Actionsが型チェック・テスト・ビルドを実行し、
成功したゲームの `dist/` だけをGitHub Pagesへ公開します。設定は `.github/workflows/pages.yml`。
公開用の `pages` モードでは戦闘効果音だけをコピーし、未使用の参考画像は含めません。
他のリポジトリではこの公開処理は実行されません。

## 現在の実装：Phase 1〜5

タイトル → 戦闘 → 1,000体撃破かつ怨将3体討伐でクリア / HP 0で敗北 → 再挑戦、の一連の流れを実装しています。
仏像と落武者はGeometryで生成し、落武者はInstancedMeshで描画します。
検証範囲と未確認事項は `docs/PROTOTYPE_REPORT.md` を参照してください。

2026-09-29の体験改善で、初期50体・目標70体の群集、踏み込み付きの高速連撃、空中への吹き飛ばし、
命中時のヒットストップ、金色の多層エフェクト、炎と煙の寺院、金属反射・影・ブルーム、墨と朱色のHUDを追加しました。
戦闘効果音は `public/assets/audio/` の自作OGGファイルをWeb Audioで再生します。
読み込み中やファイルが利用できない場合は、Web Audioの合成音に切り替わります。
多数の敵へ同時に命中しても、Hit音と死亡音は攻撃ごとにまとめて再生します。

追加改修で、進行方向へ回る背後追従カメラと回転ミニマップ、210×210の戦場を実装しました。
中央の門前から、焔の西院・鐘楼の東院・蓮華の南庭へ移動できます。建物や壁には衝突判定があり、敵も迂回します。
敵は雑兵（HP35）、武者（180）、重装兵（450）、怨将（1,800）。雑兵は通常一撃、怨将は吹き飛びにくく範囲攻撃を行います。

| 操作 | キー |
| --- | --- |
| 移動（入力開始時の画面基準） | WASD / 矢印キー |
| 視点旋回 / 背後へ戻す | Q・E / C |
| 通常攻撃（3段） | J（長押しでも連続） |
| 周囲への強攻撃 | K |
| 仏光陣 | 仏力100でL |
| 回避 | Space（入力方向、入力なしなら正面） |
| 一時停止 / 再開 | Esc |
| 効果音 ON / OFF | M または画面の「音」ボタン |
| FPSなどの確認 | F3 |
| 開始 / 再挑戦 | Enterまたはボタン |

敵の赤い予備動作が見えたら回避。通常攻撃で仏力を溜め、囲まれたら強攻撃や仏技で切り抜けられます。

## 開発環境と確認

タイトルで「出陣」を押すと戦闘が始まります。

```powershell
npm run typecheck
npm test
```

再現可能な依存インストールには、コミット済みの `package-lock.json` と `npm ci` を使用してください。
WebGLが利用できない場合は、画面に起動失敗メッセージを表示します。

### 構成

- `src/main.ts`：起動、エラー表示、開発時の再読み込み時の後片付け
- `src/game/Game.ts`：入力・描画・UIと戦闘シミュレーションの接続、リサイズ、破棄
- `src/game/GameSession.ts`：ブラウザーに依存しない移動・敵AI・攻撃・スポーン・ゲーム進行
- `src/game/GameLoop.ts`：単一の描画ループ、1/60秒の固定更新、最大delta 0.1秒
- `src/config/graphics.ts`：描画・ループ設定（PixelRatio上限1.5）
- `src/config/balance.ts`：移動・攻撃・仏力・敵・クリア条件の調整値
- `src/core/`：入力、固定容量ObjectPool、SpatialHashGrid
- `src/combat/`：コンボと範囲・ダメージ計算
- `src/world/`、`src/player/`、`src/enemy/`、`src/effects/`：Geometryによる描画
- `src/camera/ThirdPersonCamera.ts`：滑らかな追従、限定的なカメラ振動
- `src/ui/GameUI.ts`、`src/style.css`：タイトル、HUD、一時停止、リザルト、デバッグ表示
- `tests/`：戦闘、クリア・敗北・再挑戦、プール、空間検索、描画ループ、エフェクトの回帰テスト

非表示タブやフォーカスを失った場合は自動で一時停止します。戻ったらEscまたはボタンで再開してください。
ボイス、BGM、外部モデル、ゲームパッド、スマートフォン操作は今回の対象外です。

## 最初に読む順番

1. `GAME_SPEC.md`
2. `docs/TECH_DESIGN.md`
3. `docs/IMPLEMENTATION_PHASES.md`
4. `docs/ACCEPTANCE_TESTS.md`
5. `docs/CODEX_RUNBOOK.md`
6. `CONTRIBUTING.md`

Codexに最初に渡す指示は `CODEX_START.md` にあります。

## 今回のゴール

完成版ではありません。

プロトタイプでは次ができれば完成です。

- タイトル画面からゲーム開始
- 仏像キャラクターをWASDで操作
- 落武者が多数出現してプレイヤーへ接近
- Jで通常攻撃
- Kで強攻撃
- Lで仏技
- Spaceで回避
- 複数の敵が同時に吹き飛ぶ
- HP / 仏力 / COMBO / 撃破数を表示
- 1,000体撃破と三拠点の怨将討伐でステージクリア
- HP 0でゲームオーバー
- 再挑戦可能
- Chrome / Edgeで動作
- npm build / test / typecheck成功

## プロトタイプでは後回し

- 完成版3Dモデル
- モーションキャプチャ品質のアニメーション
- BGM
- 録音素材による本格的な効果音
- ボイス
- 複数ステージ
- 専用モデル・固有モーションを持つ完成版ボス（簡易中ボスは実装済み）
- レベルアップ
- スキルツリー
- 装備
- ストーリー
- スマホ対応
- オンライン

現在のキャラクター画像はデザイン参考資料です。
プロトタイプではThree.jsのGeometryを組み合わせた簡易3Dキャラクターを使用します。
デフォルメを完成形として固定せず、専用モデルへの移行方針は [造形の方針](docs/ART_DIRECTION.md) に記載しています。

## 技術

- Vite
- TypeScript
- Three.js
- Vitest
- HTML
- CSS

React / Vue / Unity WebGL / 重量級物理エンジンは使いません。

## GitHubへ登録

空のGitHubリポジトリを作成後、PowerShellで：

```powershell
git init
git add .
git commit -m "仏像無双プロトタイプの仕様一式を追加"
git branch -M main
git remote add origin <GitHubリポジトリURL>
git push -u origin main
```

共同開発ルールは `CONTRIBUTING.md` を参照してください。
