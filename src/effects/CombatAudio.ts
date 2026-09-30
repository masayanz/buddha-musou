import type { AttackKind } from '../game/GameSession';

/** Short synthesized Foley, unlocked only by the player's start/sound gesture. */
export class CombatAudio {
  enabled = true;
  private context?: AudioContext;
  private output?: GainNode;
  private noise?: AudioBuffer;
  private lastImpact = -1;
  private readonly voices = new Map<AudioScheduledSourceNode, () => void>();

  unlock(): void {
    if (!this.enabled) return;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.output = this.context.createGain();
        this.output.gain.value = 0.24;
        const limiter = this.context.createDynamicsCompressor();
        limiter.threshold.value = -18; limiter.ratio.value = 8;
        this.output.connect(limiter); limiter.connect(this.context.destination);
        this.noise = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
        const samples = this.noise.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      }
      void this.context.resume().catch(() => {});
    } catch { /* The game remains playable when browser audio is unavailable. */ }
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    if (this.enabled) this.unlock(); else this.pause();
    return this.enabled;
  }

  pause(): void {
    for (const [voice, cleanup] of this.voices) { voice.stop(); cleanup(); }
    this.voices.clear(); this.lastImpact = -1;
    if (this.context) void this.context.suspend().catch(() => {});
  }

  swing(kind: AttackKind): void {
    if (!this.ready()) return;
    this.noiseBurst(kind === 'normal' ? 0.1 : 0.19, kind === 'normal' ? 0.18 : 0.28, 650);
  }

  impact(kind: AttackKind, hits: number): void {
    if (!this.ready() || !this.context) return;
    const time = this.context.currentTime;
    if (time - this.lastImpact < 0.065) return;
    this.lastImpact = time;
    const heavy = kind !== 'normal';
    const gain = Math.min(0.8, 0.38 + hits * 0.025);
    this.tone(heavy ? 110 : 180, heavy ? 42 : 65, heavy ? 0.28 : 0.14, gain, 'triangle');
    this.noiseBurst(heavy ? 0.18 : 0.085, gain * 0.65, heavy ? 950 : 1700);
    if (kind === 'skill') {
      for (const frequency of [220, 330, 440]) this.tone(frequency, frequency * 0.995, 0.65, 0.12, 'sine');
    }
  }

  dispose(): void { this.pause(); if (this.context) void this.context.close().catch(() => {}); this.context = undefined; }
  private ready(): boolean { return this.enabled && this.context?.state === 'running'; }

  private tone(start: number, end: number, duration: number, gain: number, type: OscillatorType): void {
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
    this.voices.set(oscillator, cleanup); oscillator.onended = cleanup;
    oscillator.start(now); oscillator.stop(now + duration);
  }

  private noiseBurst(duration: number, gain: number, frequency: number): void {
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
    this.voices.set(source, cleanup); source.onended = cleanup;
    source.start(now); source.stop(now + duration);
  }
}
