import { describe, expect, it } from 'vitest';
import { addLevel, createPiece, setDwell } from './piece';
import { advance, conform, initialState, sequence } from './walk';

describe('walk', () => {
  it('replays exactly from the seed', () => {
    const p = createPiece(11);
    expect(sequence(p, 200)).toEqual(sequence(p, 200));
    expect(sequence(p, 50).map((s) => s.atom)).not.toEqual(
      sequence(createPiece(12), 50).map((s) => s.atom),
    );
  });

  it('stays in bounds and visits more than one atom and node', () => {
    const p = addLevel(addLevel(createPiece(13)));
    const seq = sequence(p, 2000);
    const atoms = new Set<number>();
    const nodes = p.levels.map(() => new Set<number>());
    for (const s of seq) {
      expect(s.atom).toBeLessThan(p.atoms.length);
      atoms.add(s.atom);
      s.nodes.forEach((n, k) => {
        expect(n).toBeLessThan(p.levels[k]?.nodes.length ?? 0);
        nodes[k]?.add(n);
      });
    }
    expect(atoms.size).toBeGreaterThan(2);
    nodes.forEach((set) => expect(set.size).toBeGreaterThan(1));
  });

  it('only changes a level when the one below has rolled over dwell times', () => {
    let p = addLevel(createPiece(14));
    p = setDwell(p, 0, 3);
    p = setDwell(p, 1, 2);
    const seq = sequence(p, 300);
    for (let i = 1; i < seq.length; i++) {
      const a = seq[i - 1];
      const b = seq[i];
      if (!a || !b) throw new Error('missing');
      if (b.t % 3 !== 0) expect(b.nodes[0]).toBe(a.nodes[0]);
      if (b.t % 6 !== 0) expect(b.nodes[1]).toBe(a.nodes[1]);
      expect(b.counters[0]).toBe(b.t % 3);
    }
  });

  it('reads matrices live at the next hop', () => {
    const p = createPiece(15);
    const s = initialState(p);
    const forced = {
      ...p,
      levels: [
        {
          dwell: p.levels[0]?.dwell ?? 4,
          nodes: (p.levels[0]?.nodes ?? []).map((m) =>
            m.map((row) => row.map((_, j) => (j === 3 ? 1 : 0))),
          ),
        },
      ],
    };
    expect(advance(forced, s).atom).toBe(3);
    expect(advance(forced, advance(forced, s)).atom).toBe(3);
  });

  it('conform clamps a state to a shrunken piece', () => {
    const p = createPiece(16);
    const s = { t: 5, atom: 7, nodes: [9], counters: [30] };
    const c = conform(p, s);
    expect(c.atom).toBe(p.atoms.length - 1);
    expect(c.nodes[0]).toBe((p.levels[0]?.nodes.length ?? 1) - 1);
    expect(c.counters[0]).toBe((p.levels[0]?.dwell ?? 1) - 1);
  });
});
