import type { Rng } from './prng';
import { at, clamp } from './util';

/** Row-stochastic square matrix: m[from][to] is the probability of moving from row to column. */
export type Matrix = number[][];

export function normalizeRow(row: readonly number[]): number[] {
  let sum = 0;
  for (const v of row) sum += v > 0 ? v : 0;
  if (sum <= 0) return row.map(() => 1 / row.length);
  return row.map((v) => (v > 0 ? v / sum : 0));
}

export function normalize(m: Matrix): Matrix {
  return m.map(normalizeRow);
}

/** Index chosen by uniform draw u in [0, 1) over a row of weights. */
export function sample(row: readonly number[], u: number): number {
  let sum = 0;
  for (const v of row) sum += v > 0 ? v : 0;
  if (sum <= 0) return Math.min(row.length - 1, Math.floor(u * row.length));
  let acc = 0;
  const target = u * sum;
  for (let i = 0; i < row.length; i++) {
    acc += Math.max(0, at(row, i));
    if (target < acc) return i;
  }
  return row.length - 1;
}

/**
 * A matrix that tends to stay put. Diagonal gets `stay`, the rest of each row
 * is squared noise so a few off-diagonal links dominate.
 */
export function stickyMatrix(n: number, rng: Rng, stay: number): Matrix {
  const m: Matrix = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) row.push(i === j ? 0 : rng.next() ** 2 + 0.02);
    const off = row.reduce((s, v) => s + v, 0);
    m.push(row.map((v, j) => (i === j ? stay : (v / off) * (1 - stay))));
  }
  return n === 1 ? [[1]] : m;
}

/** Grow or shrink to n, keeping the shared block and filling new cells with light noise. */
export function resizeMatrix(m: Matrix, n: number, rng: Rng, stay: number): Matrix {
  const old = m.length;
  if (old === n) return m;
  const out: Matrix = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    const src = i < old ? at(m, i) : null;
    const mean = src ? src.reduce((s, v) => s + v, 0) / Math.max(1, src.length) : 0;
    for (let j = 0; j < n; j++) {
      if (src && j < old) row.push(at(src, j));
      else if (src) row.push(mean * 0.5 * (rng.next() ** 2 + 0.05));
      else row.push(i === j ? stay : (1 - stay) * (rng.next() ** 2 + 0.02));
    }
    out.push(normalizeRow(row));
  }
  return out;
}

/** Set one cell to a probability and rescale the rest of its row to keep the sum at 1. */
export function setCell(m: Matrix, i: number, j: number, value: number): Matrix {
  const row = at(m, i);
  const v = clamp(value, 0, 1);
  const others = row.reduce((s, x, k) => (k === j ? s : s + x), 0);
  const remain = 1 - v;
  const next = row.map((x, k) => {
    if (k === j) return v;
    if (others <= 0) return remain / (row.length - 1);
    return (x / others) * remain;
  });
  const out = m.slice();
  out[i] = next;
  return out;
}

/** Bytes that sum to exactly 255, so dequantize then quantize is a fixed point. */
export function quantizeRow(row: readonly number[]): number[] {
  const p = normalizeRow(row);
  const scaled = p.map((v) => v * 255);
  const q = scaled.map((v) => Math.floor(v));
  let remain = 255 - q.reduce((s, v) => s + v, 0);
  const order = scaled
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remain <= 0) break;
    q[i] = (q[i] ?? 0) + 1;
    remain--;
  }
  return q;
}

export function dequantizeRow(q: readonly number[]): number[] {
  return q.map((v) => v / 255);
}
