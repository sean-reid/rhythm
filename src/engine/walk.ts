import { sample } from './matrix';
import type { Piece } from './piece';
import { uniform } from './prng';
import { at } from './util';

export interface WalkState {
  /** Index of this atom in the piece's sequence. */
  t: number;
  atom: number;
  /** Current node per meta level, nodes[k] indexes levels[k].nodes. */
  nodes: number[];
  /** Steps taken inside the current node per meta level. */
  counters: number[];
}

/**
 * Every draw is uniform(seed, t, level), so a state at time t is a pure
 * function of the matrices and the seed. Editing a matrix changes the future
 * from the current position and nothing else.
 */
export function initialState(p: Piece): WalkState {
  const nodes = p.levels.map((lv, k) => Math.floor(uniform(p.seed, 0, k + 1) * lv.nodes.length));
  return {
    t: 0,
    atom: Math.floor(uniform(p.seed, 0, 0) * p.atoms.length),
    nodes,
    counters: p.levels.map(() => 0),
  };
}

export function advance(p: Piece, s: WalkState): WalkState {
  const t = s.t + 1;
  const counters = s.counters.slice();
  const nodes = s.nodes.slice();
  let rolled = -1;
  for (let k = 0; k < p.levels.length; k++) {
    counters[k] = at(counters, k) + 1;
    if (at(counters, k) < at(p.levels, k).dwell) break;
    counters[k] = 0;
    rolled = k;
  }
  for (let k = rolled; k >= 0; k--) {
    const above =
      k + 1 < p.levels.length ? at(at(p.levels, k + 1).nodes, at(nodes, k + 1)) : p.root;
    nodes[k] = sample(at(above, at(nodes, k)), uniform(p.seed, t, k + 1));
  }
  const matrix = at(at(p.levels, 0).nodes, at(nodes, 0));
  const atom = sample(at(matrix, s.atom), uniform(p.seed, t, 0));
  return { t, atom, nodes, counters };
}

/** Clamp a state to a piece whose shape changed under it (pool or level edits). */
export function conform(p: Piece, s: WalkState): WalkState {
  const nodes = p.levels.map((lv, k) => Math.min(s.nodes[k] ?? 0, lv.nodes.length - 1));
  const counters = p.levels.map((lv, k) => Math.min(s.counters[k] ?? 0, lv.dwell - 1));
  return { t: s.t, atom: Math.min(s.atom, p.atoms.length - 1), nodes, counters };
}

export function sequence(p: Piece, count: number): WalkState[] {
  const out: WalkState[] = [];
  let s = initialState(p);
  for (let i = 0; i < count; i++) {
    out.push(s);
    s = advance(p, s);
  }
  return out;
}
