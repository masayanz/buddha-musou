import type { AttackKind } from '../game/GameSession';
import { impactLevel, impactSound, MAX_VOICES, playbackMode, selectVoice, SOUND_FILES, swingSound } from './combatSoundPolicy';
import type { SoundId } from './combatSoundPolicy';

interface ActiveVoice { priority: number; cleanup: () => void }

/** Cached file SFX with the original Web Audio synthesis as a loading/error fallback. */
export class CombatAudio {
  enabled = true;
  private context?: AudioContext;
  private output?: GainNode;
  private noise?: AudioBuffer;
  private lastImpact = -1;
  private disposed = false;
  private paused = true;
  private readonly abort = new AbortController();
  private readonly buffers = new Map<SoundId, AudioBuffer>();
  private readonly attempted = new Set<SoundId>();
  private readonly voices = new Map<AudioScheduledSourceNode, ActiveVoice>();
  private master = 0.8;
  private sfx = 0.8;

  get masterVolume(): number { return this.master; }
  set masterVolume(value: number) { this.master = this.clampVolume(value); this.updateVolume(); }
  get sfxVolume(): number { return this.sfx; }
  set sfxVolume(value: number) { this.sfx = this.clampVolume(value); this.updateVolume(); }

  unlock(): void {
    if (!this.enabled || this.disposed) return;
    this.paused = false;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.output = this.context.createGain();
        this.updateVolume();
        const limiter = this.context.createDynamicsCompressor();
        limiter.threshold.value = -18; limiter.ratio.value = 8;
        this.output.connect(limiter); limiter.connect(this.context.destination);
        this.noise = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
        const samples = this.noise.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
        this.loadSamples();
      }
      void this.context.resume().catch(() => {});
    } catch { /* Gameplay continues without audio if the browser cannot create AudioContext. */ }
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    if (this.enabled) this.unlock(); else this.pause();
    return this.enabled;
  }

  pause(): void {
    this.paused = true;
    for (const [source, voice] of this.voices) this.stopVoice(source, voice);
    this.lastImpact = -1;
    if (this.context) void this.context.suspend().catch(() => {});
  }

  swing(kind: AttackKind, attackStep = 0): void {
    const id = swingSound(kind, attackStep);
    const priority = kind === 'skill' ? 4 : kind === 'strong' ? 2 : 1;
    this.play(id, priority, 0.9, kind !== 'skill', () => this.synthSwing(kind, attackStep));
  }

  impact(kind: AttackKind, hits: number): void {
    if (!this.ready() || !this.context || hits <= 0) return;
    const time = this.context.currentTime;
    if (time - this.lastImpact < 0.065) return;
    this.lastImpact = time;
    const id = impactSound(kind, hits);
    this.play(id, id === 'impact-heavy-01' ? 2 : 1, impactLevel(hits), true, () => this.synthImpact(kind, hits));
  }

  enemyDeath(count: number): void {
    this.play('enemy-death-01', 1, Math.min(1, 0.65 + count * 0.035), true, () => {
      this.tone(170, 65, 0.24, 0.16, 'sawtooth', 1);
    });
  }

  playerHit(): void {
    this.play('player-hit-01', 4, 1, true, () => {
      this.noiseBurst(0.12, 0.23, 500, 4);
      this.tone(150, 70, 0.2, 0.23, 'triangle', 4);
    });
  }

  dodge(): void {
    this.play('dodge-01', 2, 0.8, true, () => this.noiseBurst(0.14, 0.16, 950, 2));
  }

  powerReady(): void {
    this.play('power-ready-01', 3, 0.85, false, () => {
      for (const frequency of [440, 554, 660]) this.tone(frequency, frequency * 1.01, 0.35, 0.09, 'sine', 3);
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abort.abort();
    this.pause();
    if (this.context) void this.context.close().catch(() => {});
    this.context = undefined;
    this.buffers.clear();
  }

  private clampVolume(value: number): number { return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0; }
  private updateVolume(): void { if (this.output) this.output.gain.value = this.master * this.sfx * 0.35; }
  private ready(): boolean { return this.enabled && !this.paused && this.context?.state === 'running' && !this.disposed; }

  private loadSamples(): void {
    const context = this.context!;
    for (const id of Object.keys(SOUND_FILES) as SoundId[]) {
      if (this.attempted.has(id)) continue;
      this.attempted.add(id);
      void (async () => {
        try {
          const response = await fetch(`${import.meta.env.BASE_URL}assets/audio/${SOUND_FILES[id]}`, { signal: this.abort.signal });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const buffer = await context.decodeAudioData(await response.arrayBuffer());
          if (!this.disposed && this.context === context) this.buffers.set(id, buffer);
        } catch (error) {
          if (!this.abort.signal.aborted) console.warn(`効果音 ${SOUND_FILES[id]} を読み込めませんでした。合成音を使用します。`, error);
        }
      })();
    }
  }

  private play(id: SoundId, priority: number, level: number, varyPitch: boolean, synth: () => void): void {
    const buffer = this.buffers.get(id);
    const mode = playbackMode(this.enabled, this.ready(), !!buffer);
    if (mode === 'buffer') this.playBuffer(buffer!, priority, level, varyPitch);
    else if (mode === 'synth') synth();
  }

  private playBuffer(buffer: AudioBuffer, priority: number, level: number, varyPitch: boolean): void {
    const context = this.context!;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = varyPitch ? 0.96 + Math.random() * 0.08 : 1;
    gain.gain.value = Math.min(2.6, Math.max(0, level * 2.6));
    source.connect(gain); gain.connect(this.output!);
    const cleanup = () => { source.disconnect(); gain.disconnect(); this.voices.delete(source); };
    if (!this.trackVoice(source, priority, cleanup)) { cleanup(); return; }
    source.start();
  }

  private synthSwing(kind: AttackKind, attackStep: number): void {
    if (kind === 'skill') {
      this.noiseBurst(0.32, 0.3, 1200, 4);
      for (const frequency of [220, 330, 440]) this.tone(frequency, frequency * 0.995, 0.65, 0.12, 'sine', 4);
    } else if (kind === 'strong') {
      this.noiseBurst(0.2, 0.27, 550, 2);
      this.tone(140, 60, 0.28, 0.22, 'triangle', 2);
    } else {
      this.noiseBurst(attackStep === 2 ? 0.16 : 0.1, attackStep === 2 ? 0.26 : 0.18, attackStep === 1 ? 1050 : attackStep === 2 ? 500 : 700, 1);
    }
  }

  private synthImpact(kind: AttackKind, hits: number): void {
    const heavy = impactSound(kind, hits) === 'impact-heavy-01';
    const gain = Math.min(0.8, 0.38 + hits * 0.025);
    this.tone(heavy ? 110 : 180, heavy ? 42 : 65, heavy ? 0.28 : 0.14, gain, 'triangle', heavy ? 2 : 1);
    this.noiseBurst(heavy ? 0.18 : 0.085, gain * 0.65, heavy ? 950 : 1700, heavy ? 2 : 1);
    if (kind === 'skill') {
      for (const frequency of [220, 330, 440]) this.tone(frequency, frequency * 0.995, 0.65, 0.12, 'sine', 4);
    }
  }

  private trackVoice(source: AudioScheduledSourceNode, priority: number, cleanup: () => void): boolean {
    const decision = selectVoice([...this.voices.values()].map((voice) => voice.priority), priority, MAX_VOICES);
    if (decision.kind === 'skip') return false;
    if (decision.kind === 'replace') {
      const [oldSource, oldVoice] = [...this.voices][decision.index];
      this.stopVoice(oldSource, oldVoice);
    }
    this.voices.set(source, { priority, cleanup });
    source.onended = cleanup;
    return true;
  }

  private stopVoice(source: AudioScheduledSourceNode, voice: ActiveVoice): void {
    source.onended = null;
    try { source.stop(); } catch { /* A voice can finish just before pause or replacement. */ }
    voice.cleanup();
  }

  private tone(start: number, end: number, duration: number, gain: number, type: OscillatorType, priority: number): void {
    const context = this.context!;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const now = context.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(start, now);
    oscillator.frequency.exponentialRampToValueAtTime(end, now + duration);
    envelope.gain.setValueAtTime(gain, now);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(envelope); envelope.connect(this.output!);
    const cleanup = () => { oscillator.disconnect(); envelope.disconnect(); this.voices.delete(oscillator); };
    if (!this.trackVoice(oscillator, priority, cleanup)) { cleanup(); return; }
    oscillator.start(now); oscillator.stop(now + duration);
  }

  private noiseBurst(duration: number, gain: number, frequency: number, priority: number): void {
    const context = this.context!;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    const now = context.currentTime;
    source.buffer = this.noise!;
    filter.type = 'bandpass'; filter.frequency.value = frequency; filter.Q.value = 0.65;
    envelope.gain.setValueAtTime(gain, now);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter); filter.connect(envelope); envelope.connect(this.output!);
    const cleanup = () => { source.disconnect(); filter.disconnect(); envelope.disconnect(); this.voices.delete(source); };
    if (!this.trackVoice(source, priority, cleanup)) { cleanup(); return; }
    source.start(now); source.stop(now + duration);
  }
}
