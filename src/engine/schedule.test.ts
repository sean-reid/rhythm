import { describe, expect, it } from 'vitest';
import type { Atom } from './atom';
import { atomHits, beatsToSeconds, stepBeat } from './schedule';

const atom = (beats: Atom['beats'], subdiv: Atom['subdiv']): Atom => ({
  seed: 0,
  beats,
  subdiv,
  step: [],
});

describe('stepBeat', () => {
  it('places straight steps on the grid', () => {
    expect(stepBeat(atom(1, 4), 0, 1)).toBe(0);
    expect(stepBeat(atom(1, 4), 2, 1)).toBe(0.5);
    expect(stepBeat(atom(2, 2), 2, 0)).toBe(1);
  });

  it('delays odd steps by swing up to a triplet', () => {
    expect(stepBeat(atom(1, 2), 1, 1)).toBeCloseTo(2 / 3);
    expect(stepBeat(atom(1, 4), 1, 0.5)).toBeCloseTo(0.25 + 0.5 / 12);
    expect(stepBeat(atom(1, 3), 1, 1)).toBeCloseTo(1 / 3);
  });
});

describe('atomHits', () => {
  it('emits one hit per non-rest step in time order', () => {
    const a = atom(1, 4);
    const steps = [new Uint8Array([3, 0, 2, 0]), new Uint8Array([0, 1, 0, 1])];
    const hits = atomHits(a, steps, 0);
    expect(hits).toEqual([
      { beat: 0, voice: 0, strength: 3 },
      { beat: 0.25, voice: 1, strength: 1 },
      { beat: 0.5, voice: 0, strength: 2 },
      { beat: 0.75, voice: 1, strength: 1 },
    ]);
  });
});

describe('beatsToSeconds', () => {
  it('converts at tempo', () => {
    expect(beatsToSeconds(4, 120)).toBe(2);
  });
});
