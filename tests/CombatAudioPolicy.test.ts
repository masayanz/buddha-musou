import { describe, expect, it } from 'vitest';
import { impactLevel, impactSound, MAX_VOICES, playbackMode, selectVoice, swingSound } from '../src/effects/combatSoundPolicy';

describe('combat sound selection', () => {
  it('gives each normal combo step its own swing and distinguishes strong and skill', () => {
    expect([0, 1, 2].map((step) => swingSound('normal', step))).toEqual([
      'swing-light-01', 'swing-light-02', 'swing-heavy-01',
    ]);
    expect(swingSound('strong')).toBe('swing-strong-01');
    expect(swingSound('skill')).toBe('buddha-skill-01');
  });

  it('uses one heavier impact for strong attacks or crowds, with bounded loudness', () => {
    expect(impactSound('normal', 3)).toBe('impact-body-01');
    expect(impactSound('normal', 9)).toBe('impact-body-01');
    expect(impactSound('normal', 10)).toBe('impact-heavy-01');
    expect(impactSound('strong', 1)).toBe('impact-heavy-01');
    expect(impactLevel(6)).toBeGreaterThan(impactLevel(2));
    expect(impactLevel(100)).toBe(1);
  });

  it('mutes both file and synthesized playback and falls back while samples are unavailable', () => {
    expect(playbackMode(false, true, true)).toBe('skip');
    expect(playbackMode(false, true, false)).toBe('skip');
    expect(playbackMode(true, false, true)).toBe('skip');
    expect(playbackMode(true, true, false)).toBe('synth');
    expect(playbackMode(true, true, true)).toBe('buffer');
  });
});

describe('voice limit', () => {
  it('adds below the cap and replaces the oldest low priority voice at the cap', () => {
    expect(selectVoice([1, 2], 1)).toEqual({ kind: 'add' });
    expect(selectVoice([1, ...Array(MAX_VOICES - 1).fill(2)], 4)).toEqual({ kind: 'replace', index: 0 });
  });

  it('does not let a normal hit interrupt only high priority sounds', () => {
    expect(selectVoice(Array(MAX_VOICES).fill(4), 1)).toEqual({ kind: 'skip' });
  });
});
