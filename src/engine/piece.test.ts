import { describe, expect, it } from 'vitest';
import {
  addLevel,
  addVoice,
  copyStepToAll,
  createPiece,
  layerSize,
  LIMITS,
  removeLevel,
  removeVoice,
  rerollAtom,
  rerollPiece,
  setNodeCell,
  setPoolSize,
  setStepCell,
} from './piece';

const rowSums = (m: number[][]) => m.map((r) => r.reduce((s, v) => s + v, 0));

describe('createPiece', () => {
  it('builds a consistent two-layer piece', () => {
    const p = createPiece(1);
    expect(p.atoms).toHaveLength(6);
    expect(p.levels).toHaveLength(1);
    expect(p.levels[0]?.nodes).toHaveLength(4);
    p.levels[0]?.nodes.forEach((m) => {
      expect(m).toHaveLength(p.atoms.length);
      rowSums(m).forEach((s) => expect(s).toBeCloseTo(1));
    });
    expect(p.root).toHaveLength(4);
    expect(p.bpm).toBeGreaterThanOrEqual(LIMITS.bpm.min);
    p.atoms.forEach((a) => expect(a.step).toHaveLength(p.voices.length));
  });

  it('is deterministic per seed', () => {
    expect(createPiece(77)).toEqual(createPiece(77));
    expect(createPiece(77).atoms[0]?.seed).not.toBe(createPiece(78).atoms[0]?.seed);
  });
});

describe('levels', () => {
  it('addLevel keeps the old root as node 0 and caps at the limit', () => {
    let p = createPiece(2);
    const root = p.root;
    p = addLevel(p);
    expect(p.levels).toHaveLength(2);
    expect(p.levels[1]?.nodes[0]).toBe(root);
    expect(p.root).toHaveLength(p.levels[1]?.nodes.length ?? 0);
    for (let i = 0; i < 10; i++) p = addLevel(p);
    expect(p.levels).toHaveLength(LIMITS.levels.max);
  });

  it('removeLevel promotes the kept node to root', () => {
    let p = addLevel(createPiece(3));
    const keep = p.levels[1]?.nodes[2];
    p = removeLevel(p, 2);
    expect(p.levels).toHaveLength(1);
    expect(p.root).toBe(keep);
    expect(removeLevel(p)).toBe(p);
  });
});

describe('setPoolSize', () => {
  it('resizes atoms and every matrix walking them', () => {
    const p = setPoolSize(createPiece(4), 0, 8);
    expect(p.atoms).toHaveLength(8);
    p.levels[0]?.nodes.forEach((m) => {
      expect(m).toHaveLength(8);
      rowSums(m).forEach((s) => expect(s).toBeCloseTo(1));
    });
    const q = setPoolSize(p, 0, 4);
    expect(q.atoms).toHaveLength(4);
    q.levels[0]?.nodes.forEach((m) => expect(m).toHaveLength(4));
  });

  it('resizes a meta level and the root above it', () => {
    const p = setPoolSize(addLevel(createPiece(5)), 1, 7);
    expect(layerSize(p, 1)).toBe(7);
    p.levels[1]?.nodes.forEach((m) => expect(m).toHaveLength(7));
    const q = setPoolSize(p, 2, 5);
    expect(q.root).toHaveLength(5);
    expect(q.levels[1]?.nodes).toHaveLength(5);
  });
});

describe('voices', () => {
  it('keeps atom chains aligned with the voice list', () => {
    let p = addVoice(createPiece(6), 'clap');
    expect(p.voices).toHaveLength(5);
    p.atoms.forEach((a) => expect(a.step).toHaveLength(5));
    expect(addVoice(p, 'clap')).toBe(p);
    p = removeVoice(p, 0);
    expect(p.voices[0]).toBe('snare');
    p.atoms.forEach((a) => expect(a.step).toHaveLength(4));
  });
});

describe('cell edits', () => {
  it('edit one step cell without touching other atoms', () => {
    const p = createPiece(7);
    const q = setStepCell(p, 1, 0, 0, 3, 0.9);
    expect(q.atoms[1]?.step[0]?.[0]?.[3]).toBe(0.9);
    expect(q.atoms[0]).toBe(p.atoms[0]);
    const all = copyStepToAll(q, 1);
    all.atoms.forEach((a) => expect(a.step).toBe(q.atoms[1]?.step));
  });

  it('edits node and root cells', () => {
    const p = createPiece(7);
    expect(setNodeCell(p, 0, 2, 1, 1, 1).levels[0]?.nodes[2]?.[1]).toEqual([0, 1, 0, 0, 0, 0]);
    expect(setNodeCell(p, 0, -1, 0, 3, 1).root[0]).toEqual([0, 0, 0, 1]);
  });
});

describe('reroll', () => {
  it('reseeds atoms but keeps matrices', () => {
    const p = createPiece(8);
    const q = rerollPiece(p, 9);
    expect(q.levels).toBe(p.levels);
    expect(q.atoms[0]?.step).toBe(p.atoms[0]?.step);
    expect(q.atoms[0]?.seed).not.toBe(p.atoms[0]?.seed);
    const r = rerollAtom(p, 2);
    expect(r.atoms[2]?.seed).not.toBe(p.atoms[2]?.seed);
    expect(r.atoms[1]).toBe(p.atoms[1]);
  });
});
