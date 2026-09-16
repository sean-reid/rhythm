import type { Player } from '../audio/player';
import { addLevel, createPiece, randomSeed, rerollPiece, setBpm } from '../engine';
import type { Store } from '../store';
import { share } from './controls';

export function bindKeys(store: Store, player: Player): void {
  const taps: number[] = [];
  document.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')
    )
      return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.key) {
      case ' ':
        void player.toggle();
        break;
      case 'r':
        store.edit((p) => rerollPiece(p, randomSeed()));
        player.rewind();
        break;
      case 'n':
        store.set({ piece: createPiece(randomSeed()), selection: null, solo: null });
        store.set({ muted: store.state.piece.voices.map(() => false) });
        player.rewind();
        break;
      case 'l':
        store.edit(addLevel);
        break;
      case 't': {
        const now = performance.now();
        if (taps.length > 0 && now - (taps[taps.length - 1] ?? 0) > 2000) taps.length = 0;
        taps.push(now);
        if (taps.length > 5) taps.shift();
        if (taps.length >= 2) {
          const span = (taps[taps.length - 1] ?? 0) - (taps[0] ?? 0);
          store.edit((p) => setBpm(p, 60000 / (span / (taps.length - 1))));
        }
        break;
      }
      case 's':
        void share(store);
        break;
      case 'e':
        store.set({ overlay: 'export' });
        break;
      case '?':
        store.set({ overlay: store.state.overlay === 'keys' ? null : 'keys' });
        break;
      case 'Escape':
        if (store.state.overlay) store.set({ overlay: null });
        else store.select(null);
        break;
      default:
        return;
    }
    e.preventDefault();
  });
}
