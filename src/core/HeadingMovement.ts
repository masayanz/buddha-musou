/** Latch a world direction when keys change, so a following camera cannot steer held input. */
export class HeadingMovement {
  private lastX = 0;
  private lastZ = 0;
  readonly direction = { x: 0, z: 0 };

  update(right: number, back: number, heading: number): Readonly<{ x: number; z: number }> {
    if (right === 0 && back === 0) { this.reset(); return this.direction; }
    if (right !== this.lastX || back !== this.lastZ) {
      this.lastX = right; this.lastZ = back;
      const length = Math.max(1, Math.hypot(right, back));
      this.direction.x = (-Math.cos(heading) * right - Math.sin(heading) * back) / length;
      this.direction.z = (Math.sin(heading) * right - Math.cos(heading) * back) / length;
    }
    return this.direction;
  }

  reset(): void { this.lastX = 0; this.lastZ = 0; this.direction.x = 0; this.direction.z = 0; }
}
