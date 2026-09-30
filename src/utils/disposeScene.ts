import { BufferGeometry, Material, Mesh, Object3D } from 'three';

/** Shared geometries/materials are released once when their owner is destroyed. */
export function disposeScene(root: Object3D): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    if ('isInstancedMesh' in object) (object as Mesh & { dispose(): void }).dispose();
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  root.clear();
}
