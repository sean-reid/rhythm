export function at<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new RangeError(`index ${i} out of range (${arr.length})`);
  return v;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function replaceAt<T>(arr: readonly T[], i: number, v: T): T[] {
  const out = arr.slice();
  out[i] = v;
  return out;
}
