export function damageHp(hp: number, damage: number, invincible = false): number {
  return invincible ? hp : Math.max(0, hp - Math.max(0, damage));
}

/** Arc angles use +Z forward, matching the procedural character models. */
export function inAttackArc(dx: number, dz: number, rotation: number, arcDeg: number): boolean {
  const distance = Math.hypot(dx, dz);
  if (distance < 1e-6 || arcDeg >= 360) return true;
  return (Math.sin(rotation) * dx + Math.cos(rotation) * dz) / distance >= Math.cos(arcDeg * Math.PI / 360) - 1e-9;
}
