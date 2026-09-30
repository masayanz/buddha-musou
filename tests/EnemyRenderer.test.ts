import { describe, expect, it } from 'vitest';
import { InstancedMesh, Matrix4, PerspectiveCamera, Vector3 } from 'three';
import { EnemyRenderer } from '../src/enemy/EnemyRenderer';
import type { EnemyPose } from '../src/enemy/EnemyRenderer';

const veteran = (overrides: Partial<EnemyPose> = {}): EnemyPose => ({
  id: 0, x: 0, z: 0, rotation: 0, hp: 90, maxHp: 180, kind: 'veteran', scale: 1.12,
  state: 'chase', timer: 0, flash: 0, ...overrides,
});

describe('enemy health bar projection', () => {
  it('keeps the depleted bar anchored to the screen-left edge and bounds its projected size', () => {
    const renderer = new EnemyRenderer();
    const camera = new PerspectiveCamera(52, 16 / 9, 0.1, 300);
    camera.position.set(0, 8, 10); camera.lookAt(0, 1, 0); camera.updateMatrixWorld();
    const back = renderer.getObjectByName('enemy-health-background') as InstancedMesh;
    const fill = renderer.getObjectByName('enemy-health-fill') as InstancedMesh;
    const backgroundMatrix = new Matrix4(); const fillMatrix = new Matrix4();
    for (const z of [0, 5, 8]) {
      renderer.update([veteran({ z })], 0, Math.PI, camera.position);
      back.getMatrixAt(0, backgroundMatrix); fill.getMatrixAt(0, fillMatrix);
      const left = new Vector3(-0.5, 0, 0).applyMatrix4(backgroundMatrix).project(camera);
      const right = new Vector3(0.5, 0, 0).applyMatrix4(backgroundMatrix).project(camera);
      const fillLeft = new Vector3(-0.5, 0, 0).applyMatrix4(fillMatrix).project(camera);
      const fillRight = new Vector3(0.5, 0, 0).applyMatrix4(fillMatrix).project(camera);
      expect(fillLeft.x).toBeCloseTo(left.x, 5);
      expect(fillRight.x).toBeLessThan(right.x);
      expect((right.x - left.x) * 1280 / 2).toBeLessThan(100);
    }
    renderer.dispose();
  });

  it('hides undamaged regular ranks and bars behind the camera while retaining commander bars', () => {
    const renderer = new EnemyRenderer();
    const back = renderer.getObjectByName('enemy-health-background') as InstancedMesh;
    const matrix = new Matrix4();
    const width = (enemy: EnemyPose): number => {
      renderer.update([enemy], 0, Math.PI, { x: 0, y: 8, z: 10 });
      back.getMatrixAt(0, matrix);
      return new Vector3().setFromMatrixScale(matrix).x;
    };
    expect(width(veteran({ hp: 180 }))).toBe(0);
    expect(width(veteran({ z: 12 }))).toBe(0);
    expect(width(veteran({ z: 9 }))).toBe(0);
    expect(width(veteran({ kind: 'commander', hp: 1800, maxHp: 1800 }))).toBeGreaterThan(0);
    renderer.dispose();
  });
});
