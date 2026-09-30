const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyJ', 'KeyK', 'KeyL', 'Space', 'KeyQ', 'KeyE', 'KeyC', 'KeyM',
]);

export class InputManager {
  private readonly held = new Set<string>();
  private readonly pressed = new Set<string>();

  constructor(private readonly isPlaying: () => boolean) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.clear);
  }

  isDown(...codes: string[]): boolean {
    return codes.some((code) => this.held.has(code));
  }

  consume(code: string): boolean {
    return this.pressed.delete(code);
  }

  endFrame(): void { this.pressed.clear(); }

  readonly clear = (): void => {
    this.held.clear();
    this.pressed.clear();
  };

  dispose(): void {
    this.clear();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.clear);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target;
    if (target instanceof HTMLElement &&
      (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
    if (event.code === 'F3' || (this.isPlaying() && GAME_KEYS.has(event.code))) event.preventDefault();
    if (event.repeat) return;
    this.held.add(event.code);
    this.pressed.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.held.delete(event.code);
  };
}
