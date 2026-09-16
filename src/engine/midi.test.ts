import { describe, expect, it } from 'vitest';
import { encodeMidi } from './midi';

describe('encodeMidi', () => {
  it('writes a format 0 file with the right chunk length', () => {
    const bytes = encodeMidi(
      [
        { beat: 0, voice: 0, strength: 3 },
        { beat: 0.5, voice: 2, strength: 1 },
      ],
      ['kick', 'snare', 'hat'],
      120,
    );
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('MThd');
    expect(bytes[9]).toBe(0);
    expect(String.fromCharCode(...bytes.slice(14, 18))).toBe('MTrk');
    const len =
      ((bytes[18] ?? 0) << 24) |
      ((bytes[19] ?? 0) << 16) |
      ((bytes[20] ?? 0) << 8) |
      (bytes[21] ?? 0);
    expect(bytes.length).toBe(22 + len);
    expect(bytes.slice(-3)).toEqual(new Uint8Array([0xff, 0x2f, 0]));
    expect(Array.from(bytes)).toContain(0x99);
    expect(Array.from(bytes)).toContain(36);
    expect(Array.from(bytes)).toContain(42);
  });
});
