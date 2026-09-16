import type { Strength } from '../engine';
import { VELOCITY } from '../engine';
import type { Sample } from './kit';

const CUTOFF: Record<Strength, number> = { 0: 0, 1: 2200, 2: 5500, 3: 20000 };

/** One drum hit: velocity as gain, softer hits also lose highs like a lighter stroke would. */
export function scheduleHit(
  ctx: BaseAudioContext,
  dest: AudioNode,
  sample: Sample,
  time: number,
  strength: Strength,
): void {
  const src = ctx.createBufferSource();
  src.buffer = sample.buffer;
  const gain = ctx.createGain();
  gain.gain.value = VELOCITY[strength];
  let tail: AudioNode = gain;
  if (strength < 3) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = CUTOFF[strength];
    gain.connect(lp);
    tail = lp;
  }
  src.connect(gain);
  tail.connect(dest);
  src.start(time, sample.offset);
}
