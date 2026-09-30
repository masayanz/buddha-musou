import './style.css';
import { Game } from './game/Game';

const root = document.querySelector<HTMLElement>('#game-root');
if (!root) throw new Error('ゲームの表示領域がありません。');

let game: Game | undefined;
try {
  game = new Game(root);
  game.start();
} catch (error) {
  game?.dispose();
  const message = document.createElement('section');
  message.className = 'boot-screen';
  message.setAttribute('role', 'alert');
  message.textContent = '3D画面を起動できませんでした。Chrome / EdgeのWebGL設定を確認し、再読み込みしてください。';
  root.replaceChildren(message);
  console.error('3D画面の起動に失敗しました。', error);
}

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => game?.dispose());
}
