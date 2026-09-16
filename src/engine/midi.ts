import type { Strength } from './atom';
import { GM_NOTE, type VoiceName } from './voices';

export interface MidiEvent {
  beat: number;
  voice: number;
  strength: Strength;
}

const PPQ = 480;
const NOTE_VELOCITY: Record<Strength, number> = { 0: 0, 1: 40, 2: 84, 3: 120 };

function vlq(n: number): number[] {
  const bytes = [n & 0x7f];
  n >>= 7;
  while (n > 0) {
    bytes.unshift((n & 0x7f) | 0x80);
    n >>= 7;
  }
  return bytes;
}

function u32(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

/** Format 0 SMF on channel 10 with a tempo event and a fixed short note length. */
export function encodeMidi(
  events: readonly MidiEvent[],
  voices: readonly VoiceName[],
  bpm: number,
): Uint8Array<ArrayBuffer> {
  const noteLen = PPQ / 8;
  const raw: { tick: number; on: boolean; note: number; vel: number }[] = [];
  for (const e of events) {
    const note = GM_NOTE[voices[e.voice] ?? 'perc'];
    const tick = Math.round(e.beat * PPQ);
    raw.push({ tick, on: true, note, vel: NOTE_VELOCITY[e.strength] });
    raw.push({ tick: tick + noteLen, on: false, note, vel: 0 });
  }
  raw.sort((a, b) => a.tick - b.tick || Number(a.on) - Number(b.on));

  const track: number[] = [];
  const usPerBeat = Math.round(60_000_000 / bpm);
  track.push(
    0,
    0xff,
    0x51,
    0x03,
    (usPerBeat >> 16) & 0xff,
    (usPerBeat >> 8) & 0xff,
    usPerBeat & 0xff,
  );
  let last = 0;
  for (const r of raw) {
    track.push(...vlq(r.tick - last), r.on ? 0x99 : 0x89, r.note, r.vel);
    last = r.tick;
  }
  track.push(0, 0xff, 0x2f, 0);

  const header = [0x4d, 0x54, 0x68, 0x64, ...u32(6), 0, 0, 0, 1, (PPQ >> 8) & 0xff, PPQ & 0xff];
  const chunk = [0x4d, 0x54, 0x72, 0x6b, ...u32(track.length), ...track];
  return new Uint8Array([...header, ...chunk]);
}
