export interface Obstacle { readonly x: number; readonly z: number; readonly halfX: number; readonly halfZ: number; readonly height?: number; readonly kind: 'hall' | 'wall' | 'rock' | 'gate'; }
export interface BattlefieldZone { readonly id: string; readonly name: string; readonly x: number; readonly z: number; }

const outposts: readonly BattlefieldZone[] = [
  { id: 'west', name: '焔の西院', x: -65, z: -40 },
  { id: 'east', name: '鐘楼の東院', x: 65, z: -35 },
  { id: 'south', name: '蓮華の南庭', x: 0, z: 70 },
];
const obstacles: Obstacle[] = [
  { x: 0, z: -43, halfX: 14, halfZ: 9, kind: 'hall' },
  { x: -65, z: -74, halfX: 16, halfZ: 8, kind: 'hall' },
  { x: 65, z: -69, halfX: 14, halfZ: 8, kind: 'hall' },
  { x: -40, z: -49, halfX: 3, halfZ: 16, kind: 'wall' },
  { x: 40, z: -49, halfX: 3, halfZ: 16, kind: 'wall' },
  { x: -43, z: 32, halfX: 11, halfZ: 12, kind: 'hall' },
  { x: 43, z: 32, halfX: 11, halfZ: 12, kind: 'hall' },
  { x: 0, z: 99, halfX: 18, halfZ: 5, kind: 'hall' },
  { x: -78, z: 47, halfX: 8, halfZ: 8, kind: 'hall' },
  { x: 78, z: 47, halfX: 8, halfZ: 8, kind: 'hall' },
  { x: -91, z: -39, halfX: 5, halfZ: 8, kind: 'rock' },
  { x: 92, z: -31, halfX: 5, halfZ: 9, kind: 'rock' },
  { x: -92, z: 83, halfX: 5, halfZ: 5, kind: 'rock' },
  { x: 92, z: 83, halfX: 5, halfZ: 5, kind: 'rock' },
  { x: -38, z: 78, halfX: 5, halfZ: 7, kind: 'rock' },
  { x: 38, z: 78, halfX: 5, halfZ: 7, kind: 'rock' },
  { x: -40, z: -95, halfX: 22, halfZ: 2, kind: 'wall' },
  { x: 40, z: -95, halfX: 22, halfZ: 2, kind: 'wall' },
];
for (const zone of [{ id: 'center', name: '金剛門前', x: 0, z: -43 }, ...outposts]) {
  for (const side of [-1, 1]) obstacles.push({ x: zone.x + side * 12, z: zone.z + 18, halfX: 0.8, halfZ: 0.8, kind: 'gate' });
}

export const BATTLEFIELD = {
  bound: 105,
  obstacles: obstacles.map((box) => ({ ...box, height: box.kind === 'hall' ? box.x === 65 ? 19 : box.z === 99 ? 6 : 11 : box.kind === 'wall' ? 4.6 : box.kind === 'rock' ? 8 : 8.6 })) as readonly Obstacle[],
  zones: [{ id: 'center', name: '金剛門前', x: 0, z: 0 }, ...outposts] as readonly BattlefieldZone[],
  outposts,
  roads: [
    { from: { x: -65, z: -40 }, to: { x: -65, z: 70 } },
    { from: { x: 65, z: -35 }, to: { x: 65, z: 70 } },
    { from: { x: -65, z: 0 }, to: { x: 65, z: 0 } },
    { from: { x: -65, z: 70 }, to: { x: 65, z: 70 } },
    { from: { x: 0, z: 0 }, to: { x: 0, z: 70 } },
  ],
} as const;

export function isWalkable(x: number, z: number, radius = 0.6): boolean {
  return Number.isFinite(x) && Number.isFinite(z) && Math.abs(x) <= BATTLEFIELD.bound - radius && Math.abs(z) <= BATTLEFIELD.bound - radius &&
    !obstacles.some((box) => Math.abs(x - box.x) < box.halfX + radius - 1e-7 && Math.abs(z - box.z) < box.halfZ + radius - 1e-7);
}

/** Swept axis motion does not tunnel through thin gates even during a long dash. */
export function moveOnBattlefield(x: number, z: number, dx: number, dz: number, radius = 0.6): { x: number; z: number } {
  const bound = BATTLEFIELD.bound - radius;
  x = Math.max(-bound, Math.min(bound, x)); z = Math.max(-bound, Math.min(bound, z));
  for (let pass = 0; pass < 4; pass++) for (const box of obstacles) {
    const minX = box.x - box.halfX - radius, maxX = box.x + box.halfX + radius;
    const minZ = box.z - box.halfZ - radius, maxZ = box.z + box.halfZ + radius;
    if (x > minX && x < maxX && z > minZ && z < maxZ) {
      const distances = [minX >= -bound ? x - minX : Infinity, maxX <= bound ? maxX - x : Infinity, minZ >= -bound ? z - minZ : Infinity, maxZ <= bound ? maxZ - z : Infinity];
      const edge = distances.indexOf(Math.min(...distances));
      if (edge === 0) x = minX; else if (edge === 1) x = maxX; else if (edge === 2) z = minZ; else z = maxZ;
    }
  }
  let nextX = Math.max(-bound, Math.min(bound, x + dx));
  for (const box of obstacles) if (Math.abs(z - box.z) < box.halfZ + radius - 1e-7) {
    const left = box.x - box.halfX - radius, right = box.x + box.halfX + radius;
    if (dx > 0 && x <= left + 1e-7 && nextX > left) nextX = left;
    if (dx < 0 && x >= right - 1e-7 && nextX < right) nextX = right;
  }
  let nextZ = Math.max(-bound, Math.min(bound, z + dz));
  for (const box of obstacles) if (Math.abs(nextX - box.x) < box.halfX + radius - 1e-7) {
    const near = box.z - box.halfZ - radius, far = box.z + box.halfZ + radius;
    if (dz > 0 && z <= near + 1e-7 && nextZ > near) nextZ = near;
    if (dz < 0 && z >= far - 1e-7 && nextZ < far) nextZ = far;
  }
  return { x: nextX, z: nextZ };
}

export function hasLineOfSight(x: number, z: number, tx: number, tz: number, radius = 0.6): boolean {
  for (const box of obstacles) {
    let near = 0, far = 1;
    for (const [origin, delta, center, half] of [[x, tx - x, box.x, box.halfX], [z, tz - z, box.z, box.halfZ]]) {
      if (Math.abs(delta) < 1e-9) { if (Math.abs(origin - center) >= half + radius) { near = 2; break; } }
      else {
        const a = (center - half - radius - origin) / delta, b = (center + half + radius - origin) / delta;
        near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
      }
    }
    if (near < far && far > 0 && near < 1) return false;
  }
  return true;
}

export function segmentBlocked(ax: number, az: number, bx: number, bz: number, radius = 0): boolean {
  return !hasLineOfSight(ax, az, bx, bz, radius);
}

// A small static visibility graph gives crowds reliable routes around the halls.
const nodes = obstacles.flatMap((box) => [-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ x: box.x + sx * (box.halfX + 1.5), z: box.z + sz * (box.halfZ + 1.5) })))).filter((p) => isWalkable(p.x, p.z, 1.2));
let links: { to: number; distance: number }[][] | undefined;
let targetKey = '';
let distances: number[] = [];
export function nextWaypoint(x: number, z: number, targetX: number, targetZ: number): { x: number; z: number } {
  if (!isWalkable(x, z, 1.15)) return moveOnBattlefield(x, z, 0, 0, 1.2);
  if (!isWalkable(targetX, targetZ, 1.15)) {
    const safeTarget = moveOnBattlefield(targetX, targetZ, 0, 0, 1.2);
    targetX = safeTarget.x; targetZ = safeTarget.z;
  }
  if (hasLineOfSight(x, z, targetX, targetZ, 1.1)) return { x: targetX, z: targetZ };
  if (!links) links = nodes.map((node, index) => nodes.flatMap((other, to) => to !== index && hasLineOfSight(node.x, node.z, other.x, other.z, 1.1) ? [{ to, distance: Math.hypot(node.x - other.x, node.z - other.z) }] : []));
  const key = `${Math.round(targetX / 3)},${Math.round(targetZ / 3)}`;
  if (key !== targetKey) {
    targetKey = key;
    distances = nodes.map((node) => hasLineOfSight(node.x, node.z, targetX, targetZ, 1.1) ? Math.hypot(node.x - targetX, node.z - targetZ) : Infinity);
    const visited = new Set<number>();
    for (let pass = 0; pass < nodes.length; pass++) {
      let closest = -1;
      for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && (closest < 0 || distances[i] < distances[closest])) closest = i;
      if (closest < 0 || !Number.isFinite(distances[closest])) break;
      visited.add(closest);
      for (const edge of links[closest]) distances[edge.to] = Math.min(distances[edge.to], distances[closest] + edge.distance);
    }
  }
  let best = Infinity, waypoint = { x: targetX, z: targetZ };
  for (let i = 0; i < nodes.length; i++) {
    const score = Math.hypot(nodes[i].x - x, nodes[i].z - z) + distances[i];
    if (score < best && hasLineOfSight(x, z, nodes[i].x, nodes[i].z, 0.8)) { best = score; waypoint = nodes[i]; }
  }
  return waypoint;
}
