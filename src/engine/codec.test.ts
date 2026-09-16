import { describe, expect, it } from 'vitest';
import { decodePiece, deserialize, encodePiece, serialize } from './codec';
import { addLevel, addVoice, createPiece, setBpm, setPoolSize, setSwing } from './piece';

describe('codec', () => {
  it('round trips a piece exactly after one quantisation', async () => {
    let p = setSwing(setBpm(addVoice(addLevel(createPiece(21)), 'clap'), 133), 0.4);
    p = setPoolSize(p, 1, 5);
    const once = deserialize(serialize(p));
    expect(once.seed).toBe(p.seed);
    expect(once.bpm).toBe(133);
    expect(once.voices).toEqual(p.voices);
    expect(once.levels.map((l) => l.dwell)).toEqual(p.levels.map((l) => l.dwell));
    expect(once.atoms.map((a) => [a.seed, a.beats, a.subdiv])).toEqual(
      p.atoms.map((a) => [a.seed, a.beats, a.subdiv]),
    );
    once.root.forEach((row, i) =>
      row.forEach((v, j) => expect(Math.abs(v - (p.root[i]?.[j] ?? 0))).toBeLessThan(1 / 200)),
    );
    const twice = deserialize(serialize(once));
    expect(twice).toEqual(once);
    const s1 = await encodePiece(p);
    const s2 = await encodePiece(await decodePiece(s1));
    expect(s2).toBe(s1);
    expect(s1).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('stays compact', async () => {
    const s = await encodePiece(addLevel(addLevel(createPiece(22))));
    expect(s.length).toBeLessThan(1200);
  });

  it('rejects damaged input', async () => {
    const bytes = serialize(createPiece(23));
    expect(() => deserialize(bytes.slice(0, 40))).toThrow();
    const bad = bytes.slice();
    bad[0] = 9;
    expect(() => deserialize(bad)).toThrow(/version/);
    await expect(decodePiece('not-base64!!')).rejects.toThrow();
  });
});
