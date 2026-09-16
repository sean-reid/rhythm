import type { MidiEvent, Piece } from '../engine';
import { at, beatsToSeconds, encodeMidi, initialState } from '../engine';
import { scheduleHit } from './hit';
import { loadKit } from './kit';
import type { Mix } from './player';
import { type Entry, entryFor, entryHits, nextEntry } from './timeline';
import { encodeWav } from './wav';

/** Entries from the start of the piece covering `beats` beats. */
function entriesForBeats(piece: Piece, beats: number): Entry[] {
  const out: Entry[] = [];
  let e = entryFor(piece, initialState(piece), 0);
  let elapsed = 0;
  while (elapsed < beats) {
    out.push(e);
    elapsed += at(piece.atoms, e.state.atom).beats;
    e = nextEntry(piece, e);
  }
  return out;
}

function audible(mix: Mix, voice: number): boolean {
  return !mix.muted[voice] && (mix.solo === null || mix.solo === voice);
}

export function renderMidi(piece: Piece, bars: number, mix: Mix): Uint8Array<ArrayBuffer> {
  const events: MidiEvent[] = [];
  let beat = 0;
  for (const e of entriesForBeats(piece, bars * 4)) {
    for (const h of entryHits(piece, e)) {
      if (!audible(mix, h.voice)) continue;
      events.push({ beat: beat + h.beat, voice: h.voice, strength: h.strength });
    }
    beat += at(piece.atoms, e.state.atom).beats;
  }
  return encodeMidi(events, piece.voices, piece.bpm);
}

export async function renderWav(
  piece: Piece,
  bars: number,
  mix: Mix,
): Promise<Uint8Array<ArrayBuffer>> {
  const seconds = beatsToSeconds(bars * 4, piece.bpm) + 1.5;
  const rate = 44100;
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * rate), rate);
  const samples = await loadKit(ctx, piece.kit, piece.voices);
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
  const end = beatsToSeconds(bars * 4, piece.bpm);
  for (const e of entriesForBeats(piece, bars * 4)) {
    for (const h of entryHits(piece, e)) {
      if (!audible(mix, h.voice) || h.time >= end) continue;
      const voice = piece.voices[h.voice];
      const sample = voice ? samples.get(voice) : undefined;
      if (sample) scheduleHit(ctx, master, sample, h.time, h.strength);
    }
  }
  return encodeWav(await ctx.startRendering());
}
