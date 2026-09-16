import { type Matrix, normalizeRow, sample } from './matrix';
import { hash32, Rng } from './prng';
import { at } from './util';
import { STEP_TEMPLATE, type VoiceName } from './voices';

/** 0 rest, 1 ghost, 2 normal, 3 accent. */
export type Strength = 0 | 1 | 2 | 3;

export const SUBDIVS = [2, 3, 4, 6] as const;
export type Subdiv = (typeof SUBDIVS)[number];
export const BEATS = [1, 2, 3, 4] as const;
export type Beats = (typeof BEATS)[number];

export interface Atom {
  seed: number;
  beats: Beats;
  subdiv: Subdiv;
  /** One 4x4 hit-strength chain per voice, indexed like the piece's voice list. */
  step: Matrix[];
}

export function generateStepMatrix(voice: VoiceName, rng: Rng, jitter = 0.35): Matrix {
  return STEP_TEMPLATE[voice].map((row) =>
    normalizeRow(row.map((v) => v * (1 + jitter * (2 * rng.next() - 1)))),
  );
}

export function generateAtom(rng: Rng, voices: readonly VoiceName[]): Atom {
  const r = rng.next();
  const beats: Beats = r < 0.45 ? 1 : r < 0.8 ? 2 : r < 0.92 ? 3 : 4;
  const s = rng.next();
  const subdiv: Subdiv = s < 0.55 ? 4 : s < 0.75 ? 2 : s < 0.92 ? 3 : 6;
  return {
    seed: rng.seed(),
    beats,
    subdiv,
    step: voices.map((v) => generateStepMatrix(v, rng)),
  };
}

export function atomSteps(atom: Atom): number {
  return atom.beats * atom.subdiv;
}

/**
 * Walk each voice's chain once per step from the atom's seed. Same atom, same
 * output, so an atom is a fixed motif until its seed or matrices change.
 */
export function renderAtom(atom: Atom): Uint8Array[] {
  const n = atomSteps(atom);
  return atom.step.map((m, v) => {
    const rng = new Rng(hash32(atom.seed, v));
    const out = new Uint8Array(n);
    let state = 0;
    for (let i = 0; i < n; i++) {
      state = sample(at(m, state), rng.next());
      out[i] = state;
    }
    return out;
  });
}
