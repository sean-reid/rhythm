import type { Piece, WalkState } from '../engine';
import { advance, at, atomHits, beatsToSeconds, renderAtom } from '../engine';

/** One occurrence of an atom in the played sequence, positioned in context seconds. */
export interface Entry {
  state: WalkState;
  start: number;
  duration: number;
}

const stepCache = new WeakMap<object, Uint8Array[]>();

/** Atoms are immutable values, so their rendered steps are cached by identity. */
export function stepsFor(piece: Piece, atomIndex: number): Uint8Array[] {
  const atom = at(piece.atoms, atomIndex);
  let steps = stepCache.get(atom);
  if (!steps) {
    steps = renderAtom(atom);
    stepCache.set(atom, steps);
  }
  return steps;
}

export function entryFor(piece: Piece, state: WalkState, start: number): Entry {
  const atom = at(piece.atoms, state.atom);
  return { state, start, duration: beatsToSeconds(atom.beats, piece.bpm) };
}

export function nextEntry(piece: Piece, e: Entry): Entry {
  return entryFor(piece, advance(piece, e.state), e.start + e.duration);
}

/** Entries from `from` (inclusive) until one starts at or after `until` seconds. */
export function entriesUntil(piece: Piece, from: Entry, until: number, max = 512): Entry[] {
  const out: Entry[] = [];
  let e = from;
  while (e.start < until && out.length < max) {
    out.push(e);
    e = nextEntry(piece, e);
  }
  return out;
}

export function entryHits(piece: Piece, e: Entry) {
  const atom = at(piece.atoms, e.state.atom);
  return atomHits(atom, stepsFor(piece, e.state.atom), piece.swing).map((h) => ({
    ...h,
    time: e.start + beatsToSeconds(h.beat, piece.bpm),
  }));
}
