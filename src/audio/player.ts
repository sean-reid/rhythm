import type { Piece, VoiceName, WalkState } from '../engine';
import { conform, initialState } from '../engine';
import { scheduleHit } from './hit';
import { loadKit, type Sample } from './kit';
import { type Entry, entryFor, entryHits, nextEntry } from './timeline';

const LOOKAHEAD = 0.15;
const TICK_MS = 25;

export interface Mix {
  muted: readonly boolean[];
  solo: number | null;
}

/**
 * Lookahead scheduler. Whole atoms are committed to the audio clock once they
 * fall inside the horizon; everything after `head` is still open to edits.
 */
export class Player {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voiceGains: GainNode[] = [];
  private samples = new Map<VoiceName, Sample>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private piece: Piece;
  private mix: Mix = { muted: [], solo: null };
  /** Next entry to commit to the audio clock. */
  head: Entry;
  /** Entries already committed, oldest first, trimmed as they fall off the visible past. */
  played: Entry[] = [];
  playing = false;
  private pausedAt = 0;
  onChange: (() => void) | null = null;
  loading = false;

  constructor(piece: Piece) {
    this.piece = piece;
    this.head = entryFor(piece, initialState(piece), 0);
  }

  now(): number {
    if (!this.playing || !this.ctx) return this.pausedAt;
    return this.ctx.currentTime;
  }

  /** Track the live piece: future entries re-derive from `head` automatically. */
  setPiece(piece: Piece): void {
    const shapeChanged =
      piece.atoms.length !== this.piece.atoms.length ||
      piece.levels.length !== this.piece.levels.length ||
      piece.levels.some((lv, k) => lv.nodes.length !== this.piece.levels[k]?.nodes.length);
    const voicesChanged = piece.voices.join() !== this.piece.voices.join();
    const kitChanged = piece.kit !== this.piece.kit;
    this.piece = piece;
    const state: WalkState = shapeChanged ? conform(piece, this.head.state) : this.head.state;
    this.head = entryFor(piece, state, this.head.start);
    if (this.ctx && (voicesChanged || kitChanged)) void this.loadSamples();
    if (voicesChanged) this.ensureVoiceGains();
  }

  setMix(mix: Mix): void {
    this.mix = mix;
    this.applyMix();
  }

  async start(): Promise<void> {
    if (this.playing) return;
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      this.ensureVoiceGains();
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    if (this.samples.size === 0) await this.loadSamples();
    const offset = this.ctx.currentTime + 0.05 - this.head.start;
    this.head = { ...this.head, start: this.head.start + offset };
    this.played = this.played.map((e) => ({ ...e, start: e.start + offset }));
    this.playing = true;
    this.tick();
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.onChange?.();
  }

  stop(): void {
    if (!this.playing) return;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.playing = false;
    this.pausedAt = this.ctx?.currentTime ?? 0;
    this.onChange?.();
  }

  toggle(): Promise<void> {
    if (this.playing) {
      this.stop();
      return Promise.resolve();
    }
    return this.start();
  }

  /** Restart the sequence from t = 0 with the current piece, keeping the clock position. */
  rewind(): void {
    const start = this.playing ? (this.ctx?.currentTime ?? 0) + 0.05 : this.pausedAt;
    this.head = entryFor(this.piece, initialState(this.piece), start);
    this.played = [];
    this.onChange?.();
  }

  sampleFor(voice: VoiceName): Sample | undefined {
    return this.samples.get(voice);
  }

  async loadSamples(): Promise<void> {
    if (!this.ctx) return;
    this.loading = true;
    this.onChange?.();
    const kit = this.piece.kit;
    const map = await loadKit(this.ctx, kit, this.piece.voices);
    if (kit === this.piece.kit) this.samples = map;
    this.loading = false;
    this.onChange?.();
  }

  private ensureVoiceGains(): void {
    if (!this.ctx || !this.master) return;
    while (this.voiceGains.length < this.piece.voices.length) {
      const g = this.ctx.createGain();
      g.connect(this.master);
      this.voiceGains.push(g);
    }
    this.applyMix();
  }

  private applyMix(): void {
    this.voiceGains.forEach((g, v) => {
      const off = this.mix.muted[v] || (this.mix.solo !== null && this.mix.solo !== v);
      g.gain.value = off ? 0 : 1;
    });
  }

  private tick(): void {
    if (!this.ctx) return;
    const horizon = this.ctx.currentTime + LOOKAHEAD;
    let committed = false;
    while (this.head.start < horizon) {
      this.commit(this.head);
      this.played.push(this.head);
      this.head = nextEntry(this.piece, this.head);
      committed = true;
    }
    const keepFrom = this.ctx.currentTime - 60;
    while (
      this.played.length > 0 &&
      (this.played[0]?.start ?? 0) + (this.played[0]?.duration ?? 0) < keepFrom
    ) {
      this.played.shift();
    }
    if (committed) this.onChange?.();
  }

  private commit(e: Entry): void {
    if (!this.ctx) return;
    for (const h of entryHits(this.piece, e)) {
      const voice = this.piece.voices[h.voice];
      const sample = voice ? this.samples.get(voice) : undefined;
      const dest = this.voiceGains[h.voice];
      if (!sample || !dest) continue;
      scheduleHit(this.ctx, dest, sample, h.time, h.strength);
    }
  }
}
