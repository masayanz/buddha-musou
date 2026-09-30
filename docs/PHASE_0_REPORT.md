# Phase 0 実装・検証結果

STATE: EXECUTED

PHASE: 0

確認日: 2026-09-29

## 実装内容

- Vite / TypeScript strict / Three.js / Vitestを導入し、依存バージョンとlockfileを固定。
- Scene、PerspectiveCamera、HemisphereLight、DirectionalLight、金色の確認用立方体、GridHelperを表示。
- requestAnimationFrameを1本に統一。固定更新1/60秒、最大フレーム差分0.1秒。
- ウィンドウにCanvasが追従。PixelRatio上限1.5。
- 非表示タブで停止、再表示時に時刻をリセット。disposeでリスナー、描画ループ、GPUリソースを解放。
- WebGL初期化失敗時の案内と、開発時のホットリロードの後片付けを実装。
- 元の基本ディレクトリと参考アセットを維持。Player / Enemy / Combatは未実装。

## 変更ファイル

- `package.json`、`package-lock.json`、`tsconfig.json`、`vite.config.ts`
- `index.html`、`src/main.ts`、`src/style.css`
- `src/config/graphics.ts`、`src/game/Game.ts`、`src/game/GameLoop.ts`
- `tests/GameLoop.test.ts`
- `README.md`、`docs/PHASE_0_REPORT.md`

## 検証

- install: 成功。Node.js 24.19.0 / npm 12.1.0。
- typecheck: 成功。
- test: 1ファイル、5件成功（多重起動防止、固定更新と端数、巨大delta制限、停止・再開、更新中の停止）。
- build: 成功。`dist/`生成。
- 手動確認（ブラウザー操作ツール）: ChromeとCodex内蔵ブラウザーで案内文、3D立方体、グリッドを表示。コンソールのerror / warnは0件。
- リサイズ: 内蔵ブラウザーで1280×720と1920×1080のCanvasサイズ追従を確認。
- パフォーマンス: Phase 0ではFPS計測対象外。50体での計測はPhase 5。

この実行環境ではnpmがPATHになかったため、公式npmレジストリから一時領域 `tmp/npm/` に取得し、
`node tmp/npm/package/bin/npm-cli.js run typecheck` / `test` / `run build` で同じnpm scriptsを実行した。
一時領域はGit管理対象外。通常のNode.js / npm環境ではREADMEのコマンドを使用する。

## 既知の問題・未確認事項

- ビルド時にJSチャンクが500 kBを超える警告あり（約535 kB、gzip約133 kB）。Three.jsを含む単一エントリー構成によるもの。ビルドと起動は成功。
- MANUAL CHECK REQUIRED: Edgeで起動・描画・コンソールを確認すること。今回のブラウザー接続にはEdgeがないため未実施。
- WebGL無効環境での起動失敗表示の実機確認は未実施。

## 次Phase

Phase 1: Ground、簡易仏像（Halo / Staff）、WASDと矢印キー、カメラ基準移動、ステージ境界、三人称追従カメラ。
