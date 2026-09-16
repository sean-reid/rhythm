import type { Kit } from '../engine';
import type { VoiceName } from '../engine';

export interface Sample {
  buffer: AudioBuffer;
  /** Seconds of leading silence to skip so the transient lands on the grid regardless of codec delay. */
  offset: number;
}

const cache = new Map<string, Promise<Sample>>();

function onset(buffer: AudioBuffer): number {
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    if (Math.abs(data[i] ?? 0) > 0.01)
      return Math.max(0, i - buffer.sampleRate * 0.0015) / buffer.sampleRate;
  }
  return 0;
}

export function loadSample(ctx: BaseAudioContext, kit: Kit, voice: VoiceName): Promise<Sample> {
  const key = `${kit}/${voice}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(`/kits/${key}.m4a`)
      .then((r) => {
        if (!r.ok) throw new Error(`sample ${key}: ${r.status}`);
        return r.arrayBuffer();
      })
      .then((bytes) => ctx.decodeAudioData(bytes))
      .then((buffer) => ({ buffer, offset: onset(buffer) }));
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

export function loadKit(
  ctx: BaseAudioContext,
  kit: Kit,
  voices: readonly VoiceName[],
): Promise<Map<VoiceName, Sample>> {
  return Promise.all(voices.map((v) => loadSample(ctx, kit, v).then((s) => [v, s] as const))).then(
    (pairs) => new Map(pairs),
  );
}
