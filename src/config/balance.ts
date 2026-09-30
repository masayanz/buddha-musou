export const PLAYER_CONFIG = {
  maxHp: 1000, moveSpeed: 9, rotationSpeed: 20,
  dodgeSpeed: 16, dodgeDuration: 0.3, dodgeInvincibleDuration: 0.25,
  dodgeCooldown: 0.5, hitInvincibleDuration: 0.35, buddhistPowerMax: 100,
} as const;

export const NORMAL_ATTACKS = [
  { damage: 45, radius: 5, arcDeg: 160, knockback: 3.5, launch: 2.8, lunge: 1.1, duration: 0.28 },
  { damage: 60, radius: 5.8, arcDeg: 200, knockback: 5, launch: 4, lunge: 1.2, duration: 0.30 },
  { damage: 95, radius: 7, arcDeg: 250, knockback: 13, launch: 9, lunge: 1.5, duration: 0.38 },
] as const;
export const STRONG_ATTACK = { damage: 145, radius: 8, arcDeg: 360, knockback: 19, launch: 12, lunge: 0.55, cooldown: 0.8, duration: 0.48 } as const;
export const BUDDHA_SKILL = { damage: 320, radius: 16, arcDeg: 360, knockback: 28, launch: 17, lunge: 0, powerCost: 100, duration: 0.85 } as const;
export const ENEMY_CONFIG = {
  moveSpeedMin: 3.8, moveSpeedMax: 5.2,
  attackIntervalMin: 1.5, attackIntervalMax: 2.5,
  separationRadius: 0.95, separationStrength: 2.3,
  maxAttackers: 6, knockbackDuration: 0.4, knockbackDrag: 1.9, deathDuration: 1.55,
  gravity: 25, groundDrag: 9,
} as const;
export const ENEMY_KINDS = {
  grunt: { maxHp: 35, scale: 0.9, damage: 10, reach: 1.8, windup: 0.4, resistance: 1, speedFactor: 1, powerReward: 3 },
  veteran: { maxHp: 180, scale: 1.12, damage: 22, reach: 2.4, windup: 0.55, resistance: 0.65, speedFactor: 0.92, powerReward: 5 },
  elite: { maxHp: 450, scale: 1.48, damage: 38, reach: 3.4, windup: 0.75, resistance: 0.3, speedFactor: 0.78, powerReward: 10 },
  commander: { maxHp: 1800, scale: 2.05, damage: 65, reach: 5.5, windup: 1, resistance: 0.08, speedFactor: 0.68, powerReward: 25 },
} as const;
export const COMMANDER_CONFIG = { count: 3, aggroRadius: 24, attackCooldown: 2.4 } as const;
export const SPAWN_CONFIG = {
  initialEnemies: 50, targetEnemies: 70, maxEnemies: 96,
  minSpawnDistance: 10, maxSpawnDistance: 18, spawnBatch: 10, interval: 0.55,
} as const;
export const COMBAT_CONFIG = {
  inputBuffer: 0.25, chainWindow: 0.7, hitStart: 0.12, hitEnd: 0.65,
  comboTimeout: 3, hitPower: 2, killPower: 3, attackMoveFactor: 0.65,
  targetAssistRadius: 9, targetAssistArc: 200, strongCancelProgress: 0.42,
} as const;
export const STAGE_BOUND = 105;
export const CLEAR_KILLS = 1000;
export const SPATIAL_CELL_SIZE = 4;
