import { describe, expect, it } from 'vitest';
import { GameSession } from '../src/game/GameSession';
import type { EnemyData, EnemyKind, SessionInput } from '../src/game/GameSession';
import { CLEAR_KILLS, ENEMY_KINDS, PLAYER_CONFIG, SPAWN_CONFIG, STAGE_BOUND, NORMAL_ATTACKS, STRONG_ATTACK } from '../src/config/balance';
import { BATTLEFIELD, isWalkable, nextWaypoint } from '../src/world/battlefield';

const idle: SessionInput = { moveX: 0, moveZ: 0, attack: false, strong: false, skill: false, dodge: false };
const tick = (game: GameSession, input: Partial<SessionInput> = {}) => game.update(1 / 60, { ...idle, ...input });
const run = (game: GameSession, seconds: number, input: Partial<SessionInput> = {}) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) tick(game, input);
};
function makeGame(): GameSession {
  let seed = 98765;
  const game = new GameSession(() => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; });
  game.start();
  return game;
}
function parkEnemies(game: GameSession): void {
  for (const enemy of game.enemies) {
    if (enemy.state === 'inactive') continue;
    enemy.x = 25; enemy.z = 25; enemy.speed = 0; enemy.cooldown = 100;
  }
}
function place(enemy: EnemyData, x: number, z: number, kind: EnemyKind = 'grunt', hp = 100): void {
  Object.assign(enemy, { x, z, kind, maxHp: hp, scale: ENEMY_KINDS[kind].scale, speed: 0, cooldown: 100, vx: 0, vz: 0, y: 0, vy: 0, spin: 0, angularVelocity: 0, state: 'chase', hp });
}

describe('game flow and movement', () => {
  it('starts at title and pauses all simulation and actions', () => {
    const game = new GameSession();
    tick(game, { attack: true });
    expect(game.state).toBe('title'); expect(game.elapsed).toBe(0);
    game.start(); game.pause();
    const snapshot = JSON.stringify(game.enemies);
    run(game, 1, { moveX: 1, attack: true });
    expect(game.player.x).toBe(0); expect(game.elapsed).toBe(0);
    expect(JSON.stringify(game.enemies)).toBe(snapshot);
    game.resume(); tick(game, { moveX: 1 });
    expect(game.elapsed).toBeGreaterThan(0); expect(game.player.x).toBeGreaterThan(0);
  });
  it('normalizes diagonal movement and clamps the arena boundary', () => {
    const straight = makeGame(); const diagonal = makeGame();
    run(straight, 1, { moveX: 1 }); run(diagonal, 1, { moveX: 1, moveZ: -1 });
    expect(straight.player.x).toBeCloseTo(PLAYER_CONFIG.moveSpeed);
    expect(Math.hypot(diagonal.player.x, diagonal.player.z)).toBeCloseTo(PLAYER_CONFIG.moveSpeed);
    run(straight, 15, { moveX: 1 });
    expect(straight.player.x).toBe(STAGE_BOUND - 0.6);
  });
  it('dashes in input direction or facing and observes cooldown', () => {
    const game = makeGame(); parkEnemies(game);
    tick(game, { dodge: true });
    expect(game.events.filter(event => event.kind === 'dodge')).toHaveLength(1);
    tick(game, { dodge: true });
    expect(game.events.filter(event => event.kind === 'dodge')).toHaveLength(1);
    run(game, 17 / 60);
    expect(game.player.z).toBeCloseTo(-4.8);
    tick(game, { dodge: true }); expect(game.player.dodging).toBe(false);
    run(game, 0.3); tick(game, { dodge: true, moveX: 1 });
    expect(game.player.dodging).toBe(true); expect(game.player.x).toBeGreaterThan(0);
  });
});

describe('spawning and AI', () => {
  it('starts a dense crowd at safe distances and rapidly fills its bounded population', () => {
    const game = makeGame();
    expect(game.activeEnemies).toBe(SPAWN_CONFIG.initialEnemies);
    for (const enemy of game.enemies.filter(e => e.state !== 'inactive' && e.kind !== 'commander')) {
      expect(Math.hypot(enemy.x, enemy.z)).toBeGreaterThanOrEqual(SPAWN_CONFIG.minSpawnDistance);
      expect(Math.hypot(enemy.x, enemy.z)).toBeLessThanOrEqual(SPAWN_CONFIG.maxSpawnDistance);
    }
    run(game, 1.1);
    expect(game.activeEnemies).toBe(SPAWN_CONFIG.targetEnemies);
    run(game, 10);
    expect(game.activeEnemies).toBe(SPAWN_CONFIG.targetEnemies);
    expect(game.enemies).toHaveLength(SPAWN_CONFIG.maxEnemies);
  });
  it('spawns inside the arena and safe ring even when the player is in a corner', () => {
    const game = makeGame();
    game.player.x = STAGE_BOUND; game.player.z = STAGE_BOUND;
    run(game, SPAWN_CONFIG.interval);
    for (const enemy of game.enemies.slice(SPAWN_CONFIG.initialEnemies, SPAWN_CONFIG.initialEnemies + SPAWN_CONFIG.spawnBatch)) {
      expect(Math.abs(enemy.x)).toBeLessThanOrEqual(STAGE_BOUND);
      expect(Math.abs(enemy.z)).toBeLessThanOrEqual(STAGE_BOUND);
      expect(Math.hypot(enemy.x - game.player.x, enemy.z - game.player.z)).toBeGreaterThanOrEqual(SPAWN_CONFIG.minSpawnDistance - 1e-6);
    }
  });
  it('separates initially coincident enemies and pursues the player', () => {
    const game = makeGame(); parkEnemies(game);
    const a = game.enemies[0]; const b = game.enemies[1];
    place(a, 10, 0); place(b, 10, 0); a.speed = b.speed = 3;
    run(game, 0.5);
    expect(a.x).toBeLessThan(10);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.1);
  });
  it('limits simultaneous attackers and damage through hit invulnerability', () => {
    const game = makeGame(); parkEnemies(game);
    for (let i = 0; i < 10; i++) {
      place(game.enemies[i], Math.sin(i) * 1.4, Math.cos(i) * 1.4);
      game.enemies[i].cooldown = 0;
    }
    tick(game); expect(game.attackSlots).toBe(6);
    run(game, ENEMY_KINDS.grunt.windup);
    expect(game.player.hp).toBe(PLAYER_CONFIG.maxHp - ENEMY_KINDS.grunt.damage);
    expect(game.events.filter(event => event.kind === 'playerHit')).toHaveLength(1);
  });
  it('dodge invulnerability avoids a telegraphed hit', () => {
    const game = makeGame(); parkEnemies(game);
    game.player.z = -STAGE_BOUND;
    place(game.enemies[0], 0, -STAGE_BOUND + 1.5); game.enemies[0].cooldown = 0;
    tick(game); run(game, 0.2); tick(game, { dodge: true, moveZ: -1 }); run(game, 0.2);
    expect(game.player.hp).toBe(PLAYER_CONFIG.maxHp);
  });
});

describe('player combat', () => {
  it('connects a sweeping attack with a broad formation immediately', () => {
    const game = makeGame(); parkEnemies(game);
    place(game.enemies[0], 0, -2);
    for (let index = 1; index <= 8; index++) {
      const angle = (-65 + (index - 1) * 130 / 7) * Math.PI / 180;
      place(game.enemies[index], Math.sin(angle) * 4.2, -Math.cos(angle) * 4.2);
    }
    tick(game, { attack: true }); run(game, 0.1);
    expect(game.combo).toBe(9);
    expect(game.enemies.slice(0, 9).every(enemy => enemy.hp === 55)).toBe(true);
    expect(game.events.filter(event => event.kind === 'hit').every(event => event.attackKind === 'normal' && event.attackStep === 0)).toBe(true);
  });
  it('faces a reachable forward target and lunges into staff range', () => {
    const game = makeGame(); parkEnemies(game);
    place(game.enemies[0], 4, -4);
    tick(game, { attack: true }); run(game, 0.3);
    expect(game.player.rotation).toBeCloseTo(Math.atan2(4, -4));
    expect(Math.hypot(game.player.x, game.player.z)).toBeCloseTo(NORMAL_ATTACKS[0].lunge);
    expect(game.enemies[0].hp).toBe(55);
  });
  it('allows heavy and skill attacks during a held normal chain', () => {
    const game = makeGame(); parkEnemies(game);
    run(game, 0.1, { attack: true }); tick(game, { attack: true, strong: true });
    run(game, 0.1, { attack: true });
    expect(game.player.attackKind).toBe('strong');
    game.player.power = 100;
    tick(game, { attack: true, skill: true });
    expect(game.player.attackKind).toBe('skill');
    expect(game.player.power).toBe(0);
  });
  it('launches a heavy-hit crowd into the air with outward velocity and tumbling', () => {
    const game = makeGame(); parkEnemies(game);
    place(game.enemies[0], -3, 0); place(game.enemies[1], 3, 0);
    tick(game, { strong: true }); run(game, 0.4);
    const left = game.enemies[0]; const right = game.enemies[1];
    expect(left.state).toBe('dead'); expect(right.state).toBe('dead');
    expect(left.y).toBeGreaterThan(2); expect(right.y).toBeGreaterThan(2);
    expect(left.x).toBeLessThan(-6); expect(right.x).toBeGreaterThan(6);
    expect(Math.abs(left.spin)).toBeGreaterThan(2);
    game.pause(); const y = left.y; run(game, 0.5); expect(left.y).toBe(y);
    game.resume(); run(game, 1.2);
    expect(left.y).toBe(0); expect(right.y).toBe(0);
    expect(game.enemies.every(enemy => Number.isFinite(enemy.y) && enemy.y >= 0)).toBe(true);
  });
  it('hits each forward enemy once, excludes rear enemies, and adds hit power', () => {
    const game = makeGame(); parkEnemies(game);
    place(game.enemies[0], -0.5, -2); place(game.enemies[1], 0.5, -2); place(game.enemies[2], 0, 2);
    tick(game, { attack: true }); run(game, 0.4);
    expect(game.enemies[0].hp).toBe(100 - NORMAL_ATTACKS[0].damage); expect(game.enemies[1].hp).toBe(100 - NORMAL_ATTACKS[0].damage);
    expect(game.enemies[2].hp).toBe(100);
    expect(game.combo).toBe(2); expect(game.player.power).toBe(4);
    expect(game.events.filter(event => event.kind === 'slash')).toHaveLength(1);
  });
  it('buffers three attack stages, then returns to stage one', () => {
    const game = makeGame(); parkEnemies(game);
    tick(game, { attack: true });
    for (let attack = 2; attack <= 4; attack++) {
      for (let frame = 0; frame < 30 && game.attackInstanceId < attack; frame++) tick(game, { attack: true });
      expect(game.player.attackKind).toBe('normal');
      expect(game.player.attackStep).toBe((attack - 1) % 3);
      expect(game.attackInstanceId).toBe(attack);
    }
    expect(game.elapsed).toBeLessThan(1);
  });
  it('strong attacks kill a ring, reward hit plus kill, and honor cooldown', () => {
    const game = makeGame(); parkEnemies(game);
    for (let i = 0; i < 10; i++) place(game.enemies[i], Math.sin(i) * 4, Math.cos(i) * 4);
    tick(game, { strong: true }); run(game, STRONG_ATTACK.duration);
    expect(game.kills).toBe(10); expect(game.combo).toBe(10); expect(game.player.power).toBe(50);
    expect(game.enemies.slice(0, 10).every(enemy => enemy.state === 'dead')).toBe(true);
    tick(game, { strong: true }); expect(game.player.attackKind).toBeNull();
    run(game, STRONG_ATTACK.cooldown); tick(game, { strong: true }); expect(game.player.attackKind).toBe('strong');
  });
  it('requires a full meter for skill, hits a broad ring and leaves power at zero', () => {
    const game = makeGame(); parkEnemies(game);
    game.player.power = 99; tick(game, { skill: true });
    expect(game.player.attackKind).toBeNull();
    game.player.power = 100;
    for (let i = 0; i < 10; i++) place(game.enemies[i], Math.sin(i) * 10, Math.cos(i) * 10);
    tick(game, { skill: true }); run(game, 0.4);
    expect(game.kills).toBe(10); expect(game.player.power).toBe(0);
    expect(game.events.filter(event => event.kind === 'skill')).toHaveLength(1);
  });
  it('clamps earned power, recycles death slots, and resets combo after inactivity', () => {
    const game = makeGame(); parkEnemies(game);
    const references = [...game.enemies];
    game.player.power = 99; place(game.enemies[3], 0, -2);
    tick(game, { strong: true }); run(game, 4);
    expect(game.player.power).toBe(100); expect(game.combo).toBe(0); expect(game.maxCombo).toBe(1);
    expect(['chase', 'windup']).toContain(game.enemies[3].state);
    expect(game.enemies.every((enemy, index) => enemy === references[index])).toBe(true);
  });
  it('emits powerReady only when earned power first reaches a full meter', () => {
    const game = makeGame(); parkEnemies(game);
    game.player.power = 99;
    place(game.enemies[0], 0, -2);
    tick(game, { attack: true }); run(game, 0.4);
    expect(game.player.power).toBe(100);
    expect(game.events.filter(event => event.kind === 'powerReady')).toHaveLength(1);

    place(game.enemies[1], 0, -2);
    tick(game, { attack: true }); run(game, 0.4);
    expect(game.player.power).toBe(100);
    expect(game.events.filter(event => event.kind === 'powerReady')).toHaveLength(1);
  });
});

describe('enemy ranks and battlefield objectives', () => {
  it('cuts down grunts with one normal swing while veterans and elites endure', () => {
    const game = makeGame(); parkEnemies(game);
    place(game.enemies[3], -1, -3, 'grunt', ENEMY_KINDS.grunt.maxHp);
    place(game.enemies[4], 0, -3, 'veteran', ENEMY_KINDS.veteran.maxHp);
    place(game.enemies[5], 1, -3, 'elite', ENEMY_KINDS.elite.maxHp);
    tick(game, { attack: true }); run(game, 0.2);
    expect(game.enemies[3].hp).toBe(0);
    expect(game.enemies[4].hp).toBe(135);
    expect(game.enemies[5].hp).toBe(405);
    expect(game.kills).toBe(1);
  });
  it('preserves a commander telegraph through light hits and executes its broad strike', () => {
    const game = makeGame(); parkEnemies(game);
    const boss = game.enemies[0];
    place(boss, 0, -3, 'commander', ENEMY_KINDS.commander.maxHp); boss.cooldown = 0;
    tick(game); expect(boss.state).toBe('windup');
    tick(game, { attack: true }); run(game, 0.2);
    expect(boss.hp).toBe(1755); expect(boss.state).toBe('windup'); expect(boss.y).toBe(0);
    run(game, 0.85);
    expect(game.player.hp).toBe(PLAYER_CONFIG.maxHp - ENEMY_KINDS.commander.damage);
  });
  it('reserves all three outposts, retains defeated commander identity, and requires both objectives', () => {
    const game = makeGame();
    expect(game.activeCommanders.map(enemy => enemy.outpostId)).toEqual(BATTLEFIELD.outposts.map(outpost => outpost.id));
    game.kills = CLEAR_KILLS; tick(game);
    expect(game.state).toBe('playing');
    parkEnemies(game);
    const boss = game.enemies[0]; const outpostId = boss.outpostId;
    place(boss, 0, -3, 'commander', 1);
    tick(game, { strong: true }); run(game, 2);
    expect(game.commandersDefeated).toBe(1); expect(game.state).toBe('playing');
    expect(boss.state).toBe('inactive'); expect(boss.kind).toBe('commander'); expect(boss.outpostId).toBe(outpostId);
    run(game, 2); expect(boss.hp).toBe(0); expect(game.commandersDefeated).toBe(1);
    game.start(); expect(game.commandersDefeated).toBe(0); expect(game.activeCommanders).toHaveLength(3);
    expect(game.activeCommanders.every(enemy => enemy.hp === ENEMY_KINDS.commander.maxHp)).toBe(true);
  });
  it('keeps spawn positions walkable and prevents skill damage through temple walls', () => {
    const game = makeGame(); parkEnemies(game);
    game.player.x = 35; game.player.z = -49;
    place(game.enemies[3], 45, -49, 'elite', ENEMY_KINDS.elite.maxHp);
    game.player.power = 100; tick(game, { skill: true }); run(game, 0.4);
    expect(game.enemies[3].hp).toBe(ENEMY_KINDS.elite.maxHp);
    run(game, 0.2);
    for (const enemy of game.enemies.slice(SPAWN_CONFIG.initialEnemies).filter(enemy => enemy.state !== 'inactive')) {
      expect(isWalkable(enemy.x, enemy.z, enemy.scale * 0.4)).toBe(true);
    }
  });
  it('stops player movement at a building and routes a pursuer around it', () => {
    const game = makeGame(); parkEnemies(game);
    game.player.x = 0; game.player.z = -30;
    run(game, 1, { moveZ: -1 });
    expect(game.player.z).toBeCloseTo(-33.4);
    expect(isWalkable(game.player.x, game.player.z)).toBe(true);
    const enemy = game.enemies[3];
    place(enemy, 0, -57); enemy.speed = 5;
    run(game, 14);
    expect(Math.hypot(enemy.x - game.player.x, enemy.z - game.player.z)).toBeLessThan(5);
    expect(isWalkable(enemy.x, enemy.z, enemy.scale * 0.4)).toBe(true);
  });
});

describe('result and restart', () => {
  it('supports an unmodified full battle to clear, retry, defeat and title', () => {
    const game = makeGame();
    // Navigate to each outpost and fight using ordinary input, without stat overrides.
    for (let frame = 0; frame < 360 * 60 && game.state === 'playing'; frame++) {
      const press = frame % 12 === 0;
      const boss = game.activeCommanders[0];
      let moveX = 0; let moveZ = 0;
      if (boss) {
        const distance = Math.hypot(boss.x - game.player.x, boss.z - game.player.z);
        const route = nextWaypoint(game.player.x, game.player.z, boss.x, boss.z);
        if (distance > 6) { moveX = route.x - game.player.x; moveZ = route.z - game.player.z; }
      }
      tick(game, { moveX, moveZ, strong: press, skill: press });
      game.events.length = 0;
    }
    expect(game.result).toBe('clear');
    expect(game.kills).toBeGreaterThanOrEqual(CLEAR_KILLS);
    expect(game.commandersDefeated).toBe(3);
    expect(game.elapsed).toBeGreaterThan(30);
    expect(game.maxCombo).toBeGreaterThan(5);
    expect(game.player.hp).toBeGreaterThan(0);
    game.start();
    for (let frame = 0; frame < 180 * 60 && game.state === 'playing'; frame++) {
      tick(game);
      game.events.length = 0;
    }
    expect(game.result).toBe('over');
    expect(game.player.hp).toBe(0);
    game.returnToTitle();
    expect(game.state).toBe('title');
  });
  it('ends at the configured final kill and freezes the result', () => {
    const game = makeGame(); parkEnemies(game);
    game.kills = CLEAR_KILLS - 1; game.commandersDefeated = game.totalCommanders; place(game.enemies[0], 0, -2);
    tick(game, { strong: true }); run(game, 0.5);
    expect(game.state).toBe('result'); expect(game.result).toBe('clear'); expect(game.kills).toBe(CLEAR_KILLS);
    const time = game.elapsed; run(game, 1); expect(game.elapsed).toBe(time);
  });
  it('ends at zero HP and fully resets battle state, objects and timers on retry', () => {
    const game = makeGame(); parkEnemies(game);
    game.player.hp = ENEMY_KINDS.grunt.damage; game.player.power = 72; game.kills = 42;
    place(game.enemies[0], 0, -1); game.enemies[0].cooldown = 0;
    run(game, 0.5);
    expect(game.state).toBe('result'); expect(game.result).toBe('over'); expect(game.player.dead).toBe(true);
    const references = [...game.enemies];
    game.start();
    expect(game.state).toBe('playing'); expect(game.result).toBeNull();
    expect(game.player.hp).toBe(1000); expect(game.player.power).toBe(0);
    expect(game.player.x).toBe(0); expect(game.player.z).toBe(0); expect(game.player.dead).toBe(false);
    expect(game.kills).toBe(0); expect(game.elapsed).toBe(0); expect(game.maxCombo).toBe(0);
    expect(game.commandersDefeated).toBe(0); expect(game.activeCommanders).toHaveLength(3);
    expect(game.attackSlots).toBe(0); expect(game.events).toHaveLength(0); expect(game.activeEnemies).toBe(SPAWN_CONFIG.initialEnemies);
    expect(game.enemies.every(enemy => enemy.y === 0 && enemy.vy === 0 && enemy.spin === 0)).toBe(true);
    expect(game.enemies.every((enemy, index) => enemy === references[index])).toBe(true);
    game.returnToTitle(); expect(game.state).toBe('title'); expect(game.activeEnemies).toBe(0);
  });
});
