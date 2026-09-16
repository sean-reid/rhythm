import { type Atom, type Beats, BEATS, type Subdiv, SUBDIVS } from './atom';
import { dequantizeRow, type Matrix, quantizeRow } from './matrix';
import { type Kit, KITS, LIMITS, type Piece } from './piece';
import { at } from './util';
import { VOICES, type VoiceName } from './voices';

const VERSION = 1;

class Writer {
  private bytes: number[] = [];
  u8(v: number): void {
    this.bytes.push(v & 0xff);
  }
  u32(v: number): void {
    this.u8(v >>> 24);
    this.u8(v >>> 16);
    this.u8(v >>> 8);
    this.u8(v);
  }
  matrix(m: Matrix): void {
    for (const row of m) for (const q of quantizeRow(row)) this.u8(q);
  }
  done(): Uint8Array<ArrayBuffer> {
    return new Uint8Array(this.bytes);
  }
}

class Reader {
  private i = 0;
  constructor(private readonly b: Uint8Array) {}
  u8(): number {
    const v = this.b[this.i++];
    if (v === undefined) throw new Error('truncated');
    return v;
  }
  u32(): number {
    return ((this.u8() << 24) | (this.u8() << 16) | (this.u8() << 8) | this.u8()) >>> 0;
  }
  matrix(n: number): Matrix {
    const m: Matrix = [];
    for (let i = 0; i < n; i++) {
      const row: number[] = [];
      for (let j = 0; j < n; j++) row.push(this.u8());
      m.push(dequantizeRow(row));
    }
    return m;
  }
  atEnd(): boolean {
    return this.i === this.b.length;
  }
}

function range(v: number, lo: number, hi: number, what: string): number {
  if (!Number.isInteger(v) || v < lo || v > hi) throw new Error(`${what} out of range: ${v}`);
  return v;
}

export function serialize(p: Piece): Uint8Array<ArrayBuffer> {
  const w = new Writer();
  w.u8(VERSION);
  w.u32(p.seed);
  w.u8(p.bpm);
  w.u8(Math.round(p.swing * 255));
  w.u8(KITS.indexOf(p.kit));
  w.u8(p.voices.length);
  for (const v of p.voices) w.u8(VOICES.indexOf(v));
  w.u8(p.atoms.length);
  for (const a of p.atoms) {
    w.u32(a.seed);
    w.u8((BEATS.indexOf(a.beats) << 4) | SUBDIVS.indexOf(a.subdiv));
    for (const m of a.step) w.matrix(m);
  }
  w.u8(p.levels.length);
  for (const lv of p.levels) {
    w.u8(lv.dwell);
    w.u8(lv.nodes.length);
    for (const m of lv.nodes) w.matrix(m);
  }
  w.matrix(p.root);
  return w.done();
}

export function deserialize(bytes: Uint8Array): Piece {
  const r = new Reader(bytes);
  if (r.u8() !== VERSION) throw new Error('unsupported version');
  const seed = r.u32();
  const bpm = range(r.u8(), LIMITS.bpm.min, LIMITS.bpm.max, 'bpm');
  const swing = r.u8() / 255;
  const kit: Kit = at(KITS, range(r.u8(), 0, KITS.length - 1, 'kit'));
  const voiceCount = range(r.u8(), LIMITS.voices.min, LIMITS.voices.max, 'voices');
  const voices: VoiceName[] = [];
  for (let i = 0; i < voiceCount; i++)
    voices.push(at(VOICES, range(r.u8(), 0, VOICES.length - 1, 'voice')));
  const atomCount = range(r.u8(), LIMITS.pool.min, LIMITS.pool.max, 'atoms');
  const atoms: Atom[] = [];
  for (let i = 0; i < atomCount; i++) {
    const aseed = r.u32();
    const shape = r.u8();
    const beats: Beats = at(BEATS, range(shape >> 4, 0, BEATS.length - 1, 'beats'));
    const subdiv: Subdiv = at(SUBDIVS, range(shape & 0xf, 0, SUBDIVS.length - 1, 'subdiv'));
    const step: Matrix[] = [];
    for (let v = 0; v < voiceCount; v++) step.push(r.matrix(4));
    atoms.push({ seed: aseed, beats, subdiv, step });
  }
  const levelCount = range(r.u8(), LIMITS.levels.min, LIMITS.levels.max, 'levels');
  const levels: Piece['levels'] = [];
  let below = atomCount;
  for (let k = 0; k < levelCount; k++) {
    const dwell = range(r.u8(), LIMITS.dwell.min, LIMITS.dwell.max, 'dwell');
    const count = range(r.u8(), LIMITS.pool.min, LIMITS.pool.max, 'nodes');
    const nodes: Matrix[] = [];
    for (let i = 0; i < count; i++) nodes.push(r.matrix(below));
    levels.push({ dwell, nodes });
    below = count;
  }
  const root = r.matrix(below);
  if (!r.atEnd()) throw new Error('trailing bytes');
  return { version: 1, seed, bpm, swing, kit, voices, atoms, levels, root };
}

async function pipe(
  bytes: Uint8Array<ArrayBuffer>,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array<ArrayBuffer>> {
  const writer = stream.writable.getWriter();
  void writer.write(bytes);
  void writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const b = atob(s.replaceAll('-', '+').replaceAll('_', '/'));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

export async function encodePiece(p: Piece): Promise<string> {
  return toBase64Url(await pipe(serialize(p), new CompressionStream('deflate-raw')));
}

export async function decodePiece(s: string): Promise<Piece> {
  return deserialize(await pipe(fromBase64Url(s), new DecompressionStream('deflate-raw')));
}
