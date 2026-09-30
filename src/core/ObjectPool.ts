/** Fixed capacity: acquisition never creates objects during play. */
export class ObjectPool<T> {
  readonly items: readonly T[];
  private readonly available: T[];
  private readonly leased = new Set<T>();

  constructor(capacity: number, create: (index: number) => T) {
    if (!Number.isInteger(capacity) || capacity < 0) throw new RangeError('Invalid pool capacity');
    this.items = Array.from({ length: capacity }, (_, index) => create(index));
    this.available = [...this.items].reverse();
  }

  get activeCount(): number { return this.leased.size; }

  acquire(): T | undefined {
    const item = this.available.pop();
    if (item !== undefined) this.leased.add(item);
    return item;
  }

  release(item: T): boolean {
    if (!this.leased.delete(item)) return false;
    this.available.push(item);
    return true;
  }

  reset(): void {
    this.leased.clear();
    this.available.length = 0;
    for (let index = this.items.length - 1; index >= 0; index--) this.available.push(this.items[index]);
  }
}
