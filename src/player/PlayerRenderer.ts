import { AdditiveBlending, BoxGeometry, CircleGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SphereGeometry, TorusGeometry } from 'three';
import type { BufferGeometry, Material } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { disposeScene } from '../utils/disposeScene';

export interface PlayerPose {
  x: number; z: number; rotation: number; moving: boolean; attackProgress: number;
  attackKind: 'normal' | 'strong' | 'skill' | null; attackStep: number;
  dodging: boolean; hurt: boolean; dead: boolean;
}

export class PlayerRenderer extends Group {
  private readonly body = new Group();
  private readonly rightArm = new Group();
  private readonly leftArm = new Group();
  private readonly legs: Mesh[] = [];
  private readonly halo = new Group();
  private readonly gold = new MeshStandardMaterial({ color: 0xffc95a, metalness: 0.78, roughness: 0.42, emissive: 0x995018, emissiveIntensity: 0.2 });
  private time = 0;

  constructor() {
    super();
    this.body.scale.set(1.22, 1.3, 1.22);
    const bronze = new MeshStandardMaterial({ color: 0xb88738, metalness: 0.7, roughness: 0.42 });
    const red = new MeshStandardMaterial({ color: 0xa0150c, roughness: 0.7 });
    const dark = new MeshStandardMaterial({ color: 0x49372a, metalness: 0.4, roughness: 0.65 });
    const light = new MeshBasicMaterial({ color: 0xffd876, toneMapped: false });
    const sphere = new SphereGeometry(1, 16, 12);
    const addSphere = (root: Group, x: number, y: number, z: number, sx: number, sy: number, sz: number, material: MeshStandardMaterial | MeshBasicMaterial = this.gold): Mesh => {
      const mesh = new Mesh(sphere, material); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); root.add(mesh); return mesh;
    };
    const shadow = new Mesh(new CircleGeometry(0.85, 32), new MeshBasicMaterial({ color: 0x101916, transparent: true, opacity: 0.4, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.025; this.add(shadow, this.body);
    // Corrugate the garment surface itself: its folds cannot disappear inside a cone.
    const robeGeometry = new CylinderGeometry(0.48, 0.7, 1.42, 96, 12);
    const robeVertices = robeGeometry.getAttribute('position');
    for (let index = 0; index < robeVertices.count; index++) {
      const x = robeVertices.getX(index), y = robeVertices.getY(index), z = robeVertices.getZ(index);
      const angle = Math.atan2(x, z);
      const lower = 0.5 - y / 1.42;
      const ridge = 1 + (Math.sin(angle * 17 + lower * 0.8) * 0.055 + Math.sin(angle * 9 - lower * 0.3) * 0.024) * (0.4 + lower * 0.6);
      robeVertices.setXYZ(index, x * ridge, y, z * ridge * 0.76);
    }
    robeGeometry.computeVertexNormals();
    const robe = new Mesh(robeGeometry, bronze);
    robe.position.y = 1.03; this.body.add(robe);
    // A single elongated torso avoids separate spherical chest forms.
    addSphere(this.body, 0, 1.73, 0, 0.59, 0.65, 0.34);
    const neck = new Mesh(new CylinderGeometry(0.23, 0.29, 0.4, 16), this.gold);
    neck.position.set(0, 2.16, 0.01); this.body.add(neck);
    addSphere(this.body, 0, 2.11, 0.22, 0.22, 0.17, 0.14);
    addSphere(this.body, 0, 2.46, 0.045, 0.47, 0.54, 0.405);
    addSphere(this.body, 0, 2.9, -0.04, 0.39, 0.22, 0.34, dark);
    addSphere(this.body, 0, 3.05, -0.04, 0.16, 0.2, 0.15, dark);
    for (let row = 0; row < 4; row++) for (let i = 0; i < 12; i++) {
      const angle = i / 12 * Math.PI * 2 + row * 0.12;
      const radius = 0.31 * Math.sin((row + 1) / 5 * Math.PI * 0.65);
      addSphere(this.body, Math.sin(angle) * radius, 2.73 + row * 0.075, Math.cos(angle) * radius - 0.045, 0.072, 0.067, 0.068, bronze);
    }
    for (const side of [-1, 1]) {
      addSphere(this.body, side * 0.46, 2.35, 0.05, 0.105, 0.29, 0.13);
      // Closed eyes and long earlobes keep the silhouette recognizably Buddha-like.
      addSphere(this.body, side * 0.17, 2.52, 0.414, 0.11, 0.019, 0.024, dark);
      addSphere(this.body, side * 0.17, 2.555, 0.406, 0.13, 0.047, 0.035, bronze);
      const leg = addSphere(this.body, side * 0.27, 0.32, 0.1, 0.21, 0.36, 0.27); this.legs.push(leg);
    }
    addSphere(this.body, 0, 2.39, 0.427, 0.073, 0.115, 0.075);
    addSphere(this.body, 0, 2.67, 0.426, 0.035, 0.035, 0.025, light);
    addSphere(this.body, 0, 2.23, 0.392, 0.125, 0.028, 0.039, bronze);
    // Broad diagonal robe panel wraps the chest from shoulder to the opposite hip.
    const chestCloth = new PlaneGeometry(1.28, 0.5, 30, 12);
    const clothVertices = chestCloth.getAttribute('position');
    for (let index = 0; index < clothVertices.count; index++) {
      const u = clothVertices.getX(index), v = clothVertices.getY(index);
      const x = u * 0.78 + v * 0.63;
      const y = -u * 0.63 + v * 0.78 + 1.78;
      const z = 0.36 - x * x * 0.28 + Math.cos(v * 49 + u * 2) * 0.015;
      clothVertices.setXYZ(index, x, y, z);
    }
    chestCloth.computeVertexNormals(); this.body.add(new Mesh(chestCloth, bronze));
    const sash = new Mesh(new CylinderGeometry(0.5, 0.53, 0.12, 24), red);
    sash.position.set(0, 1.45, 0); sash.scale.z = 0.79; this.body.add(sash);
    const drape = addSphere(this.body, -0.43, 1.1, 0.36, 0.16, 0.66, 0.055, red); drape.rotation.z = -0.15;
    const beads = new TorusGeometry(0.32, 0.055, 6, 18);
    const necklace = new Mesh(beads, bronze); necklace.position.set(0, 1.72, 0.42); necklace.scale.y = 0.75; this.body.add(necklace);
    for (let i = 0; i < 15; i++) {
      const angle = Math.PI * 0.15 + i / 14 * Math.PI * 0.7;
      addSphere(this.body, Math.cos(angle) * 0.43, 2.12 - Math.sin(angle) * 0.42, 0.37, 0.062, 0.063, 0.06, this.gold);
    }
    this.halo.position.set(0, 2.2, -0.52); this.body.add(this.halo);
    for (const radius of [1.06, 1.13, 1.43, 1.49]) {
      const ring = new Mesh(new TorusGeometry(radius, radius > 1.4 ? 0.026 : 0.038, 6, 80), radius === 1.49 ? light : this.gold);
      this.halo.add(ring);
    }
    for (let i = 0; i < 28; i++) {
      const angle = i / 28 * Math.PI * 2;
      const ray = new Mesh(new ConeGeometry(i % 2 ? 0.045 : 0.08, i % 2 ? 0.2 : 0.35, 4), this.gold);
      ray.position.set(Math.sin(angle) * 1.6, Math.cos(angle) * 1.6, 0); ray.rotation.z = -angle; this.halo.add(ray);
      const jewel = new Mesh(new SphereGeometry(0.038, 6, 4), light);
      jewel.position.set(Math.sin(angle) * 1.29, Math.cos(angle) * 1.29, 0); this.halo.add(jewel);
      const bar = new Mesh(new BoxGeometry(0.026, 0.2, 0.035), bronze);
      bar.position.set(Math.sin(angle) * 1.28, Math.cos(angle) * 1.28, 0); bar.rotation.z = -angle; this.halo.add(bar);
    }
    const aura = new Mesh(new CircleGeometry(1.48, 64), new MeshBasicMaterial({ color: 0xff940f, transparent: true, opacity: 0.045, depthWrite: false, blending: AdditiveBlending }));
    this.halo.add(aura);
    this.rightArm.position.set(-0.65, 1.93, 0); this.leftArm.position.set(0.65, 1.93, 0);
    this.body.add(this.rightArm, this.leftArm);
    addSphere(this.rightArm, -0.09, -0.36, 0.15, 0.17, 0.47, 0.19);
    addSphere(this.leftArm, 0.08, -0.28, 0.12, 0.18, 0.4, 0.18);
    // Open blessing palm and four separated fingers read clearly against the robe.
    addSphere(this.leftArm, 0.09, -0.32, 0.34, 0.125, 0.16, 0.055);
    for (let finger = 0; finger < 4; finger++) {
      const digit = new Mesh(new CylinderGeometry(0.025, 0.03, 0.2 - Math.abs(finger - 1.5) * 0.024, 8), this.gold);
      digit.position.set(0.005 + finger * 0.055, -0.125, 0.34); digit.rotation.z = (1.5 - finger) * 0.055; this.leftArm.add(digit);
    }
    const thumb = addSphere(this.leftArm, -0.055, -0.32, 0.35, 0.035, 0.1, 0.04); thumb.rotation.z = -0.6;
    addSphere(this.rightArm, -0.2, -0.5, 0.28, 0.11, 0.12, 0.065);
    for (let finger = 0; finger < 4; finger++) addSphere(this.rightArm, -0.225, -0.44 - finger * 0.043, 0.33, 0.075, 0.021, 0.031);
    for (const arm of [this.leftArm, this.rightArm]) {
      const cuff = new Mesh(new CylinderGeometry(0.185, 0.19, 0.12, 12), bronze); cuff.position.set(0, -0.53, 0.17); arm.add(cuff);
    }
    const staff = new Mesh(new CylinderGeometry(0.055, 0.075, 3.65, 10), bronze);
    staff.position.set(-0.22, -0.15, 0.28); this.rightArm.add(staff);
    const crown = new Mesh(new TorusGeometry(0.34, 0.055, 8, 32), this.gold);
    crown.position.set(-0.22, 1.84, 0.28); this.rightArm.add(crown);
    addSphere(this.rightArm, -0.22, 1.86, 0.28, 0.1, 0.17, 0.1, light);
    for (let i = 0; i < 6; i++) {
      const angle = i / 6 * Math.PI * 2;
      const ring = new Mesh(new TorusGeometry(0.13, 0.024, 6, 16), this.gold);
      ring.position.set(-0.22 + Math.sin(angle) * 0.34, 1.8 + Math.cos(angle) * 0.28, 0.28); this.rightArm.add(ring);
    }
    // Ornament is static within each joint, so merge it rather than paying hundreds of draws.
    const originals = new Set<BufferGeometry>();
    this.traverse((object) => { if (object instanceof Mesh) originals.add(object.geometry); });
    for (const group of [this.halo, this.leftArm, this.rightArm, this.body]) this.mergeJoint(group);
    this.traverse((object) => { if (object instanceof Mesh) originals.delete(object.geometry); });
    originals.forEach((geometry) => geometry.dispose());
  }

  update(dt: number, pose: PlayerPose): void {
    this.time += dt;
    this.position.set(pose.x, 0, pose.z); this.rotation.y = pose.rotation;
    const stride = pose.moving ? Math.sin(this.time * 14) : 0;
    this.body.position.y = pose.dodging ? 0.1 : Math.abs(stride) * 0.055;
    this.body.rotation.set(pose.dead ? -1.3 : pose.dodging ? 0.4 : 0, 0, pose.hurt ? Math.sin(this.time * 65) * 0.035 : 0);
    this.legs[0].rotation.x = stride * 0.45; this.legs[1].rotation.x = -stride * 0.45;
    this.rightArm.rotation.set(stride * 0.1, 0, -0.08);
    this.leftArm.rotation.set(-stride * 0.2, 0, 0.1);
    if (pose.attackKind) {
      const progress = Math.max(0, Math.min(1, pose.attackProgress));
      const swing = Math.sin(progress * Math.PI);
      if (pose.attackKind === 'skill') {
        this.rightArm.rotation.z = -1.9 * swing; this.leftArm.rotation.z = 1.5 * swing;
        this.body.position.y += swing * 0.8;
      } else {
        const direction = pose.attackStep % 2 === 0 ? 1 : -1;
        const strike = Math.min(1, Math.max(0, (progress - 0.12) / 0.48));
        this.body.rotation.y = pose.attackKind === 'strong' ? strike * Math.PI * 2 : direction * Math.sin(progress * Math.PI * 2) * 0.95;
        this.body.rotation.x = -0.12 + swing * 0.28;
        this.rightArm.rotation.set(-1.5 * swing, direction * (strike - 0.5) * 3.4, -1.35 * swing);
        this.leftArm.rotation.set(-0.7 * swing, 0, 0.9 * swing);
      }
    }
    this.gold.emissiveIntensity = pose.hurt ? 1.2 : pose.attackKind === 'skill' ? 0.85 : 0.22;
    this.halo.scale.setScalar(0.9 + Math.sin(this.time * 2) * 0.018 + (pose.attackKind === 'skill' ? 0.22 : 0));
  }

  private mergeJoint(group: Group): void {
    const batches = new Map<Material, BufferGeometry[]>();
    for (const child of [...group.children]) {
      if (!(child instanceof Mesh) || this.legs.includes(child) || Array.isArray(child.material)) continue;
      child.updateMatrix();
      const geometries = batches.get(child.material) ?? [];
      geometries.push(child.geometry.clone().applyMatrix4(child.matrix)); batches.set(child.material, geometries);
      group.remove(child);
    }
    for (const [material, geometries] of batches) {
      const geometry = mergeGeometries(geometries);
      if (geometry) group.add(new Mesh(geometry, material));
      geometries.forEach((item) => item.dispose());
    }
  }

  reset(): void { this.time = 0; this.body.rotation.set(0, 0, 0); this.body.position.y = 0; }
  dispose(): void { disposeScene(this); }
}
