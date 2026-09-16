import { describe, expect, it } from 'vitest';
import {
  dequantizeRow,
  normalizeRow,
  quantizeRow,
  resizeMatrix,
  sample,
  setCell,
  stickyMatrix,
} from './matrix';
import { Rng } from './prng';

const sum = (r: readonly number[]) => r.reduce((s, v) => s + v, 0);

describe('normalizeRow', () => {
  it('scales to 1 and treats an empty row as uniform', () => {
    expect(sum(normalizeRow([1, 3]))).toBeCloseTo(1);
    expect(normalizeRow([0, 0, 0])).toEqual([1 / 3, 1 / 3, 1 / 3]);
    expect(normalizeRow([-1, 2])).toEqual([0, 1]);
  });
});

describe('sample', () => {
  it('picks by cumulative weight', () => {
    const row = [0.5, 0.25, 0.25];
    expect(sample(row, 0)).toBe(0);
    expect(sample(row, 0.49)).toBe(0);
    expect(sample(row, 0.5)).toBe(1);
    expect(sample(row, 0.999)).toBe(2);
  });

  it('falls back to uniform over an all-zero row', () => {
    expect(sample([0, 0, 0, 0], 0.6)).toBe(2);
  });
});

describe('stickyMatrix', () => {
  it('is row stochastic with the requested diagonal', () => {
    const m = stickyMatrix(6, new Rng(1), 0.4);
    expect(m).toHaveLength(6);
    m.forEach((row, i) => {
      expect(sum(row)).toBeCloseTo(1);
      expect(row[i]).toBeCloseTo(0.4);
    });
  });
});

describe('resizeMatrix', () => {
  it('keeps the shared block and stays stochastic', () => {
    const m = stickyMatrix(4, new Rng(2), 0.5);
    const big = resizeMatrix(m, 6, new Rng(3), 0.5);
    expect(big).toHaveLength(6);
    big.forEach((row) => expect(sum(row)).toBeCloseTo(1));
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        expect(big[i]?.[j]).toBeLessThanOrEqual(m[i]?.[j] ?? 0);
      }
    const small = resizeMatrix(big, 4, new Rng(4), 0.5);
    small.forEach((row) => expect(sum(row)).toBeCloseTo(1));
  });
});

describe('setCell', () => {
  it('pins the cell and rescales the rest of the row', () => {
    const m = [
      [0.25, 0.25, 0.5],
      [1, 0, 0],
    ];
    const out = setCell(m, 0, 2, 0.8);
    expect(out[0]?.[2]).toBe(0.8);
    expect(out[0]?.[0]).toBeCloseTo(0.1);
    expect(sum(out[0] ?? [])).toBeCloseTo(1);
    expect(out[1]).toBe(m[1]);
  });

  it('spreads evenly when the other cells were all zero', () => {
    const out = setCell([[0, 1, 0]], 0, 1, 0.4);
    expect(out[0]).toEqual([0.3, 0.4, 0.3]);
  });
});

describe('quantizeRow', () => {
  it('round trips within one step and never zeroes a row', () => {
    const row = normalizeRow([0.7, 0.2, 0.1, 0.0]);
    const back = dequantizeRow(quantizeRow(row));
    back.forEach((v, i) => expect(Math.abs(v - (row[i] ?? 0))).toBeLessThan(1 / 255));
    expect(quantizeRow([0.001, 0, 0])).toEqual([255, 0, 0]);
  });
});
