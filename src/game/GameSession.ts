import { BUDDHA_SKILL, CLEAR_KILLS, COMBAT_CONFIG, COMMANDER_CONFIG, ENEMY_CONFIG, ENEMY_KINDS, NORMAL_ATTACKS, PLAYER_CONFIG, SPAWN_CONFIG, SPATIAL_CELL_SIZE, STAGE_BOUND, STRONG_ATTACK } from '../config/balance';
import { BATTLEFIELD, hasLineOfSight, isWalkable, moveOnBattlefield, nextWaypoint } from '../world/battlefield';
import { ComboSystem } from '../combat/ComboSystem';
import { damageHp, inAttackArc } from '../combat/DamageSystem';
import { ObjectPool } from '../core/ObjectPool';
import { SpatialHashGrid } from '../core/SpatialHashGrid';
import type { GameResult, GameState } from './GameState';

export interface SessionInput { moveX: number; moveZ: number; attack: boolean; strong: boolean; skill: boolean; dodge: boolean }
export type AttackKind = 'normal' | 'strong' | 'skill';
export type EnemyKind = keyof typeof ENEMY_KINDS;
export interface PlayerData {
  x: number; z: number; rotation: number; hp: number; power: number;
  moving: boolean; dodging: boolean; hurt: boolean; dead: boolean;
  attackProgress: number; attackKind: AttackKind | null; attackStep: number;
}
export interface EnemyData {
  id: number; x: number; z: number; rotation: number; hp: number;
  state: 'inactive' | 'chase' | 'windup' | 'knockback' | 'dead';
  timer: number; flash: number; speed: number; cooldown: number; vx: number; vz: number;
  y: number; vy: number; spin: number; angularVelocity: number;
  kind: EnemyKind; maxHp: number; name: string; scale: number; outpostId: string | null;
  routeTimer: number; waypointX: number; waypointZ: number;
}
export interface GameEvent { kind: 'slash' | 'strong' | 'skill' | 'hit' | 'death' | 'playerHit' | 'dodge' | 'powerReady'; x: number; z: number; rotation?: number; attackKind?: AttackKind; attackStep?: number }

const initialPlayer = (): PlayerData => ({
  x: 0, z: 0, rotation: Math.PI, hp: PLAYER_CONFIG.maxHp, power: 0,
  moving: false, dodging: false, hurt: false, dead: false,
  attackProgress: 0, attackKind: null, attackStep: 0,
});

/** Browser-independent battle simulation. Normal attack also supports held input. */
export class GameSession {
  state: GameState = 'title';
  result: GameResult = null;
  readonly player = initialPlayer();
  readonly enemies: readonly EnemyData[];
  readonly events: GameEvent[] = [];
  kills = 0;
  commandersDefeated = 0;
  readonly totalCommanders = COMMANDER_CONFIG.count;
  elapsed = 0;
  attackInstanceId = 0;
  private readonly pool: ObjectPool<EnemyData>;
  private readonly grid = new SpatialHashGrid(SPATIAL_CELL_SIZE);
  private readonly nearby: number[] = [];
  private readonly hitEnemies = new Set<number>();
  private readonly comboSystem = new ComboSystem();
  private readonly attackers = new Set<number>();
  private spawnTimer = 0;
  private hitInvincible = 0;
  private dodgeTimer = 0;
  private dodgeCooldown = 0;
  private dodgeX = 0;
  private dodgeZ = 0;
  private strongCooldown = 0;
  private attackTime = 0;
  private attackEventSent = false;
  private attackBuffer = 0;
  private chainTimer = 0;
  private nextStep = 0;
  private strongBuffer = 0;
  private skillBuffer = 0;
  private inputHeading: number | null = null;

  constructor(private readonly random: () => number = Math.random) {
    this.pool = new ObjectPool(SPAWN_CONFIG.maxEnemies, (id) => ({
      id, x: 0, z: 0, rotation: 0, hp: 0, state: 'inactive', timer: 0,
      flash: 0, speed: 0, cooldown: 0, vx: 0, vz: 0, y: 0, vy: 0, spin: 0, angularVelocity: 0,
      kind: 'grunt', maxHp: ENEMY_KINDS.grunt.maxHp, name: '', scale: ENEMY_KINDS.grunt.scale, outpostId: null,
      routeTimer: 0, waypointX: 0, waypointZ: 0,
    }));
    this.enemies = this.pool.items;
  }

  get combo(): number { return this.comboSystem.value; }
  get comboRemaining(): number { return this.comboSystem.timeRemaining; }
  get maxCombo(): number { return this.comboSystem.max; }
  get activeEnemies(): number { return this.enemies.reduce((sum, enemy) => sum + Number(enemy.state !== 'inactive' && enemy.state !== 'dead'), 0); }
  get attackSlots(): number { return this.attackers.size; }
  get activeCommanders(): EnemyData[] { return this.enemies.filter(enemy => enemy.kind === 'commander' && enemy.hp > 0 && enemy.state !== 'inactive'); }

  start(): void {
    this.reset();
    this.state = 'playing';
    for (const outpost of BATTLEFIELD.outposts.slice(0, this.totalCommanders)) {
      const commander = this.pool.acquire()!;
      this.initializeEnemy(commander, 'commander', outpost.x, outpost.z);
      commander.outpostId = outpost.id;
      commander.name = `${outpost.name}・怨将`;
    }
    for (let index = this.totalCommanders; index < SPAWN_CONFIG.initialEnemies; index++) this.spawnEnemy();
  }

  pause(): void { if (this.state === 'playing') this.state = 'paused'; }
  resume(): void { if (this.state === 'paused') this.state = 'playing'; }
  returnToTitle(): void { this.reset(); this.state = 'title'; }

  private reset(): void {
    Object.assign(this.player, initialPlayer());
    this.result = null;
    this.kills = 0;
    this.commandersDefeated = 0;
    this.elapsed = 0;
    this.attackInstanceId = 0;
    this.events.length = 0;
    this.pool.reset();
    this.grid.clear();
    this.attackers.clear();
    this.hitEnemies.clear();
    this.comboSystem.reset();
    this.spawnTimer = 0;
    this.hitInvincible = 0;
    this.dodgeTimer = 0;
    this.dodgeCooldown = 0;
    this.dodgeX = 0;
    this.dodgeZ = 0;
    this.strongCooldown = 0;
    this.attackTime = 0;
    this.attackBuffer = 0;
    this.chainTimer = 0;
    this.nextStep = 0;
    this.strongBuffer = 0;
    this.skillBuffer = 0;
    this.inputHeading = null;
    this.attackEventSent = false;
    for (const enemy of this.enemies) {
      enemy.state = 'inactive'; enemy.hp = 0; enemy.timer = 0; enemy.flash = 0;
      enemy.vx = 0; enemy.vz = 0; enemy.cooldown = 0;
      enemy.y = 0; enemy.vy = 0; enemy.spin = 0; enemy.angularVelocity = 0;
      enemy.outpostId = null; enemy.routeTimer = 0;
    }
  }

  update(dt: number, input: SessionInput): void {
    if (this.state !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
    // GameLoop supplies fixed steps; bound unexpected direct callers as well.
    dt = Math.min(dt, 0.1);
    this.elapsed += dt;
    this.comboSystem.update(dt);
    this.syncGrid();
    this.updatePlayer(dt, input);
    this.updateEnemies(dt);
    this.resolveAttack();
    if (this.player.hp <= 0) { this.finish('over'); return; }
    if (this.kills >= CLEAR_KILLS && this.commandersDefeated >= this.totalCommanders) { this.finish('clear'); return; }
    this.spawnTimer += dt;
    if (this.spawnTimer + 1e-9 >= SPAWN_CONFIG.interval) {
      this.spawnTimer -= SPAWN_CONFIG.interval;
      const count = Math.min(SPAWN_CONFIG.spawnBatch, SPAWN_CONFIG.targetEnemies - this.activeEnemies);
      for (let index = 0; index < count; index++) this.spawnEnemy();
    }
  }

  private finish(result: Exclude<GameResult, null>): void {
    this.result = result;
    this.state = 'result';
    this.player.dead = result === 'over';
    this.player.moving = false;
    this.player.dodging = false;
    this.player.attackKind = null;
    this.attackers.clear();
  }

  private updatePlayer(dt: number, input: SessionInput): void {
    const player = this.player;
    this.hitInvincible = Math.max(0, this.hitInvincible - dt);
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.strongCooldown = Math.max(0, this.strongCooldown - dt);
    this.attackBuffer = Math.max(0, this.attackBuffer - dt);
    this.strongBuffer = Math.max(0, this.strongBuffer - dt);
    this.skillBuffer = Math.max(0, this.skillBuffer - dt);
    this.chainTimer = Math.max(0, this.chainTimer - dt);
    player.hurt = this.hitInvincible > 0;
    const length = Math.hypot(input.moveX, input.moveZ);
    const mx = length > 0 ? input.moveX / Math.max(1, length) : 0;
    const mz = length > 0 ? input.moveZ / Math.max(1, length) : 0;
    this.inputHeading = length > 0 ? Math.atan2(mx, mz) : null;
    if (input.attack) this.attackBuffer = COMBAT_CONFIG.inputBuffer;
    if (input.strong) this.strongBuffer = COMBAT_CONFIG.inputBuffer;
    if (input.skill && player.power >= BUDDHA_SKILL.powerCost) this.skillBuffer = COMBAT_CONFIG.inputBuffer;

    if (input.dodge && this.dodgeCooldown <= 1e-9 && player.attackKind !== 'skill') {
      this.events.push({ kind: 'dodge', x: player.x, z: player.z, rotation: player.rotation });
      this.dodgeTimer = PLAYER_CONFIG.dodgeDuration;
      this.dodgeCooldown = PLAYER_CONFIG.dodgeCooldown;
      this.dodgeX = length > 0 ? mx : Math.sin(player.rotation);
      this.dodgeZ = length > 0 ? mz : Math.cos(player.rotation);
      player.rotation = Math.atan2(this.dodgeX, this.dodgeZ);
      player.attackKind = null;
      this.attackBuffer = 0;
      this.strongBuffer = 0;
      this.skillBuffer = 0;
      this.chainTimer = 0;
    }

    player.dodging = this.dodgeTimer > 1e-9;
    player.moving = length > 0;
    if (player.dodging) {
      const travelTime = Math.min(dt, this.dodgeTimer);
      const position = moveOnBattlefield(player.x, player.z, this.dodgeX * PLAYER_CONFIG.dodgeSpeed * travelTime, this.dodgeZ * PLAYER_CONFIG.dodgeSpeed * travelTime);
      player.x = position.x; player.z = position.z;
      this.dodgeTimer = Math.max(0, this.dodgeTimer - dt);
      player.attackProgress = 0;
      return;
    }

    if (!player.attackKind) {
      if (length > 0) {
        const target = Math.atan2(mx, mz);
        const delta = Math.atan2(Math.sin(target - player.rotation), Math.cos(target - player.rotation));
        player.rotation += delta * Math.min(1, PLAYER_CONFIG.rotationSpeed * dt);
      }
      if (this.skillBuffer > 0 && player.power >= BUDDHA_SKILL.powerCost) this.beginAttack('skill');
      else if (this.strongBuffer > 0 && this.strongCooldown <= 1e-9) this.beginAttack('strong');
      else if (this.attackBuffer > 0) this.beginAttack('normal');
    }
    // Heavy attacks may cancel a normal's recovery, so holding J never traps K/L.
    else if (player.attackKind !== 'skill') {
      if (this.skillBuffer > 0 && player.power >= BUDDHA_SKILL.powerCost) this.beginAttack('skill');
      else if (player.attackKind === 'normal' && player.attackProgress >= COMBAT_CONFIG.strongCancelProgress && this.strongBuffer > 0 && this.strongCooldown <= 1e-9) this.beginAttack('strong');
    }
    const moveSpeed = PLAYER_CONFIG.moveSpeed * (player.attackKind ? COMBAT_CONFIG.attackMoveFactor : 1);
    const position = moveOnBattlefield(player.x, player.z, mx * moveSpeed * dt, mz * moveSpeed * dt);
    player.x = position.x; player.z = position.z;

    if (player.attackKind) {
      const attack = this.attackDefinition();
      const lungeDuration = attack.duration * COMBAT_CONFIG.hitEnd;
      const lungeDt = Math.max(0, Math.min(dt, lungeDuration - this.attackTime));
      const lunge = attack.lunge * lungeDt / lungeDuration;
      const lunged = moveOnBattlefield(player.x, player.z, Math.sin(player.rotation) * lunge, Math.cos(player.rotation) * lunge);
      player.x = lunged.x; player.z = lunged.z;
      this.attackTime += dt;
      player.attackProgress = Math.min(1, this.attackTime / attack.duration);
      if (player.attackProgress >= 1 - 1e-9) {
        const wasNormal = player.attackKind === 'normal';
        this.nextStep = wasNormal ? (player.attackStep + 1) % NORMAL_ATTACKS.length : 0;
        this.chainTimer = wasNormal ? COMBAT_CONFIG.chainWindow : 0;
        player.attackKind = null;
        player.attackProgress = 0;
        if (this.skillBuffer > 0 && player.power >= BUDDHA_SKILL.powerCost) this.beginAttack('skill');
        else if (this.strongBuffer > 0 && this.strongCooldown <= 1e-9) this.beginAttack('strong');
        else if (wasNormal && this.attackBuffer > 0) this.beginAttack('normal');
      }
    }
  }

  private beginAttack(kind: AttackKind): void {
    if (this.inputHeading !== null) this.player.rotation = this.inputHeading;
    if (kind === 'normal') this.assistFacing();
    this.player.attackKind = kind;
    this.player.attackStep = kind === 'normal' && this.chainTimer > 0 ? this.nextStep : 0;
    this.player.attackProgress = 0;
    this.attackTime = 0;
    this.attackBuffer = 0;
    this.strongBuffer = 0;
    this.skillBuffer = 0;
    this.hitEnemies.clear();
    this.attackEventSent = false;
    this.attackInstanceId++;
    if (kind === 'strong') this.strongCooldown = STRONG_ATTACK.cooldown;
    if (kind === 'skill') this.player.power = 0;
  }

  private attackDefinition() {
    if (this.player.attackKind === 'skill') return BUDDHA_SKILL;
    if (this.player.attackKind === 'strong') return STRONG_ATTACK;
    return NORMAL_ATTACKS[this.player.attackStep];
  }

  private assistFacing(): void {
    const player = this.player;
    this.grid.queryRadius(player.x, player.z, COMBAT_CONFIG.targetAssistRadius, this.nearby);
    let closest = Infinity;
    let targetRotation = player.rotation;
    for (const id of this.nearby) {
      const enemy = this.enemies[id];
      const dx = enemy.x - player.x; const dz = enemy.z - player.z;
      const distance = Math.hypot(dx, dz);
      if (enemy.hp <= 0 || distance < 0.6 || distance >= closest || !inAttackArc(dx, dz, player.rotation, COMBAT_CONFIG.targetAssistArc) || !hasLineOfSight(player.x, player.z, enemy.x, enemy.z)) continue;
      closest = distance;
      targetRotation = Math.atan2(dx, dz);
    }
    player.rotation = targetRotation;
  }

  private syncGrid(): void {
    for (const enemy of this.enemies) {
      if (enemy.state === 'inactive' || enemy.state === 'dead') this.grid.remove(enemy.id);
      else this.grid.update(enemy.id, enemy.x, enemy.z);
    }
  }

  private updateEnemies(dt: number): void {
    for (const enemy of this.enemies) {
      if (enemy.state === 'inactive') continue;
      enemy.flash = Math.max(0, enemy.flash - dt);
      enemy.cooldown = Math.max(0, enemy.cooldown - dt);
      const kind = ENEMY_KINDS[enemy.kind];
      if (enemy.state === 'dead' || enemy.state === 'knockback') {
        enemy.timer -= dt;
        const knocked = moveOnBattlefield(enemy.x, enemy.z, enemy.vx * dt, enemy.vz * dt, enemy.scale * 0.4);
        enemy.x = knocked.x; enemy.z = knocked.z;
        enemy.y = Math.max(0, enemy.y + enemy.vy * dt - 0.5 * ENEMY_CONFIG.gravity * dt * dt);
        enemy.vy -= ENEMY_CONFIG.gravity * dt;
        enemy.spin += enemy.angularVelocity * dt;
        if (enemy.y === 0 && enemy.vy < 0) { enemy.vy = 0; enemy.angularVelocity *= Math.exp(-12 * dt); }
        const drag = Math.exp(-(enemy.y > 0 ? ENEMY_CONFIG.knockbackDrag : ENEMY_CONFIG.groundDrag) * dt);
        enemy.vx *= drag; enemy.vz *= drag;
        if (enemy.timer <= 1e-9 && enemy.y <= 0) {
          if (enemy.state === 'dead') { enemy.state = 'inactive'; if (enemy.id >= this.totalCommanders) this.pool.release(enemy); }
          else { enemy.state = 'chase'; enemy.vx = 0; enemy.vz = 0; enemy.spin = 0; enemy.angularVelocity = 0; }
        }
        if (enemy.state !== 'dead' && enemy.state !== 'inactive') this.grid.update(enemy.id, enemy.x, enemy.z);
        continue;
      }
      const dx = this.player.x - enemy.x;
      const dz = this.player.z - enemy.z;
      const distance = Math.hypot(dx, dz);
      if (enemy.kind !== 'commander' && distance > 65) {
        enemy.state = 'inactive'; this.grid.remove(enemy.id); this.attackers.delete(enemy.id); this.pool.release(enemy); continue;
      }
      if (enemy.kind === 'commander' && distance > COMMANDER_CONFIG.aggroRadius) {
        enemy.state = 'chase'; this.attackers.delete(enemy.id); continue;
      }
      enemy.rotation = Math.atan2(dx, dz);
      if (enemy.state === 'windup') {
        enemy.timer -= dt;
        if (enemy.timer <= 1e-9) {
          if (distance <= kind.reach && hasLineOfSight(enemy.x, enemy.z, this.player.x, this.player.z)) this.hitPlayer(kind.damage);
          enemy.state = 'chase';
          enemy.cooldown = enemy.kind === 'commander' ? COMMANDER_CONFIG.attackCooldown : this.between(ENEMY_CONFIG.attackIntervalMin, ENEMY_CONFIG.attackIntervalMax);
          this.attackers.delete(enemy.id);
        }
        continue;
      }
      if (distance <= kind.reach && enemy.cooldown <= 1e-9 && this.attackers.size < ENEMY_CONFIG.maxAttackers && hasLineOfSight(enemy.x, enemy.z, this.player.x, this.player.z)) {
        enemy.state = 'windup'; enemy.timer = kind.windup;
        this.attackers.add(enemy.id);
        continue;
      }
      enemy.routeTimer -= dt;
      if (enemy.routeTimer <= 0) {
        // The hero can stand closer to walls than the route graph's clearance.
        // Route to the adjacent open ground, then use exact hero distance for attacks.
        const target = moveOnBattlefield(this.player.x, this.player.z, 0, 0, 1.2);
        const waypoint = nextWaypoint(enemy.x, enemy.z, target.x, target.z);
        enemy.waypointX = waypoint.x; enemy.waypointZ = waypoint.z; enemy.routeTimer = 0.35 + enemy.id % 5 * 0.03;
      }
      const routeX = enemy.waypointX - enemy.x; const routeZ = enemy.waypointZ - enemy.z;
      const routeDistance = Math.max(0.01, Math.hypot(routeX, routeZ));
      let vx = distance > kind.reach * 0.75 ? routeX / routeDistance * enemy.speed : 0;
      let vz = distance > kind.reach * 0.75 ? routeZ / routeDistance * enemy.speed : 0;
      this.grid.queryRadius(enemy.x, enemy.z, ENEMY_CONFIG.separationRadius, this.nearby);
      for (const id of this.nearby) {
        if (id === enemy.id) continue;
        const other = this.enemies[id];
        let sx = enemy.x - other.x; let sz = enemy.z - other.z;
        let separation = Math.hypot(sx, sz);
        if (separation < 0.001) {
          const angle = (enemy.id + other.id) * 2.39996;
          const sign = enemy.id < other.id ? 1 : -1;
          sx = Math.sin(angle) * sign; sz = Math.cos(angle) * sign; separation = 1;
        }
        const strength = (1 - Math.min(separation, ENEMY_CONFIG.separationRadius) / ENEMY_CONFIG.separationRadius) * ENEMY_CONFIG.separationStrength;
        vx += sx / separation * strength; vz += sz / separation * strength;
      }
      const speed = Math.hypot(vx, vz);
      const limit = speed > enemy.speed * 1.5 ? enemy.speed * 1.5 / speed : 1;
      const moved = moveOnBattlefield(enemy.x, enemy.z, vx * limit * dt, vz * limit * dt, enemy.scale * 0.4);
      enemy.x = moved.x; enemy.z = moved.z;
      this.grid.update(enemy.id, enemy.x, enemy.z);
    }
  }

  private hitPlayer(damage: number): void {
    const dodgeAge = PLAYER_CONFIG.dodgeDuration - this.dodgeTimer;
    const invincible = this.hitInvincible > 1e-9 || this.player.attackKind === 'skill' || (this.player.dodging && dodgeAge <= PLAYER_CONFIG.dodgeInvincibleDuration + 1e-9);
    if (invincible || this.player.hp <= 0) return;
    this.player.hp = damageHp(this.player.hp, damage);
    this.hitInvincible = PLAYER_CONFIG.hitInvincibleDuration;
    this.player.hurt = true;
    this.events.push({ kind: 'playerHit', x: this.player.x, z: this.player.z });
  }

  private resolveAttack(): void {
    const player = this.player;
    if (!player.attackKind || player.hp <= 0 || player.attackProgress < COMBAT_CONFIG.hitStart || player.attackProgress > COMBAT_CONFIG.hitEnd) return;
    const attack = this.attackDefinition();
    if (!this.attackEventSent) {
      this.events.push({ kind: player.attackKind === 'normal' ? 'slash' : player.attackKind, x: player.x, z: player.z, rotation: player.rotation, attackKind: player.attackKind, attackStep: player.attackStep });
      this.attackEventSent = true;
    }
    this.grid.queryRadius(player.x, player.z, attack.radius, this.nearby);
    for (const id of this.nearby) {
      const enemy = this.enemies[id];
      if (this.hitEnemies.has(id) || enemy.hp <= 0) continue;
      const dx = enemy.x - player.x; const dz = enemy.z - player.z;
      if (!inAttackArc(dx, dz, player.rotation, attack.arcDeg) || !hasLineOfSight(player.x, player.z, enemy.x, enemy.z)) continue;
      this.hitEnemies.add(id);
      enemy.hp = damageHp(enemy.hp, attack.damage);
      enemy.flash = 0.16;
      const distance = Math.hypot(dx, dz);
      const kind = ENEMY_KINDS[enemy.kind];
      const resistance = enemy.hp <= 0 ? 1 : kind.resistance;
      enemy.vx = (distance > 0.001 ? dx / distance : Math.sin(player.rotation)) * attack.knockback * resistance;
      enemy.vz = (distance > 0.001 ? dz / distance : Math.cos(player.rotation)) * attack.knockback * resistance;
      enemy.vy = enemy.kind === 'commander' && enemy.hp > 0 ? 0 : attack.launch * resistance;
      enemy.angularVelocity = (enemy.id % 2 === 0 ? 1 : -1) * (player.attackKind === 'normal' ? 5 : 10);
      if (enemy.kind !== 'commander' || enemy.hp <= 0) this.attackers.delete(id);
      this.comboSystem.hit();
      this.events.push({ kind: 'hit', x: enemy.x, z: enemy.z, attackKind: player.attackKind, attackStep: player.attackStep });
      if (enemy.hp === 0) {
        enemy.state = 'dead'; enemy.timer = ENEMY_CONFIG.deathDuration;
        this.grid.remove(id);
        this.kills++;
        if (enemy.kind === 'commander') this.commandersDefeated++;
        this.events.push({ kind: 'death', x: enemy.x, z: enemy.z, attackKind: player.attackKind, attackStep: player.attackStep });
      } else if (enemy.kind !== 'commander') {
        enemy.state = 'knockback'; enemy.timer = ENEMY_CONFIG.knockbackDuration;
      }
      // A skill spends the whole meter and does not immediately refill itself.
      if (player.attackKind !== 'skill') {
        const previousPower = player.power;
        player.power = Math.min(PLAYER_CONFIG.buddhistPowerMax, player.power + COMBAT_CONFIG.hitPower + (enemy.hp === 0 ? kind.powerReward : 0));
        if (previousPower < PLAYER_CONFIG.buddhistPowerMax && player.power >= PLAYER_CONFIG.buddhistPowerMax) {
          this.events.push({ kind: 'powerReady', x: player.x, z: player.z });
        }
      }
    }
  }

  private spawnEnemy(): void {
    const enemy = this.pool.acquire();
    if (!enemy) return;
    let x = 0; let z = 0; let valid = false;
    // Try a ring around the hero without clamping it into an invalid near spawn.
    for (let attempt = 0; attempt < 24; attempt++) {
      const angle = this.random() * Math.PI * 2 + attempt * 2.39996;
      const distance = this.between(SPAWN_CONFIG.minSpawnDistance, SPAWN_CONFIG.maxSpawnDistance);
      x = this.player.x + Math.sin(angle) * distance;
      z = this.player.z + Math.cos(angle) * distance;
      if (Math.abs(x) <= STAGE_BOUND && Math.abs(z) <= STAGE_BOUND && isWalkable(x, z, 0.8)) { valid = true; break; }
    }
    if (!valid) {
      this.pool.release(enemy); return;
    }
    const roll = this.random();
    this.initializeEnemy(enemy, roll < 0.75 ? 'grunt' : roll < 0.95 ? 'veteran' : 'elite', x, z);
  }

  private initializeEnemy(enemy: EnemyData, kind: EnemyKind, x: number, z: number): void {
    const config = ENEMY_KINDS[kind];
    Object.assign(enemy, {
      x, z, rotation: Math.atan2(this.player.x - x, this.player.z - z), hp: config.maxHp,
      kind, maxHp: config.maxHp, scale: config.scale, name: kind === 'elite' ? '大鎧武者' : kind === 'veteran' ? '精鋭武者' : '落武者', outpostId: null,
      routeTimer: 0, waypointX: x, waypointZ: z,
      state: 'chase', timer: 0, flash: 0, vx: 0, vz: 0, y: 0, vy: 0, spin: 0, angularVelocity: 0,
      speed: this.between(ENEMY_CONFIG.moveSpeedMin, ENEMY_CONFIG.moveSpeedMax) * config.speedFactor,
      cooldown: this.between(0.3, ENEMY_CONFIG.attackIntervalMin),
    });
    this.grid.insert(enemy.id, x, z);
  }

  private between(min: number, max: number): number { return min + this.random() * (max - min); }
}
