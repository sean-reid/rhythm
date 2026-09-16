/** Hash any number of integers into one 32-bit value. Stateless, so the same inputs always agree. */
export function hash32(...ints: number[]): number {
  let h = 0x9e3779b9;
  for (const v of ints) {
    h = (h ^ (v >>> 0)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
  }
  return h;
}

/** Uniform in [0, 1) as a pure function of its integer inputs. */
export function uniform(...ints: number[]): number {
  return hash32(...ints) / 4294967296;
}

/** sfc32 stream, for generation work that wants a sequence rather than a hash. */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number) {
    this.a = seed >>> 0;
    this.b = hash32(seed, 1);
    this.c = hash32(seed, 2);
    this.d = 1;
    for (let i = 0; i < 12; i++) this.next();
  }

  next(): number {
    const t = (((this.a + this.b) >>> 0) + this.d) >>> 0;
    this.d = (this.d + 1) >>> 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) >>> 0;
    this.c = ((this.c << 21) | (this.c >>> 11)) >>> 0;
    this.c = (this.c + t) >>> 0;
    return t / 4294967296;
  }

  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  seed(): number {
    return (this.next() * 4294967296) >>> 0;
  }
}

export function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] ?? 1;
}
