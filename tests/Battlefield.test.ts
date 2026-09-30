import { describe, expect, it } from 'vitest';
import { BATTLEFIELD, hasLineOfSight, isWalkable, moveOnBattlefield, nextWaypoint } from '../src/world/battlefield';

describe('battlefield', () => {
  it('provides four open arenas with safe commander spawn space', () => {
    expect(BATTLEFIELD.bound).toBe(105);
    expect(BATTLEFIELD.zones).toHaveLength(4);
    for (const zone of BATTLEFIELD.zones) {
      for (const dx of [-9, 0, 9]) for (const dz of [-9, 0, 9]) expect(isWalkable(zone.x + dx, zone.z + dz, 2)).toBe(true);
    }
  });
  it('sweeps long movement through walls without tunneling and slides along their edge', () => {
    const moved = moveOnBattlefield(-70, -50, 60, 3);
    expect(moved.x).toBeCloseTo(-43.6);
    expect(moved.z).toBe(-47);
    expect(isWalkable(moved.x, moved.z)).toBe(true);
    expect(hasLineOfSight(-70, -50, -10, -50)).toBe(false);
  });
  it('resolves embedded positions in every obstacle and respects outer bounds', () => {
    for (const box of BATTLEFIELD.obstacles) {
      const point = moveOnBattlefield(box.x, box.z, 0, 0);
      expect(isWalkable(point.x, point.z)).toBe(true);
    }
    const nearEdge = moveOnBattlefield(0, 104, 0, 0);
    expect(isWalkable(nearEdge.x, nearEdge.z)).toBe(true);
    const outside = moveOnBattlefield(500, -500, 10, -10);
    expect(isWalkable(outside.x, outside.z)).toBe(true);
  });
  it('routes from every courtyard to every other courtyard without crossing obstacles', () => {
    for (const from of BATTLEFIELD.zones) for (const to of BATTLEFIELD.zones) {
      let point = { x: from.x, z: from.z };
      for (let step = 0; step < 500 && Math.hypot(point.x - to.x, point.z - to.z) > 1; step++) {
        const next = nextWaypoint(point.x, point.z, to.x, to.z);
        const dx = next.x - point.x, dz = next.z - point.z, distance = Math.hypot(dx, dz);
        const amount = Math.min(1, distance);
        point = moveOnBattlefield(point.x, point.z, dx / (distance || 1) * amount, dz / (distance || 1) * amount);
        expect(isWalkable(point.x, point.z)).toBe(true);
      }
      expect(Math.hypot(point.x - to.x, point.z - to.z), `${from.id} to ${to.id}`).toBeLessThanOrEqual(1);
    }
  });
  it('routes around a hall toward a target pressed against its wall', () => {
    let point = { x: 0, z: -57 };
    const target = { x: 0, z: -33.4 };
    for (let step = 0; step < 150 && Math.hypot(point.x - target.x, point.z - target.z) > 2; step++) {
      const waypoint = nextWaypoint(point.x, point.z, target.x, target.z);
      const dx = waypoint.x - point.x, dz = waypoint.z - point.z, distance = Math.hypot(dx, dz);
      point = moveOnBattlefield(point.x, point.z, dx / (distance || 1) * Math.min(0.75, distance), dz / (distance || 1) * Math.min(0.75, distance));
      expect(isWalkable(point.x, point.z)).toBe(true);
    }
    expect(Math.hypot(point.x - target.x, point.z - target.z)).toBeLessThan(2);
  });
});
