import { type Atom, type Beats, generateAtom, generateStepMatrix, type Subdiv } from './atom';
import { type Matrix, resizeMatrix, setCell, stickyMatrix } from './matrix';
import { hash32, Rng } from './prng';
import { at, clamp, replaceAt } from './util';
import { DEFAULT_VOICES, type VoiceName } from './voices';

export const KITS = ['acoustic', 'electronic'] as const;
export type Kit = (typeof KITS)[number];

export const LIMITS = {
  pool: { min: 4, max: 8 },
  levels: { min: 1, max: 4 },
  voices: { min: 1, max: 8 },
  bpm: { min: 40, max: 240 },
  dwell: { min: 1, max: 32 },
} as const;

/** A meta level: each node is a transition matrix over the layer below. */
export interface Level {
  dwell: number;
  nodes: Matrix[];
}

export interface Piece {
  version: 1;
  seed: number;
  bpm: number;
  swing: number;
  kit: Kit;
  voices: VoiceName[];
  atoms: Atom[];
  /** levels[0] walks atoms, levels[k] walks levels[k-1].nodes. */
  levels: Level[];
  /** Walks the top level's nodes. */
  root: Matrix;
}

const META_STAY = 0.5;
const ATOM_STAY = 0.3;

/** Number of nodes in layer k, where layer 0 is the atom pool and layer k>0 is levels[k-1]. */
export function layerSize(p: Piece, layer: number): number {
  return layer === 0 ? p.atoms.length : at(p.levels, layer - 1).nodes.length;
}

export function layerCount(p: Piece): number {
  return p.levels.length + 1;
}

export function createPiece(seed: number): Piece {
  const rng = new Rng(seed);
  const voices = DEFAULT_VOICES.slice();
  const atoms: Atom[] = [];
  for (let i = 0; i < 6; i++) atoms.push(generateAtom(rng, voices));
  const nodes: Matrix[] = [];
  for (let i = 0; i < 4; i++) nodes.push(stickyMatrix(atoms.length, rng, ATOM_STAY));
  return {
    version: 1,
    seed,
    bpm: 96 + rng.int(24),
    swing: 0,
    kit: 'acoustic',
    voices,
    atoms,
    levels: [{ dwell: 4, nodes }],
    root: stickyMatrix(nodes.length, rng, META_STAY),
  };
}

function editRng(p: Piece, ...tags: number[]): Rng {
  return new Rng(hash32(p.seed, ...tags));
}

export function rerollPiece(p: Piece, seed: number): Piece {
  return { ...p, seed, atoms: p.atoms.map((a, i) => ({ ...a, seed: hash32(seed, i) })) };
}

export function rerollAtom(p: Piece, index: number): Piece {
  const a = at(p.atoms, index);
  const seed = hash32(a.seed, 0x5eed);
  return { ...p, atoms: replaceAt(p.atoms, index, { ...a, seed }) };
}

export function setBpm(p: Piece, bpm: number): Piece {
  return { ...p, bpm: clamp(Math.round(bpm), LIMITS.bpm.min, LIMITS.bpm.max) };
}

export function setSwing(p: Piece, swing: number): Piece {
  return { ...p, swing: clamp(swing, 0, 1) };
}

export function setKit(p: Piece, kit: Kit): Piece {
  return { ...p, kit };
}

export function setAtomShape(p: Piece, index: number, beats: Beats, subdiv: Subdiv): Piece {
  const a = at(p.atoms, index);
  return { ...p, atoms: replaceAt(p.atoms, index, { ...a, beats, subdiv }) };
}

export function setStepCell(
  p: Piece,
  atom: number,
  voice: number,
  from: number,
  to: number,
  value: number,
): Piece {
  const a = at(p.atoms, atom);
  const step = replaceAt(a.step, voice, setCell(at(a.step, voice), from, to, value));
  return { ...p, atoms: replaceAt(p.atoms, atom, { ...a, step }) };
}

/** Copy one atom's step chains (all voices) onto every other atom. */
export function copyStepToAll(p: Piece, atom: number): Piece {
  const src = at(p.atoms, atom).step;
  return { ...p, atoms: p.atoms.map((a, i) => (i === atom ? a : { ...a, step: src })) };
}

/** Edit a cell of the matrix that walks layer `layer`; node -1 addresses the root. */
export function setNodeCell(
  p: Piece,
  level: number,
  node: number,
  from: number,
  to: number,
  value: number,
): Piece {
  if (node < 0) return { ...p, root: setCell(p.root, from, to, value) };
  const lv = at(p.levels, level);
  const nodes = replaceAt(lv.nodes, node, setCell(at(lv.nodes, node), from, to, value));
  return { ...p, levels: replaceAt(p.levels, level, { ...lv, nodes }) };
}

export function setDwell(p: Piece, level: number, dwell: number): Piece {
  const lv = at(p.levels, level);
  const d = clamp(Math.round(dwell), LIMITS.dwell.min, LIMITS.dwell.max);
  return { ...p, levels: replaceAt(p.levels, level, { ...lv, dwell: d }) };
}

/** The old root becomes node 0 of the new top level; siblings and a new root are generated. */
export function addLevel(p: Piece): Piece {
  if (p.levels.length >= LIMITS.levels.max) return p;
  const rng = editRng(p, 1, p.levels.length);
  const below = layerSize(p, p.levels.length);
  const nodes: Matrix[] = [p.root];
  for (let i = 1; i < 4; i++) nodes.push(stickyMatrix(below, rng, META_STAY));
  return {
    ...p,
    levels: [...p.levels, { dwell: 4, nodes }],
    root: stickyMatrix(nodes.length, rng, META_STAY),
  };
}

/** Drop the top level; the node `keep` of it becomes the root. */
export function removeLevel(p: Piece, keep = 0): Piece {
  if (p.levels.length <= LIMITS.levels.min) return p;
  const top = at(p.levels, p.levels.length - 1);
  return {
    ...p,
    levels: p.levels.slice(0, -1),
    root: at(top.nodes, clamp(keep, 0, top.nodes.length - 1)),
  };
}

/** Resize layer k's pool and every matrix that walks it. */
export function setPoolSize(p: Piece, layer: number, size: number): Piece {
  const n = clamp(Math.round(size), LIMITS.pool.min, LIMITS.pool.max);
  const rng = editRng(p, 2, layer, n);
  let next = p;
  if (layer === 0) {
    const atoms = p.atoms.slice(0, n);
    while (atoms.length < n) atoms.push(generateAtom(rng, p.voices));
    next = { ...next, atoms };
  } else {
    const lv = at(p.levels, layer - 1);
    const below = layerSize(p, layer - 1);
    const nodes = lv.nodes.slice(0, n);
    while (nodes.length < n)
      nodes.push(stickyMatrix(below, rng, layer === 1 ? ATOM_STAY : META_STAY));
    next = { ...next, levels: replaceAt(p.levels, layer - 1, { ...lv, nodes }) };
  }
  const stay = layer === 0 ? ATOM_STAY : META_STAY;
  if (layer < p.levels.length) {
    const above = at(next.levels, layer);
    const nodes = above.nodes.map((m) => resizeMatrix(m, n, rng, stay));
    next = { ...next, levels: replaceAt(next.levels, layer, { ...above, nodes }) };
  } else {
    next = { ...next, root: resizeMatrix(next.root, n, rng, stay) };
  }
  return next;
}

export function addVoice(p: Piece, voice: VoiceName): Piece {
  if (p.voices.length >= LIMITS.voices.max || p.voices.includes(voice)) return p;
  const rng = editRng(p, 3, p.voices.length);
  return {
    ...p,
    voices: [...p.voices, voice],
    atoms: p.atoms.map((a) => ({ ...a, step: [...a.step, generateStepMatrix(voice, rng)] })),
  };
}

export function removeVoice(p: Piece, index: number): Piece {
  if (p.voices.length <= LIMITS.voices.min) return p;
  return {
    ...p,
    voices: p.voices.filter((_, i) => i !== index),
    atoms: p.atoms.map((a) => ({ ...a, step: a.step.filter((_, i) => i !== index) })),
  };
}
