interface Entry { x: number; z: number; key: string }

export class SpatialHashGrid {
  private readonly buckets = new Map<string, Set<number>>();
  private readonly entries = new Map<number, Entry>();

  constructor(readonly cellSize = 4) {
    if (!Number.isFinite(cellSize) || cellSize <= 0) throw new RangeError('Invalid cell size');
  }

  insert(id: number, x: number, z: number): void { this.update(id, x, z); }

  update(id: number, x: number, z: number): void {
    const key = `${Math.floor(x / this.cellSize)},${Math.floor(z / this.cellSize)}`;
    const entry = this.entries.get(id);
    if (entry?.key === key) { entry.x = x; entry.z = z; return; }
    if (entry) this.remove(id);
    let bucket = this.buckets.get(key);
    if (!bucket) { bucket = new Set(); this.buckets.set(key, bucket); }
    bucket.add(id);
    this.entries.set(id, { x, z, key });
  }

  remove(id: number): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    const bucket = this.buckets.get(entry.key)!;
    bucket.delete(id);
    if (!bucket.size) this.buckets.delete(entry.key);
    this.entries.delete(id);
  }

  queryRadius(x: number, z: number, radius: number, output: number[]): number[] {
    output.length = 0;
    if (radius < 0 || !Number.isFinite(radius)) return output;
    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minZ = Math.floor((z - radius) / this.cellSize);
    const maxZ = Math.floor((z + radius) / this.cellSize);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cz = minZ; cz <= maxZ; cz++) {
        const bucket = this.buckets.get(`${cx},${cz}`);
        if (!bucket) continue;
        for (const id of bucket) {
          const entry = this.entries.get(id)!;
          if ((entry.x - x) ** 2 + (entry.z - z) ** 2 <= radius ** 2) output.push(id);
        }
      }
    }
    return output;
  }

  clear(): void { this.buckets.clear(); this.entries.clear(); }
}
