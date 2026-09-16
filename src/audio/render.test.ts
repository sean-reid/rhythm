import { describe, expect, it } from 'vitest';
import { addLevel, createPiece } from '../engine';
import { renderMidi } from './render';

function fnv(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

describe('renderMidi', () => {
  const piece = addLevel(createPiece(2026));
  const mix = { muted: piece.voices.map(() => false), solo: null };

  it('is a fixed function of the piece', () => {
    const a = renderMidi(piece, 16, mix);
    const b = renderMidi(piece, 16, mix);
    expect(fnv(a)).toBe(fnv(b));
    expect(a.length).toBeGreaterThan(200);
  });

  it('matches the golden hash for seed 2026', () => {
    expect(fnv(renderMidi(piece, 16, mix))).toBe(
      fnv(renderMidi(addLevel(createPiece(2026)), 16, mix)),
    );
    expect(fnv(renderMidi(piece, 16, mix))).toMatchInlineSnapshot(`"39723534"`);
  });

  it('drops muted voices', () => {
    const muted = renderMidi(piece, 8, { muted: piece.voices.map(() => true), solo: null });
    expect(muted.length).toBeLessThan(renderMidi(piece, 8, mix).length);
  });
});
