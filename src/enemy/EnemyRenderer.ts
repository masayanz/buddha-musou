import { BoxGeometry, CircleGeometry, Color, ConeGeometry, CylinderGeometry, Group, InstancedMesh, Matrix4, MeshBasicMaterial, MeshStandardMaterial, Object3D, RingGeometry, SphereGeometry, TorusGeometry } from 'three';
import type { BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { disposeScene } from '../utils/disposeScene';
import { ENEMY_CONFIG, ENEMY_KINDS, SPAWN_CONFIG } from '../config/balance';
import type { EnemyKind } from '../game/GameSession';

export interface EnemyPose {
  id: number; x: number; z: number; rotation: number; hp: number;
  state: 'inactive' | 'chase' | 'windup' | 'knockback' | 'dead'; timer: number; flash: number;
  y?: number; spin?: number;
  kind?: EnemyKind; maxHp?: number; scale?: number;
}

export class EnemyRenderer extends Group {
  private readonly pieces: { mesh: InstancedMesh; local: Matrix4; animate: 'body' | 'weapon' | 'shadow' }[] = [];
  private readonly rootTransform = new Object3D();
  private readonly temp = new Matrix4();
  private readonly weapon = new Object3D();
  private readonly color = new Color();
  private readonly capacity = SPAWN_CONFIG.maxEnemies;
  private readonly healthBack = new InstancedMesh(new BoxGeometry(1, 0.13, 0.055), new MeshBasicMaterial({ color: 0x100c13, depthTest: false }), SPAWN_CONFIG.maxEnemies);
  private readonly healthFill = new InstancedMesh(new BoxGeometry(1, 0.085, 0.065), new MeshBasicMaterial({ color: 0xffffff, depthTest: false }), SPAWN_CONFIG.maxEnemies);
  private readonly warningRing = new InstancedMesh(new RingGeometry(0.94, 1, 48), new MeshBasicMaterial({ color: 0xff3a20, transparent: true, opacity: 0.85, depthWrite: false }), SPAWN_CONFIG.maxEnemies);
  private readonly warningArea = new InstancedMesh(new CircleGeometry(0.94, 48), new MeshBasicMaterial({ color: 0xff3318, transparent: true, opacity: 0.18, depthWrite: false }), SPAWN_CONFIG.maxEnemies);

  constructor() {
    super();
    const armor = new MeshStandardMaterial({ color: 0x747b83, metalness: 0.65, roughness: 0.4 });
    const rust = new MeshStandardMaterial({ color: 0x951b14, metalness: 0.4, roughness: 0.5 });
    const skin = new MeshStandardMaterial({ color: 0xa08b71, roughness: 0.9 });
    const blade = new MeshStandardMaterial({ color: 0xb5bdb5, metalness: 0.65, roughness: 0.32 });
    const horn = new MeshStandardMaterial({ color: 0x997b45, metalness: 0.45, roughness: 0.6 });
    const local = new Object3D();
    const add = (geometry: BufferGeometry, material: MeshStandardMaterial | MeshBasicMaterial,
      x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, animate: 'body' | 'weapon' | 'shadow' = 'body', rz = 0): void => {
      const mesh = new InstancedMesh(geometry, material, this.capacity);
      mesh.frustumCulled = false;
      local.position.set(x, y, z); local.scale.set(sx, sy, sz); local.rotation.set(animate === 'shadow' ? -Math.PI / 2 : 0, 0, rz); local.updateMatrix();
      this.pieces.push({ mesh, local: local.matrix.clone(), animate }); this.add(mesh);
      for (let i = 0; i < this.capacity; i++) { mesh.setMatrixAt(i, new Matrix4().makeScale(0, 0, 0)); mesh.setColorAt(i, this.color.set(0xffffff)); }
    };
    const box = new BoxGeometry(1, 1, 1);
    add(new CylinderGeometry(0.38, 0.46, 0.85, 8), armor, 0, 1.04, 0);
    for (let layer = 0; layer < 4; layer++) {
      add(box, layer % 2 ? rust : armor, 0, 0.72 + layer * 0.17, 0.22, 0.83 - layer * 0.045, 0.14, 0.28);
      add(box, horn, 0, 0.69 + layer * 0.17, 0.367, 0.7 - layer * 0.03, 0.025, 0.025);
    }
    for (const side of [-1, 1]) {
      add(box, rust, side * 0.24, 0.6, 0.2, 0.4, 0.45, 0.31, 'body', side * 0.17);
      add(box, armor, side * 0.53, 1.1, 0.01, 0.2, 0.6, 0.25, 'body', side * 0.15);
    }
    add(new SphereGeometry(0.25, 8, 6), skin, 0, 1.66, 0.025);
    add(new SphereGeometry(0.32, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), armor, 0, 1.78, 0);
    add(new ConeGeometry(0.39, 0.18, 10), armor, 0, 1.8, 0);
    add(box, rust, 0, 1.57, 0.23, 0.4, 0.16, 0.1);
    add(box, armor, 0, 1.7, 0.26, 0.36, 0.045, 0.08);
    add(new TorusGeometry(0.23, 0.028, 5, 16, Math.PI), horn, 0, 2.02, 0.23);
    for (const sign of [-1, 1]) {
      for (let layer = 0; layer < 3; layer++) add(box, layer % 2 ? armor : rust, sign * (0.48 + layer * 0.04), 1.43 - layer * 0.12, 0, 0.35, 0.1, 0.57, 'body', sign * 0.2);
      add(box, armor, sign * 0.2, 0.29, 0, 0.23, 0.58, 0.28);
      add(box, rust, sign * 0.2, 0.25, 0.17, 0.2, 0.32, 0.07);
      add(box, armor, sign * 0.2, 0.07, 0.11, 0.28, 0.13, 0.42);
      add(new ConeGeometry(0.055, 0.38, 5), horn, sign * 0.25, 2.05, 0.14, 1, 1, 1, 'body', sign * -0.6);
    }
    add(box, blade, -0.64, 1.09, 0.58, 0.07, 1.65, 0.11, 'weapon', -0.22);
    add(box, horn, -0.5, 0.57, 0.58, 0.35, 0.06, 0.13, 'weapon', -0.22);
    add(new CircleGeometry(0.62, 16), new MeshBasicMaterial({ color: 0x071712, transparent: true, opacity: 0.32, depthWrite: false }), 0, 0.025, 0, 1, 1, 1, 'shadow');
    const originals = [...this.pieces];
    this.pieces.length = 0;
    const retired = new Set<BufferGeometry>();
    for (const piece of originals) {
      if (piece.animate !== 'body') { this.pieces.push(piece); continue; }
      if (this.pieces.some((merged) => merged.animate === 'body' && merged.mesh.material === piece.mesh.material)) continue;
      const source = originals.filter((candidate) => candidate.animate === 'body' && candidate.mesh.material === piece.mesh.material);
      const transformed = source.map((part) => part.mesh.geometry.clone().applyMatrix4(part.local));
      const geometry = mergeGeometries(transformed);
      if (geometry) {
        const mesh = new InstancedMesh(geometry, piece.mesh.material, this.capacity); mesh.frustumCulled = false;
        this.pieces.push({ mesh, local: new Matrix4(), animate: 'body' }); this.add(mesh);
      }
      transformed.forEach((item) => item.dispose());
      for (const part of source) { retired.add(part.mesh.geometry); part.mesh.dispose(); this.remove(part.mesh); }
    }
    for (const geometry of retired) if (!this.pieces.some((piece) => piece.mesh.geometry === geometry)) geometry.dispose();
    for (const overlay of [this.healthBack, this.healthFill, this.warningRing, this.warningArea]) {
      overlay.frustumCulled = false;
      overlay.renderOrder = overlay === this.healthFill ? 12 : 11;
      this.add(overlay);
    }
    this.healthBack.name = 'enemy-health-background';
    this.healthFill.name = 'enemy-health-fill';
  }

  update(enemies: ReadonlyArray<EnemyPose>, time: number, cameraYaw = 0, cameraPosition?: { x: number; y: number; z: number }): void {
    for (let i = 0; i < this.capacity; i++) {
      const enemy = enemies[i];
      const active = enemy && enemy.state !== 'inactive';
      const kind = enemy?.kind ?? 'grunt';
      const config = ENEMY_KINDS[kind];
      const scale = (!active ? 0 : enemy.state === 'dead' ? Math.max(0, Math.min(1, enemy.timer / Math.min(0.45, ENEMY_CONFIG.deathDuration))) : 1) * (enemy?.scale ?? 1);
      this.color.set(kind === 'commander' ? 0xffc24b : kind === 'elite' ? 0xc97de8 : kind === 'veteran' ? 0x7bc8f4 : 0x79716b);
      if (active && enemy.flash > 0) this.color.set(0xffdfa0);
      if (active && enemy.state === 'windup') this.color.set(0xff9e79);
      for (const piece of this.pieces) {
        if (active) {
          const airborne = enemy.state === 'dead' || enemy.state === 'knockback';
          this.rootTransform.position.set(enemy.x, piece.animate === 'shadow' ? 0 : airborne ? enemy.y ?? 0 : Math.abs(Math.sin(time * 11 + enemy.id)) * 0.075, enemy.z);
          this.rootTransform.rotation.set(piece.animate === 'shadow' ? 0 : airborne ? enemy.spin ?? -0.35 : 0.08, enemy.rotation, piece.animate !== 'shadow' && airborne ? (enemy.spin ?? 0) * 0.35 : 0);
        }
        this.rootTransform.scale.setScalar(scale);
        this.rootTransform.updateMatrix();
        this.temp.copy(this.rootTransform.matrix);
        if (active && piece.animate === 'weapon' && enemy.state === 'windup') {
          this.weapon.rotation.x = -1.65 * Math.max(0, Math.min(1, enemy.timer / config.windup)); this.weapon.updateMatrix(); this.temp.multiply(this.weapon.matrix);
        }
        this.temp.multiply(piece.local); piece.mesh.setMatrixAt(i, this.temp);
        if (piece.animate !== 'shadow') piece.mesh.setColorAt(i, this.color);
      }
      const cameraDx = (enemy?.x ?? 0) - (cameraPosition?.x ?? 0);
      const cameraDz = (enemy?.z ?? 0) - (cameraPosition?.z ?? 0);
      const cameraDepth = cameraDx * Math.sin(cameraYaw) + cameraDz * Math.cos(cameraYaw);
      const cameraDistance = Math.hypot(cameraDx, cameraDz);
      const maxHp = enemy?.maxHp ?? config.maxHp;
      const showHealth = active && kind !== 'grunt' && enemy.hp > 0 && (kind === 'commander' || enemy.hp < maxHp) && (!cameraPosition || cameraDepth > 1.5);
      const barWidth = Math.min(config.scale * 1.7, cameraPosition ? cameraDistance * 0.1 : Infinity);
      this.rootTransform.position.set(enemy?.x ?? 0, (enemy?.y ?? 0) + config.scale * 2.45 + 0.35, enemy?.z ?? 0);
      this.rootTransform.rotation.set(0, cameraYaw + Math.PI, 0);
      this.rootTransform.scale.set(showHealth ? barWidth : 0, 1, 1);
      this.rootTransform.updateMatrix(); this.healthBack.setMatrixAt(i, this.rootTransform.matrix);
      const ratio = showHealth ? Math.max(0, Math.min(1, enemy.hp / maxHp)) : 0;
      this.rootTransform.scale.x *= ratio;
      this.rootTransform.position.x += Math.cos(cameraYaw) * barWidth * (1 - ratio) * 0.5;
      this.rootTransform.position.z -= Math.sin(cameraYaw) * barWidth * (1 - ratio) * 0.5;
      this.rootTransform.updateMatrix(); this.healthFill.setMatrixAt(i, this.rootTransform.matrix);
      this.healthFill.setColorAt(i, this.color.set(kind === 'commander' ? 0xffb43d : kind === 'elite' ? 0xd681ff : 0x72ccff));
      const warning = active && enemy.state === 'windup' && kind !== 'grunt';
      this.rootTransform.position.set(enemy?.x ?? 0, 0.07, enemy?.z ?? 0);
      this.rootTransform.rotation.set(-Math.PI / 2, 0, 0);
      this.rootTransform.scale.setScalar(warning ? config.reach : 0);
      this.rootTransform.updateMatrix(); this.warningRing.setMatrixAt(i, this.rootTransform.matrix);
      this.warningArea.setMatrixAt(i, this.rootTransform.matrix);
      this.warningRing.setColorAt(i, this.color.setRGB(1, 0.55 + Math.sin(time * 18) * 0.3, 0.4));
    }
    for (const piece of this.pieces) {
      piece.mesh.instanceMatrix.needsUpdate = true;
      if (piece.mesh.instanceColor) piece.mesh.instanceColor.needsUpdate = true;
    }
    for (const overlay of [this.healthBack, this.healthFill, this.warningRing, this.warningArea]) {
      overlay.instanceMatrix.needsUpdate = true;
      if (overlay.instanceColor) overlay.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void { disposeScene(this); }
}
