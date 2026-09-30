import { describe, expect, it, vi } from 'vitest';
import { InstancedMesh, Mesh, MeshStandardMaterial } from 'three';
import { Stage } from '../src/world/Stage';

describe('procedural battlefield geometry', () => {
  it('constructs all architectural material batches without geometry merge errors', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    let stage: Stage | undefined;
    try {
      stage = new Stage();
      expect(error).not.toHaveBeenCalled();
      // The stone batch mixes indexed boxes with non-indexed rock polyhedra.
      // Losing it silently removes both the courtyard roads and stone walls.
      for (const color of [0x665f53, 0x252329, 0x771f13, 0x947546]) {
        const batch = stage.children.find((child) => child instanceof Mesh && !(child instanceof InstancedMesh) && child.material instanceof MeshStandardMaterial && child.material.color.getHex() === color);
        expect(batch, `architectural batch ${color.toString(16)}`).toBeInstanceOf(Mesh);
        if (!(batch instanceof Mesh)) throw new Error('Missing architecture');
        expect(batch.geometry.getAttribute('position').count).toBeGreaterThan(100);
        expect(batch.geometry.index).toBeNull();
        batch.geometry.computeBoundingBox();
        expect(batch.geometry.boundingBox?.min.x).toBeLessThan(-50);
        expect(batch.geometry.boundingBox?.max.x).toBeGreaterThan(50);
      }
    } finally {
      stage?.dispose();
      error.mockRestore();
    }
  });
});
