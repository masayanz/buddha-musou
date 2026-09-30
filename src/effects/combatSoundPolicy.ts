import type { AttackKind } from '../game/GameSession';

export const SOUND_FILES = {
  'swing-light-01': 'swing-light-01.ogg',
  'swing-light-02': 'swing-light-02.ogg',
  'swing-heavy-01': 'swing-heavy-01.ogg',
  'swing-strong-01': 'swing-strong-01.ogg',
  'impact-body-01': 'impact-body-01.ogg',
  'impact-heavy-01': 'impact-heavy-01.ogg',
  'enemy-death-01': 'enemy-death-01.ogg',
  'player-hit-01': 'player-hit-01.ogg',
  'buddha-skill-01': 'buddha-skill-01.ogg',
  'power-ready-01': 'power-ready-01.ogg',
  'dodge-01': 'dodge-01.ogg',
} as const;

export type SoundId = keyof typeof SOUND_FILES;
export const MAX_VOICES = 16;

export function swingSound(kind: AttackKind, attackStep = 0): SoundId {
  if (kind === 'skill') return 'buddha-skill-01';
  if (kind === 'strong') return 'swing-strong-01';
  return (['swing-light-01', 'swing-light-02', 'swing-heavy-01'] as const)[Math.min(2, Math.max(0, attackStep))];
}

export function impactSound(kind: AttackKind, hits: number): SoundId {
  return kind !== 'normal' || hits >= 10 ? 'impact-heavy-01' : 'impact-body-01';
}

export function impactLevel(hits: number): number {
  return Math.min(1, 0.7 + Math.max(0, hits - 1) * 0.035);
}

export function playbackMode(enabled: boolean, running: boolean, loaded: boolean): 'skip' | 'buffer' | 'synth' {
  if (!enabled || !running) return 'skip';
  return loaded ? 'buffer' : 'synth';
}

export type VoiceDecision = { kind: 'add' } | { kind: 'replace'; index: number } | { kind: 'skip' };

/** Active voices are ordered oldest first. Prefer replacing an older, lower priority sound. */
export function selectVoice(priorities: readonly number[], incoming: number, limit = MAX_VOICES): VoiceDecision {
  if (priorities.length < limit) return { kind: 'add' };
  let index = 0;
  for (let i = 1; i < priorities.length; i++) {
    if (priorities[i] < priorities[index]) index = i;
  }
  return priorities[index] <= incoming ? { kind: 'replace', index } : { kind: 'skip' };
}
