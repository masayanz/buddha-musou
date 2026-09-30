import { AdditiveBlending, BoxGeometry, BufferGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry, SphereGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { NORMAL_ATTACKS, STRONG_ATTACK, BUDDHA_SKILL } from '../config/balance';
import { ImpactParticles } from './ImpactParticles';

type EffectKind = 'slash' | 'strong' | 'skill' | 'hit' | 'death';
interface EffectSlot {
  mesh: Mesh<RingGeometry | SphereGeometry, MeshBasicMaterial>;
  kind: EffectKind; age: number; duration: number; active: boolean; angle: number; radius: number;
  glow: Mesh<RingGeometry | SphereGeometry, MeshBasicMaterial>;
  edge: Mesh<RingGeometry | SphereGeometry, MeshBasicMaterial>;
}

/** A bounded pool also keeps a mass hit from allocating dozens of render resources. */
export class EffectManager extends Group {
  private readonly slots: EffectSlot[] = [];
  private readonly ringGeometry = new RingGeometry(0.92, 1, 64);
  private readonly slashGeometries = NORMAL_ATTACKS.map((attack) => {
    const arc = attack.arcDeg * Math.PI / 180;
    return new RingGeometry(0.68, 1, 64, 1, -arc / 2, arc);
  });
  private readonly flashGeometry = new SphereGeometry(1, 6, 4);
  private readonly attackSlots = 8;
  private attackCursor = 0;
  private impactCursor = 0;
  private readonly sparks = new ImpactParticles();
  private readonly seal: Mesh<BufferGeometry, MeshBasicMaterial>;
  private sealAge = 2;

  constructor() {
    super();
    for (let i = 0; i < 72; i++) {
      const material = new MeshBasicMaterial({ color: 0xffd57b, transparent: true, opacity: 0, depthWrite: false, side: DoubleSide, blending: AdditiveBlending });
      const mesh = new Mesh(this.ringGeometry, material);
      mesh.visible = false; mesh.frustumCulled = false; this.add(mesh);
      const glow = new Mesh(this.ringGeometry, material.clone());
      const edge = new Mesh(this.ringGeometry, material.clone());
      glow.scale.setScalar(1.09); glow.position.z = -0.015;
      edge.scale.setScalar(0.82); edge.position.z = 0.02;
      mesh.add(glow, edge);
      this.slots.push({ mesh, glow, edge, kind: 'hit', age: 0, duration: 0, active: false, angle: 0, radius: 1 });
    }
    const pieces: BufferGeometry[] = [new RingGeometry(0.97, 1, 100), new RingGeometry(0.76, 0.775, 100), new RingGeometry(0.5, 0.51, 80)];
    // A geometric dharma seal: concentric gold hoops, spokes, and radial inscriptions.
    for (let i = 0; i < 32; i++) {
      const angle = i * Math.PI / 16;
      for (let j = 0; j < 3; j++) {
        const bar = new BoxGeometry(j === 0 ? 0.065 : 0.016, j === 0 ? 0.015 : 0.065, 0.006);
        bar.translate((j - 1) * 0.02, 0.87, 0);
        bar.rotateZ(angle); pieces.push(bar);
      }
      if (i % 4 === 0) {
        const spoke = new BoxGeometry(0.012, 0.2, 0.006);
        spoke.translate(0, 0.63, 0); spoke.rotateZ(angle); pieces.push(spoke);
      }
    }
    this.seal = new Mesh(mergeGeometries(pieces), new MeshBasicMaterial({ color: 0xffcf64, transparent: true, blending: AdditiveBlending, side: DoubleSide, depthWrite: false }));
    pieces.forEach((piece) => piece.dispose());
    this.seal.visible = false;
    this.add(this.sparks, this.seal);
  }

  emit(kind: EffectKind, x: number, z: number, rotation = 0, attackStep = 0): void {
    // Mass hit/death flashes must never evict the attack that produced them.
    const attack = kind === 'slash' || kind === 'strong' || kind === 'skill';
    const start = attack ? 0 : this.attackSlots;
    const end = attack ? this.attackSlots : this.slots.length;
    let slot: EffectSlot | undefined;
    for (let index = start; index < end; index++) {
      if (!this.slots[index].active) { slot = this.slots[index]; break; }
    }
    if (!slot) {
      const cursor = attack ? this.attackCursor++ : this.impactCursor++;
      slot = this.slots[start + cursor % (end - start)];
    }
    slot.active = true; slot.kind = kind; slot.age = 0; slot.angle = rotation;
    slot.radius = kind === 'skill' ? BUDDHA_SKILL.radius : kind === 'strong' ? STRONG_ATTACK.radius : NORMAL_ATTACKS[Math.min(2, Math.max(0, attackStep))].radius;
    slot.duration = kind === 'skill' ? 0.8 : kind === 'death' ? 0.55 : kind === 'hit' ? 0.16 : 0.32;
    slot.mesh.geometry = kind === 'hit' || kind === 'death' ? this.flashGeometry : kind === 'slash' ? this.slashGeometries[Math.min(2, Math.max(0, attackStep))] : this.ringGeometry;
    slot.mesh.position.set(x, kind === 'hit' || kind === 'death' ? 1.1 : kind === 'slash' ? 1 : 0.09, z);
    slot.mesh.rotation.set(-Math.PI / 2, 0, rotation - Math.PI / 2);
    slot.mesh.material.color.set(kind === 'death' ? 0xd9a85e : kind === 'skill' ? 0xffe9af : 0xffcd65).multiplyScalar(2.1);
    slot.mesh.material.opacity = 0.95;
    slot.mesh.scale.setScalar(kind === 'slash' ? slot.radius * 0.72 : kind === 'hit' ? 0.2 : 0.1);
    slot.mesh.visible = true;
    slot.glow.geometry = slot.edge.geometry = slot.mesh.geometry;
    slot.glow.visible = slot.edge.visible = attack;
    slot.glow.material.color.set(0xff6a0b); slot.glow.material.opacity = 0.35;
    slot.edge.material.color.set(0xfff5c8).multiplyScalar(2.4); slot.edge.material.opacity = 0.8;
    if (kind === 'hit') this.sparks.burst(x, z, 10, 10, rotation);
    if (kind === 'death') this.sparks.burst(x, z, 7, 8);
    if (kind === 'slash') this.sparks.burst(x, z, 22, 14, rotation);
    if (kind === 'strong') this.sparks.burst(x, z, 75, 20);
    if (kind === 'skill') {
      this.sparks.burst(x, z, 170, 28);
      this.sealAge = 0;
      this.seal.position.set(x, 3.8, z - 2);
      this.seal.scale.setScalar(0.5);
      this.seal.rotation.set(0, 0, 0);
      this.seal.visible = true;
    }
  }

  update(dt: number, cameraHeading = Math.PI): void {
    for (const slot of this.slots) {
      if (!slot.active) continue;
      slot.age += dt;
      const progress = slot.age / slot.duration;
      if (progress >= 1) { slot.active = false; slot.mesh.visible = false; continue; }
      slot.mesh.material.opacity = (1 - progress) * (slot.kind === 'death' ? 0.55 : 0.95);
      slot.glow.material.opacity = (1 - progress) * 0.3;
      slot.edge.material.opacity = (1 - progress) * 0.9;
      if (slot.kind === 'slash') {
        slot.mesh.scale.setScalar(slot.radius * (0.72 + progress * 0.35));
        slot.mesh.rotation.z = slot.angle - Math.PI / 2 - 0.5 + progress;
        slot.mesh.position.y = 1 + Math.sin(progress * Math.PI) * 0.6;
      } else if (slot.kind === 'strong' || slot.kind === 'skill') {
        const radius = slot.radius;
        slot.mesh.scale.setScalar(0.8 + Math.sin(progress * Math.PI / 2) * radius);
        slot.mesh.position.y = 0.09 + Math.sin(progress * Math.PI) * (slot.kind === 'skill' ? 0.5 : 0.15);
      } else {
        const size = slot.kind === 'hit' ? 0.12 + Math.sin(progress * Math.PI) * 0.35 : 0.2 + progress * 0.6;
        slot.mesh.scale.set(size, size * (slot.kind === 'death' ? 2 : 0.6), size);
        slot.mesh.position.y += dt * (slot.kind === 'death' ? 2.6 : 0.7);
        slot.mesh.rotation.z += dt * 6;
      }
    }
    this.sparks.update(dt);
    this.sealAge += dt;
    if (this.sealAge < 1.15) {
      const progress = this.sealAge / 1.15;
      this.seal.scale.setScalar(1 + Math.min(1, progress * 5) * 6);
      this.seal.rotation.z = progress * 0.25;
      this.seal.rotation.y = cameraHeading + Math.PI;
      this.seal.material.opacity = Math.min(1, progress * 12) * (1 - progress);
    } else this.seal.visible = false;
  }

  reset(): void {
    this.attackCursor = 0; this.impactCursor = 0;
    for (const slot of this.slots) { slot.active = false; slot.mesh.visible = false; }
    this.sparks.reset(); this.sealAge = 2; this.seal.visible = false;
  }
  dispose(): void {
    // A geometry may be unused by all slots at the instant of disposal.
    this.ringGeometry.dispose(); this.slashGeometries.forEach((geometry) => geometry.dispose()); this.flashGeometry.dispose();
    for (const slot of this.slots) { slot.mesh.material.dispose(); slot.glow.material.dispose(); slot.edge.material.dispose(); }
    this.sparks.dispose(); this.seal.geometry.dispose(); this.seal.material.dispose();
    this.clear();
  }
}
