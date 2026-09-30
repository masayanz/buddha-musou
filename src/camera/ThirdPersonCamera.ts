import { PerspectiveCamera, Vector3 } from 'three';
import { GRAPHICS_CONFIG } from '../config/graphics';
import { BATTLEFIELD, moveOnBattlefield } from '../world/battlefield';

export class ThirdPersonCamera extends PerspectiveCamera {
  private readonly anchor = new Vector3();
  private strength = 0;
  private elapsed = 0;
  private impulse = 0;
  private yaw = Math.PI;
  private targetYaw = Math.PI;
  private manualTime = 0;
  private boom = 10.2;

  /** Stable horizontal heading; excludes shake and perspective projection. */
  get heading(): number { return this.yaw; }

  constructor() {
    super(GRAPHICS_CONFIG.camera.fov, 1, GRAPHICS_CONFIG.camera.near, GRAPHICS_CONFIG.camera.far);
    this.follow(0, 0, 0, true);
  }

  follow(x: number, z: number, dt: number, snap = false, travelHeading?: number): void {
    const blend = snap ? 1 : 1 - Math.exp(-7 * dt);
    const anchor = moveOnBattlefield(this.anchor.x, this.anchor.z, (x - this.anchor.x) * blend, (z - this.anchor.z) * blend, 0.35);
    if (snap) this.anchor.set(x, 0, z);
    else { this.anchor.x = anchor.x; this.anchor.z = anchor.z; }
    this.elapsed += dt;
    if (snap) {
      this.strength = 0; this.impulse = 0; this.manualTime = 0;
      this.yaw = this.targetYaw = travelHeading ?? Math.PI;
      this.boom = 10.2;
    }
    this.manualTime = Math.max(0, this.manualTime - dt);
    if (travelHeading !== undefined && this.manualTime === 0) this.targetYaw = travelHeading;
    const angle = Math.atan2(Math.sin(this.targetYaw - this.yaw), Math.cos(this.targetYaw - this.yaw));
    const rotation = angle * (1 - Math.exp(-4.5 * dt));
    this.yaw += Math.max(-2.5 * dt, Math.min(2.5 * dt, rotation));
    this.strength = Math.max(0, this.strength - dt * 2);
    this.impulse *= Math.exp(-5 * dt);
    const fov = GRAPHICS_CONFIG.camera.fov + this.impulse * 7;
    if (Math.abs(this.fov - fov) > 0.01) { this.fov = fov; this.updateProjectionMatrix(); }
    const distance = 10.2 + this.impulse * 0.7;
    const dx = -Math.sin(this.yaw) * distance, dz = -Math.cos(this.yaw) * distance;
    let fraction = 1;
    for (const box of BATTLEFIELD.obstacles) {
      const height = box.height ?? 12;
      let near = 0, far = 1;
      for (const [origin, delta, min, max] of [
        [this.anchor.x, dx, box.x - box.halfX - 0.35, box.x + box.halfX + 0.35],
        [1.8, 4.6, -0.35, height + 0.35],
        [this.anchor.z, dz, box.z - box.halfZ - 0.35, box.z + box.halfZ + 0.35],
      ]) {
        if (Math.abs(delta) < 1e-8) { if (origin < min || origin > max) { near = 2; break; } }
        else {
          const a = (min - origin) / delta, b = (max - origin) / delta;
          near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
        }
      }
      if (near < far && near < 1 && far > 0) fraction = Math.min(fraction, Math.max(0, near));
    }
    const safeDistance = Math.max(0, distance * fraction - (fraction < 1 ? 0.3 : 0));
    this.boom = snap || safeDistance < this.boom ? safeDistance : this.boom + (safeDistance - this.boom) * (1 - Math.exp(-6 * dt));
    const shake = this.strength * this.boom / distance;
    this.position.set(this.anchor.x - Math.sin(this.yaw) * this.boom + Math.sin(this.elapsed * 71) * shake,
      6.4 + Math.sin(this.elapsed * 93) * shake * 0.5, this.anchor.z - Math.cos(this.yaw) * this.boom);
    this.lookAt(this.anchor.x + Math.sin(this.yaw) * 1.8, 1.8, this.anchor.z + Math.cos(this.yaw) * 1.8);
  }

  orbit(amount: number): void { this.yaw += amount; this.targetYaw = this.yaw; this.manualTime = 1.2; }
  recenter(heading: number): void { this.targetYaw = heading; this.manualTime = 0; }
  shake(amount: number): void { this.strength = Math.min(0.35, Math.max(this.strength, amount)); }
  impact(amount: number): void { this.impulse = Math.max(this.impulse, amount); this.shake(amount * 0.28); }
}
