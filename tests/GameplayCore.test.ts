import { describe, expect, it } from 'vitest';
import { ObjectPool } from '../src/core/ObjectPool';
import { SpatialHashGrid } from '../src/core/SpatialHashGrid';
import { ComboSystem } from '../src/combat/ComboSystem';
import { damageHp, inAttackArc } from '../src/combat/DamageSystem';

describe('fixed object pool', () => {
  it('caps allocation, rejects double returns and recycles the same objects', () => {
    let allocations = 0;
    const pool = new ObjectPool(2, (id) => { allocations++; return { id }; });
    const a = pool.acquire()!;
    const b = pool.acquire()!;
    expect(pool.acquire()).toBeUndefined();
    expect(pool.activeCount).toBe(2);
    expect(pool.release(a)).toBe(true);
    expect(pool.release(a)).toBe(false);
    expect(pool.release({ id: 10 })).toBe(false);
    expect(pool.acquire()).toBe(a);
    pool.reset();
    expect(pool.activeCount).toBe(0);
    expect(pool.acquire()).toBe(a);
    expect(pool.acquire()).toBe(b);
    expect(allocations).toBe(2);
  });
});

describe('spatial grid', () => {
  it('finds exact-radius neighbours across negative cell boundaries', () => {
    const grid = new SpatialHashGrid(4);
    grid.insert(1, -4, 0); grid.insert(2, -1, 0); grid.insert(3, 0, 0); grid.insert(4, -4, 3.01);
    const output = [999];
    expect(grid.queryRadius(-4, 0, 3, output)).toBe(output);
    expect(output.sort()).toEqual([1, 2]);
    grid.update(1, 8, 8);
    expect(grid.queryRadius(-4, 0, 0, output)).toEqual([]);
    expect(grid.queryRadius(8, 8, 0, output)).toEqual([1]);
    grid.insert(1, 9, 8);
    expect(grid.queryRadius(9, 8, 2, output)).toEqual([1]);
    grid.remove(1); grid.remove(1);
    expect(grid.queryRadius(9, 8, 2, output)).toEqual([]);
    grid.clear();
    expect(grid.queryRadius(0, 0, 100, output)).toEqual([]);
  });
});

describe('combat primitives', () => {
  it('expires combo at three seconds while keeping its maximum', () => {
    const combo = new ComboSystem();
    combo.hit(); combo.hit(); combo.update(2.9);
    expect(combo.value).toBe(2);
    combo.hit(); combo.update(3);
    expect(combo.value).toBe(0); expect(combo.max).toBe(3);
    combo.reset(); expect(combo.max).toBe(0);
  });
  it('clamps damage and respects invulnerability', () => {
    expect(damageHp(10, 15)).toBe(0);
    expect(damageHp(10, -15)).toBe(10);
    expect(damageHp(10, 15, true)).toBe(10);
  });
  it('tests attack arcs including their edge and origin', () => {
    expect(inAttackArc(0, 2, 0, 110)).toBe(true);
    expect(inAttackArc(0, -2, 0, 110)).toBe(false);
    expect(inAttackArc(Math.sin(55 * Math.PI / 180), Math.cos(55 * Math.PI / 180), 0, 110)).toBe(true);
    expect(inAttackArc(0, 0, Math.PI, 110)).toBe(true);
    expect(inAttackArc(0, -2, 0, 360)).toBe(true);
  });
});
