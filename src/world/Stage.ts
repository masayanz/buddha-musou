import { AdditiveBlending, BoxGeometry, CircleGeometry, Color, ConeGeometry, CylinderGeometry, DataTexture, DoubleSide, Group, InstancedMesh, LinearFilter, LinearMipmapLinearFilter, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, OctahedronGeometry, PlaneGeometry, RepeatWrapping, RGBAFormat, RingGeometry, SphereGeometry, TorusGeometry } from 'three';
import type { BufferGeometry, Material } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { disposeScene } from '../utils/disposeScene';
import { BATTLEFIELD } from './battlefield';

/** Four connected temple precincts, built from the same footprints used by collision. */
export class Stage extends Group {
  private readonly flames: InstancedMesh;
  private readonly embers: InstancedMesh;
  private readonly animated = new Object3D();
  private readonly stoneTexture: DataTexture;
  private readonly smokeTexture: DataTexture;
  private readonly smoke: InstancedMesh;
  private readonly fireSites = [[-80, -64], [-49, -63], [-84, -28], [-50, -46], [-15, -35], [17, -34], [58, -59], [79, -58], [-40, 22], [42, 21], [-17, 91], [17, 91]];

  constructor() {
    super();
    const pixels = new Uint8Array(256 * 256 * 4);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const grain = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      const random = grain - Math.floor(grain);
      const vein = Math.abs(Math.sin(x * 0.041 + Math.sin(y * 0.048) * 1.7));
      const value = Math.round(135 + random * 67 - (vein < 0.055 ? 62 : 0) - (random < 0.08 ? 38 : 0));
      const index = (y * 256 + x) * 4;
      pixels[index] = value; pixels[index + 1] = value; pixels[index + 2] = value; pixels[index + 3] = 255;
    }
    this.stoneTexture = new DataTexture(pixels, 256, 256, RGBAFormat);
    this.stoneTexture.wrapS = this.stoneTexture.wrapT = RepeatWrapping;
    this.stoneTexture.magFilter = LinearFilter; this.stoneTexture.minFilter = LinearMipmapLinearFilter;
    this.stoneTexture.generateMipmaps = true; this.stoneTexture.needsUpdate = true;
    const stone = new MeshStandardMaterial({ color: 0x665f53, roughness: 0.94, map: this.stoneTexture, bumpMap: this.stoneTexture, bumpScale: 0.07 });
    const darkStone = new MeshStandardMaterial({ color: 0x252329, roughness: 0.93 });
    const wood = new MeshStandardMaterial({ color: 0x771f13, roughness: 0.82 });
    const bronze = new MeshStandardMaterial({ color: 0x947546, metalness: 0.5, roughness: 0.65 });
    const glow = new MeshBasicMaterial({ color: 0xffcb7c });
    const box = new BoxGeometry(1, 1, 1);
    const addBox = (x: number, y: number, z: number, sx: number, sy: number, sz: number, material = stone): Mesh => {
      const mesh = new Mesh(box, material);
      mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); this.add(mesh); return mesh;
    };
    const earth = new MeshStandardMaterial({ color: 0x302d25, roughness: 1, map: this.stoneTexture });
    addBox(0, -0.4, 0, BATTLEFIELD.bound * 2, 0.7, BATTLEFIELD.bound * 2, earth);
    const road = (ax: number, az: number, bx: number, bz: number): void => {
      const path = addBox((ax + bx) / 2, -0.03, (az + bz) / 2, 22, 0.06, Math.hypot(bx - ax, bz - az), stone);
      path.rotation.y = Math.atan2(bx - ax, bz - az);
      for (const side of [-1, 1]) {
        const line = addBox((ax + bx) / 2 + Math.cos(path.rotation.y) * side * 10.5, 0.011, (az + bz) / 2 - Math.sin(path.rotation.y) * side * 10.5, 0.18, 0.015, Math.hypot(bx - ax, bz - az), bronze);
        line.rotation.y = path.rotation.y;
      }
    };
    for (const { from, to } of BATTLEFIELD.roads) road(from.x, from.z, to.x, to.z);
    const tiles = new InstancedMesh(box, stone, BATTLEFIELD.zones.length * 196);
    const dummy = new Object3D();
    let tileIndex = 0;
    for (let zoneIndex = 0; zoneIndex < BATTLEFIELD.zones.length; zoneIndex++) {
      const zone = BATTLEFIELD.zones[zoneIndex];
      for (let row = 0; row < 14; row++) for (let col = 0; col < 14; col++) {
        const n = row * 14 + col;
        dummy.position.set(zone.x + (col - 6.5) * 3, -0.023, zone.z + (row - 6.5) * 3);
        dummy.scale.set(2.95, 0.06, 2.95); dummy.updateMatrix(); tiles.setMatrixAt(tileIndex, dummy.matrix);
        tiles.setColorAt(tileIndex++, new Color().setHSL(zoneIndex === 3 ? 0.18 : zoneIndex === 2 ? 0.57 : 0.08, 0.12, (zoneIndex === 3 ? 0.82 : 0.66) + Math.sin(n * 39.7) * 0.12));
      }
      const sealMaterial = new MeshBasicMaterial({ color: zoneIndex === 3 ? 0xaeb889 : 0xb89754, transparent: true, opacity: 0.38, depthWrite: false });
      for (const radius of [6, 12, 19.5]) {
        const seal = new Mesh(new RingGeometry(radius - 0.055, radius + 0.055, 96), sealMaterial);
        seal.rotation.x = -Math.PI / 2; seal.position.set(zone.x, 0.018, zone.z); this.add(seal);
      }
      const disk = new Mesh(new CircleGeometry(2.5, zoneIndex === 3 ? 12 : 8), sealMaterial);
      disk.rotation.x = -Math.PI / 2; disk.position.set(zone.x, 0.02, zone.z); this.add(disk);
    }
    this.add(tiles);
    const makeHall = (x: number, z: number, width: number, depth: number, stories: number): void => {
      addBox(x, 0.35, z, width, 0.7, depth, darkStone);
      for (let level = 0; level < stories; level++) {
        const y = level * 4.4, w = width * (1 - level * 0.14);
        addBox(x, y + 2.1, z, w * 0.84, 3.6, depth * 0.8, wood);
        for (const sign of [-1, 1]) for (let n = -2; n <= 2; n++) {
          addBox(x + n * w / 5, y + 2.1, z + sign * depth * 0.43, 0.4, 4, 0.4, wood);
          addBox(x + n * w / 5, y + 3.65, z + sign * depth * 0.43, 1, 0.25, 1.3, bronze);
        }
        for (let tier = 0; tier < 3; tier++) {
          const section = new Mesh(new ConeGeometry(1, 1, 4), darkStone);
          section.rotation.y = Math.PI / 4;
          section.scale.set((w + 3 - tier * 1.8) / Math.SQRT2, 2 - tier * 0.3, (depth + 3 - tier * 1.2) / Math.SQRT2);
          section.position.set(x, y + 4.2 + tier * 0.48, z); this.add(section);
        }
        addBox(x, y + 5.6, z, w * 0.9, 0.15, 0.3, bronze);
      }
    };
    for (const obstacle of BATTLEFIELD.obstacles) {
      const { x, z, halfX, halfZ, kind } = obstacle;
      if (kind === 'hall') {
        makeHall(x, z, halfX * 2, halfZ * 2, x === 65 ? 4 : z === 99 ? 1 : 2);
        // War banners and lanterns sit on the same blocked foundation as the hall.
        for (const side of [-1, 1]) {
          addBox(x + side * (halfX - 1), 3.8, z + halfZ - 0.7, 0.12, 7.6, 0.12, bronze);
          addBox(x + side * (halfX - 1), 5.3, z + halfZ - 0.6, 1.4, 3.2, 0.05, wood);
          const lamp = new Mesh(box, glow); lamp.position.set(x + side * (halfX - 2.5), 2, z + halfZ - 0.5); lamp.scale.set(0.65, 0.8, 0.4); this.add(lamp);
        }
      } else if (kind === 'wall') {
        addBox(x, 2, z, halfX * 2, 4, halfZ * 2, stone);
        addBox(x, 4.2, z, halfX * 2 + 0.8, 0.4, halfZ * 2 + 0.8, darkStone);
        const alongX = halfX > halfZ;
        for (let i = -2; i <= 2; i++) addBox(x + (alongX ? i * halfX / 2.5 : 0), 2.3, z + (alongX ? 0 : i * halfZ / 2.5), alongX ? 0.6 : halfX * 2 + 0.2, 4.6, alongX ? halfZ * 2 + 0.2 : 0.6, wood);
      } else if (kind === 'rock') {
        // A low plinth exactly matches collision; clustered crags break its silhouette.
        addBox(x, 0.35, z, halfX * 2, 0.7, halfZ * 2, darkStone);
        for (let n = 0; n < 5; n++) {
          const rock = new Mesh(new OctahedronGeometry(1, 1), stone);
          rock.position.set(x + Math.sin(n * 2.3) * halfX * 0.4, 1.5 + n % 3, z + Math.cos(n * 3.1) * halfZ * 0.4);
          rock.scale.set(halfX * 0.5, 3 + n % 3, halfZ * 0.5); rock.rotation.y = n; this.add(rock);
        }
      } else {
        addBox(x, 0.35, z, halfX * 2, 0.7, halfZ * 2, darkStone);
        addBox(x, 4.1, z, 0.9, 8.2, 0.9, wood);
      }
    }
    for (const zone of [{ x: 0, z: -43 }, ...BATTLEFIELD.outposts]) {
      addBox(zone.x, 6.8, zone.z + 18, 26, 0.45, 0.9, wood);
      addBox(zone.x, 8.3, zone.z + 18, 28, 0.65, 1.45, darkStone);
      addBox(zone.x, 7.5, zone.z + 18.3, 1.4, 1.6, 0.3, bronze);
    }
    // Eastern bell tower and southern lotus engraving are navigation landmarks.
    const bell = new Mesh(new CylinderGeometry(1.2, 1.9, 2.7, 20), bronze);
    bell.position.set(65, 10.2, -59.7); this.add(bell);
    const bellRim = new Mesh(new TorusGeometry(1.9, 0.15, 8, 32), bronze);
    bellRim.rotation.x = Math.PI / 2; bellRim.position.set(65, 8.9, -59.7); this.add(bellRim);
    for (let n = 0; n < 12; n++) {
      const petal = new Mesh(new RingGeometry(3, 3.1, 32, 1, 0, Math.PI), bronze);
      const angle = n / 12 * Math.PI * 2;
      petal.rotation.set(-Math.PI / 2, 0, angle); petal.position.set(Math.sin(angle) * 4, 0.025, 70 + Math.cos(angle) * 4); this.add(petal);
    }
    // Outer enclosure is just beyond the movement clamp, without invisible inner fences.
    const bound = BATTLEFIELD.bound;
    for (const sign of [-1, 1]) {
      addBox(sign * (bound + 0.5), 1.5, 0, 1, 3, bound * 2 + 2, darkStone);
      addBox(0, 1.5, sign * (bound + 0.5), bound * 2, 3, 1, darkStone);
    }
    for (let n = -5; n <= 5; n++) for (const side of [-1, 1]) {
      addBox(n * 20, 3, side * 106, 1.8, 6, 1.8, stone);
      addBox(side * 106, 3, n * 20, 1.8, 6, 1.8, stone);
    }
    // Mountain silhouettes sit outside the playable enclosure.
    for (let n = 0; n < 24; n++) {
      const angle = n / 24 * Math.PI * 2;
      const peak = new Mesh(new ConeGeometry(16 + n % 4 * 4, 24 + n % 5 * 7, 5), darkStone);
      peak.position.set(Math.cos(angle) * 145, 6, Math.sin(angle) * 145); peak.rotation.y = n; this.add(peak);
    }
    // Static props collapse to one draw call per material, keeping the crowd cheap.
    const batches = new Map<Material, BufferGeometry[]>();
    const retired = new Set<BufferGeometry>();
    for (const child of [...this.children]) {
      if (!(child instanceof Mesh) || child instanceof InstancedMesh || Array.isArray(child.material)) continue;
      child.updateMatrix();
      // Polyhedron geometry is non-indexed, while boxes/cylinders are indexed.
      // Normalize owned copies before merging so a rock cannot drop the entire stone batch.
      const geometry = (child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone()).applyMatrix4(child.matrix);
      const batch = batches.get(child.material) ?? [];
      batch.push(geometry); batches.set(child.material, batch);
      if (child.geometry !== box) retired.add(child.geometry);
      this.remove(child);
    }
    for (const [material, geometries] of batches) {
      const merged = mergeGeometries(geometries);
      if (merged) this.add(new Mesh(merged, material));
      geometries.forEach((geometry) => geometry.dispose());
    }
    retired.forEach((geometry) => geometry.dispose());
    const flameGeometry = new SphereGeometry(1, 7, 6);
    const flameVertices = flameGeometry.getAttribute('position');
    for (let index = 0; index < flameVertices.count; index++) {
      const y = flameVertices.getY(index);
      const taper = Math.max(0.08, 0.7 - y * 0.55);
      flameVertices.setXYZ(index, flameVertices.getX(index) * taper + y * y * 0.22, y, flameVertices.getZ(index) * taper);
    }
    flameGeometry.computeVertexNormals();
    this.flames = new InstancedMesh(flameGeometry, new MeshBasicMaterial({ color: 0xff7514, transparent: true, opacity: 0.42, depthWrite: false, blending: AdditiveBlending, toneMapped: false }), 54);
    this.flames.frustumCulled = false;
    this.embers = new InstancedMesh(new OctahedronGeometry(1, 0), new MeshBasicMaterial({ color: 0xffb23e, toneMapped: false }), 150);
    this.embers.frustumCulled = false;
    const smokePixels = new Uint8Array(64 * 64 * 4);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const radius = Math.hypot((x - 31.5) / 32, (y - 31.5) / 32);
      const noise = 0.7 + 0.15 * Math.sin(x * 0.34 + Math.sin(y * 0.23) * 3) + 0.15 * Math.cos(y * 0.51 + x * 0.19);
      const index = (y * 64 + x) * 4;
      smokePixels[index] = smokePixels[index + 1] = smokePixels[index + 2] = 255;
      smokePixels[index + 3] = Math.round(Math.pow(Math.max(0, 1 - radius), 1.6) * noise * 210);
    }
    this.smokeTexture = new DataTexture(smokePixels, 64, 64);
    this.smokeTexture.magFilter = LinearFilter; this.smokeTexture.needsUpdate = true;
    this.smoke = new InstancedMesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ color: 0x716565, map: this.smokeTexture, transparent: true, opacity: 0.5, depthWrite: false, side: DoubleSide }), 48);
    this.smoke.frustumCulled = false;
    this.add(this.flames, this.embers, this.smoke);
    this.update(0, 0);
  }

  update(_dt: number, time: number): void {
    for (let i = 0; i < this.flames.count; i++) {
      const site = this.fireSites[i % this.fireSites.length];
      const phase = time * (1.6 + (i % 4) * 0.15) + i * 2.4;
      const height = 1.4 + (Math.sin(phase * 3) + 1) * 0.8 + (i % 3) * 0.6;
      this.animated.position.set(site[0] + Math.sin(i * 43) * 1.4, height * 0.4 + (i % 3) * 0.25, site[1] + Math.cos(i * 17) * 1.3);
      this.animated.scale.set(0.4 + (i % 3) * 0.17, height, 0.4 + (i % 2) * 0.2);
      this.animated.rotation.set(Math.sin(phase) * 0.1, phase * 0.25, Math.cos(phase) * 0.18);
      this.animated.updateMatrix(); this.flames.setMatrixAt(i, this.animated.matrix);
    }
    this.flames.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < this.embers.count; i++) {
      const site = this.fireSites[i % this.fireSites.length];
      const cycle = (time * (0.4 + (i % 5) * 0.08) + i * 0.731) % 1;
      this.animated.position.set(site[0] + Math.sin(i * 23 + cycle * 4) * 3 + cycle * 3, 0.7 + cycle * 9, site[1] + Math.cos(i * 15) * 3);
      this.animated.scale.setScalar(0.035 + (1 - cycle) * (i % 3) * 0.025);
      this.animated.rotation.set(time + i, i, time * 2);
      this.animated.updateMatrix(); this.embers.setMatrixAt(i, this.animated.matrix);
    }
    this.embers.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < this.smoke.count; i++) {
      const site = this.fireSites[i % this.fireSites.length];
      const rise = (time * 0.025 + i * 0.137) % 1;
      const size = 3 + rise * 10;
      this.animated.position.set(site[0] + Math.sin(i * 1.7 + rise * 3) * 2 + rise * 4, 2 + rise * 19, site[1] - 2);
      this.animated.rotation.set(0, 0, Math.sin(i * 4) * 2 + rise * 0.3);
      this.animated.scale.set(size, size * 1.2, 1);
      this.animated.updateMatrix(); this.smoke.setMatrixAt(i, this.animated.matrix);
    }
    this.smoke.instanceMatrix.needsUpdate = true;
  }

  dispose(): void { this.stoneTexture.dispose(); this.smokeTexture.dispose(); disposeScene(this); }
}
