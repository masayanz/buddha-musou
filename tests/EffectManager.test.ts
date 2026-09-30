import { describe, expect, it } from 'vitest';
import { Mesh, Vector3 } from 'three';
import { EffectManager } from '../src/effects/EffectManager';

describe('slash visual direction', () => {
  const headings = [
    { label: 'south', rotation: 0, x: 0, z: 1 },
    { label: 'east', rotation: Math.PI / 2, x: 1, z: 0 },
    { label: 'north', rotation: Math.PI, x: 0, z: -1 },
    { label: 'west', rotation: -Math.PI / 2, x: -1, z: 0 },
  ];

  for (const stage of ['emitted', 'mid-swing'] as const) {
    it.each(headings)(`${stage} geometry faces the combat direction: $label`, ({ rotation, x, z }) => {
      const effects = new EffectManager();
      try {
        effects.emit('slash', 7, -4, rotation);
        if (stage === 'mid-swing') effects.update(0.16);
        effects.updateMatrixWorld(true);
        const slash = effects.children.find((child) => child.visible);
        expect(slash).toBeInstanceOf(Mesh);
        if (!(slash instanceof Mesh)) throw new Error('Expected a visible slash mesh');

        // Measure the actual rendered arc, including its world transform; this
        // catches sign errors that only appear when facing sideways.
        const positions = slash.geometry.getAttribute('position');
        const center = new Vector3();
        const vertex = new Vector3();
        for (let index = 0; index < positions.count; index++) {
          vertex.fromBufferAttribute(positions, index).applyMatrix4(slash.matrixWorld);
          center.add(vertex);
        }
        center.divideScalar(positions.count).sub(new Vector3(7, 1, -4));
        center.y = 0;
        center.normalize();
        expect(center.x).toBeCloseTo(x, 5);
        expect(center.z).toBeCloseTo(z, 5);
      } finally {
        effects.dispose();
      }
    });
  }
});

describe('mass-hit effects', () => {
  it('shows the third strike reaching behind both shoulders, matching its wide damage arc', () => {
    const effects = new EffectManager();
    try {
      effects.emit('slash', 0, 0, 0, 2);
      effects.updateMatrixWorld(true);
      const slash = effects.children.find((child) => child.visible);
      if (!(slash instanceof Mesh)) throw new Error('Expected third slash');
      const positions = slash.geometry.getAttribute('position');
      const vertex = new Vector3();
      let reachesLeftRear = false;
      let reachesRightRear = false;
      for (let index = 0; index < positions.count; index++) {
        vertex.fromBufferAttribute(positions, index).applyMatrix4(slash.matrixWorld);
        if (vertex.z < -2 && vertex.x < -3) reachesLeftRear = true;
        if (vertex.z < -2 && vertex.x > 3) reachesRightRear = true;
      }
      expect(reachesLeftRear && reachesRightRear).toBe(true);
    } finally { effects.dispose(); }
  });

  it('preserves the skill ring when fifty enemies each emit hit and death flashes', () => {
    const effects = new EffectManager();
    try {
      effects.emit('skill', 3, 4);
      const ring = effects.children.find((child) => child.visible);
      if (!(ring instanceof Mesh)) throw new Error('Expected skill ring');
      const geometry = ring.geometry;
      for (let enemy = 0; enemy < 50; enemy++) {
        effects.emit('hit', enemy, 0);
        effects.emit('death', enemy, 0);
      }
      expect(ring.visible).toBe(true);
      expect(ring.geometry).toBe(geometry);
      expect(ring.position.x).toBe(3);
      expect(ring.position.z).toBe(4);
      effects.update(0.4);
      expect(ring.visible).toBe(true);
      expect(ring.scale.x).toBeGreaterThan(8);
    } finally {
      effects.dispose();
    }
  });
});
