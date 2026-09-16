import { Player } from './audio/player';
import { Store } from './store';
import { footer, header, overlays } from './ui/controls';
import { el } from './ui/dom';
import { editor } from './ui/editor';
import { bindKeys } from './ui/keys';
import { lanes } from './ui/lanes';
import { pieceFromLocation, syncLocation } from './url';

async function boot(): Promise<void> {
  const app = document.getElementById('app');
  if (!app) return;
  const piece = await pieceFromLocation();
  const store = new Store(piece);
  const player = new Player(piece);

  const head = header(store, player);
  const timeline = lanes(store, player);
  const panel = editor(store, player);
  const foot = footer(store);
  const dialogs = overlays(store);

  const main = el('main', {}, timeline.el, panel.el);
  app.append(head.el, main, foot.el, ...dialogs.els);

  const paint = () => {
    main.classList.toggle('has-panel', store.state.selection !== null);
    head.update(store.state);
    foot.update(store.state);
    panel.update(store.state);
    dialogs.update(store.state);
    timeline.draw();
  };

  store.subscribe((s, prev) => {
    if (s.piece !== prev.piece) {
      player.setPiece(s.piece);
      syncLocation(s.piece);
    }
    if (s.muted !== prev.muted || s.solo !== prev.solo)
      player.setMix({ muted: s.muted, solo: s.solo });
    paint();
  });

  let frame = 0;
  const loop = () => {
    timeline.draw();
    if (panel.el.classList.contains('open')) panel.update(store.state);
    frame = player.playing ? requestAnimationFrame(loop) : 0;
  };
  player.onChange = () => {
    paint();
    if (player.playing && frame === 0) frame = requestAnimationFrame(loop);
  };

  bindKeys(store, player);
  syncLocation(piece);
  paint();
}

void boot();
