import { COMBAT_CONFIG } from '../config/balance';

export class ComboSystem {
  value = 0;
  max = 0;
  private remaining = 0;
  get timeRemaining(): number { return this.remaining; }
  hit(): void {
    this.value++;
    this.max = Math.max(this.max, this.value);
    this.remaining = COMBAT_CONFIG.comboTimeout;
  }
  update(dt: number): void {
    this.remaining = Math.max(0, this.remaining - dt);
    if (this.remaining <= 1e-9) this.value = 0;
  }
  reset(): void { this.value = 0; this.max = 0; this.remaining = 0; }
}
