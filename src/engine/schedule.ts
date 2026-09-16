import type { Atom, Strength } from './atom';
import { at } from './util';

export interface Hit {
  /** Beats from the start of the atom. */
  beat: number;
  voice: number;
  strength: Strength;
}

export const VELOCITY: Record<Strength, number> = { 0: 0, 1: 0.35, 2: 0.7, 3: 1 };

/** Swing delays odd steps by up to a third of a step, which at 1.0 is a triplet feel. Even subdivisions only. */
export function stepBeat(atom: Atom, step: number, swing: number): number {
  const base = step / atom.subdiv;
  if (step % 2 === 1 && atom.subdiv % 2 === 0) return base + swing / (3 * atom.subdiv);
  return base;
}

export function atomHits(atom: Atom, steps: readonly Uint8Array[], swing: number): Hit[] {
  const hits: Hit[] = [];
  const n = atom.beats * atom.subdiv;
  for (let i = 0; i < n; i++) {
    for (let v = 0; v < steps.length; v++) {
      const s = at(steps, v)[i] ?? 0;
      if (s > 0) hits.push({ beat: stepBeat(atom, i, swing), voice: v, strength: s as Strength });
    }
  }
  return hits;
}

export function beatsToSeconds(beats: number, bpm: number): number {
  return (beats * 60) / bpm;
}
