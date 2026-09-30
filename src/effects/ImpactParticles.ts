import { AdditiveBlending, Color, DynamicDrawUsage, InstancedMesh, MeshBasicMaterial, Object3D, TetrahedronGeometry } from 'three';

interface Spark { active: boolean; x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; size: number; spin: number }

/** Fixed-size GPU batch: even a full crowd launch allocates no new render objects. */
export class ImpactParticles extends InstancedMesh<TetrahedronGeometry, MeshBasicMaterial> {
  private readonly sparks: Spark[] = [];
  private readonly dummy = new Object3D();
  private cursor = 0;

  constructor() {
    super(new TetrahedronGeometry(1), new MeshBasicMaterial({ color: 0xffffff, blending: AdditiveBlending, transparent: true, depthWrite: false }), 480);
    this.instanceMatrix.setUsage(DynamicDrawUsage);
    this.frustumCulled = false;
    for (let i = 0; i < 480; i++) {
      this.sparks.push({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, size: 0, spin: 0 });
      this.setColorAt(i, new Color(i % 4 === 0 ? 0xff5b16 : i % 3 === 0 ? 0xffae32 : 0xffefb2));
    }
    this.reset();
  }

  burst(x: number, z: number, count: number, power: number, heading?: number): void {
    for (let i = 0; i < count; i++) {
      const spark = this.sparks[this.cursor++ % this.sparks.length];
      const angle = heading === undefined ? Math.random() * Math.PI * 2 : heading + (Math.random() - 0.5) * 2.7;
      const speed = (0.3 + Math.random() * 0.7) * power;
      Object.assign(spark, { active: true, x, z, y: 0.4 + Math.random() * 1.5,
        vx: Math.sin(angle) * speed, vz: Math.cos(angle) * speed,
        vy: 2 + Math.random() * power * 0.65, age: 0, life: 0.3 + Math.random() * 0.55,
        size: 0.035 + Math.random() * 0.09, spin: Math.random() * Math.PI });
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.sparks.length; i++) {
      const p = this.sparks[i];
      if (p.active) {
        p.age += dt;
        p.active = p.age < p.life;
        p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt;
        p.vy -= 18 * dt;
        p.vx *= Math.exp(-2 * dt); p.vz *= Math.exp(-2 * dt);
      }
      const size = p.active ? p.size * (1 - p.age / p.life) : 0;
      this.dummy.position.set(p.x, Math.max(0.05, p.y), p.z);
      this.dummy.rotation.set(p.spin + p.age * 8, p.spin, p.age * 6);
      this.dummy.scale.set(size, size * 4, size);
      this.dummy.updateMatrix();
      this.setMatrixAt(i, this.dummy.matrix);
    }
    this.instanceMatrix.needsUpdate = true;
  }

  reset(): void { this.cursor = 0; for (const spark of this.sparks) spark.active = false; this.update(0); }
  dispose(): void { this.geometry.dispose(); this.material.dispose(); super.dispose(); }
}
