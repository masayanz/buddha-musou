import { LOOP_CONFIG } from '../config/graphics';

/** 全体で共有する固定更新と描画ループ。時刻はrequestAnimationFrameのms単位。 */
export class GameLoop {
  private frameId: number | null = null;
  private previousTime: number | null = null;
  private accumulator = 0;
  private running = false;

  constructor(
    private readonly fixedUpdate: (dt: number) => void,
    private readonly render: () => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.previousTime = null;
    this.accumulator = 0;
    this.frameId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.frameId = null;
    this.previousTime = null;
    this.accumulator = 0;
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    const delta = this.previousTime === null
      ? 0
      : Math.min(Math.max((now - this.previousTime) / 1000, 0), LOOP_CONFIG.maxFrameDelta);
    this.previousTime = now;
    this.accumulator += delta;

    while (this.accumulator >= LOOP_CONFIG.fixedDt && this.running) {
      this.accumulator -= LOOP_CONFIG.fixedDt;
      this.fixedUpdate(LOOP_CONFIG.fixedDt);
    }

    if (!this.running) return;
    this.render();
    if (this.running) this.frameId = requestAnimationFrame(this.frame);
  };
}
