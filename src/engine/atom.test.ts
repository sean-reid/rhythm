import { describe, expect, it } from 'vitest';
import { atomSteps, generateAtom, renderAtom } from './atom';
import { Rng } from './prng';
import { DEFAULT_VOICES } from './voices';

describe('generateAtom', () => {
  it('has one chain per voice and a legal shape', () => {
    const a = generateAtom(new Rng(5), DEFAULT_VOICES);
    expect(a.step).toHaveLength(DEFAULT_VOICES.length);
    expect([1, 2, 3, 4]).toContain(a.beats);
    expect([2, 3, 4, 6]).toContain(a.subdiv);
    a.step.forEach((m) =>
      m.forEach((row) => expect(row.reduce((s, v) => s + v, 0)).toBeCloseTo(1)),
    );
  });
});

describe('renderAtom', () => {
  it('is deterministic per seed and sized by beats times subdiv', () => {
    const a = generateAtom(new Rng(8), DEFAULT_VOICES);
    const x = renderAtom(a);
    const y = renderAtom(a);
    expect(x).toHaveLength(DEFAULT_VOICES.length);
    x.forEach((row, v) => {
      expect(row).toHaveLength(atomSteps(a));
      expect(Array.from(row)).toEqual(Array.from(y[v] ?? []));
      row.forEach((s) => expect(s).toBeLessThanOrEqual(3));
    });
  });

  it('changes with the seed and not with the voice order of other voices', () => {
    const a = generateAtom(new Rng(8), DEFAULT_VOICES);
    const b = { ...a, seed: a.seed + 1 };
    const ra = renderAtom(a).map((r) => Array.from(r).join(''));
    const rb = renderAtom(b).map((r) => Array.from(r).join(''));
    expect(ra).not.toEqual(rb);
  });

  it('produces hits, not silence, from the default templates', () => {
    let hits = 0;
    let total = 0;
    for (let i = 0; i < 20; i++) {
      const a = generateAtom(new Rng(100 + i), DEFAULT_VOICES);
      for (const row of renderAtom(a)) {
        total += row.length;
        row.forEach((s) => (hits += s > 0 ? 1 : 0));
      }
    }
    expect(hits / total).toBeGreaterThan(0.25);
    expect(hits / total).toBeLessThan(0.75);
  });
});
