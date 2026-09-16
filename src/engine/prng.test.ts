import { describe, expect, it } from 'vitest';
import { hash32, Rng, uniform } from './prng';

describe('hash32', () => {
  it('is deterministic and order sensitive', () => {
    expect(hash32(1, 2, 3)).toBe(hash32(1, 2, 3));
    expect(hash32(1, 2, 3)).not.toBe(hash32(3, 2, 1));
    expect(hash32(7)).not.toBe(hash32(8));
  });

  it('handles negative and large inputs', () => {
    expect(hash32(-1, 0)).toBeGreaterThanOrEqual(0);
    expect(hash32(2 ** 32 - 1)).toBeLessThan(2 ** 32);
  });
});

describe('uniform', () => {
  it('stays in [0, 1) with a sensible mean', () => {
    let sum = 0;
    for (let i = 0; i < 5000; i++) {
      const u = uniform(42, i, 0);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
      sum += u;
    }
    expect(sum / 5000).toBeCloseTo(0.5, 1);
  });
});

describe('Rng', () => {
  it('replays from a seed', () => {
    const a = new Rng(123);
    const b = new Rng(123);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('differs across seeds', () => {
    expect(new Rng(1).next()).not.toBe(new Rng(2).next());
  });

  it('int stays in range', () => {
    const r = new Rng(9);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(6);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
    }
  });
});
