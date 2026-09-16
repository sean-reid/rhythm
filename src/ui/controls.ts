import type { Player } from '../audio/player';
import { renderMidi, renderWav } from '../audio/render';
import { download } from '../download';
import {
  addLevel,
  addVoice,
  createPiece,
  type Kit,
  KITS,
  LIMITS,
  randomSeed,
  removeVoice,
  rerollPiece,
  setBpm,
  setKit,
  setSwing,
  type VoiceName,
  VOICES,
} from '../engine';
import type { State, Store } from '../store';
import { shareUrl } from '../url';
import { button, clear, el, segmented } from './dom';
import { scrub } from './scrub';

export function header(store: Store, player: Player) {
  const play = button('play', () => void player.toggle(), {
    class: 'play',
    'aria-pressed': 'false',
  });
  const bpm = scrub({
    label: 'bpm',
    min: LIMITS.bpm.min,
    max: LIMITS.bpm.max,
    step: 1,
    value: store.state.piece.bpm,
    onChange: (v) => store.edit((p) => setBpm(p, v)),
  });
  const swing = scrub({
    label: 'swing',
    min: 0,
    max: 100,
    step: 1,
    value: Math.round(store.state.piece.swing * 100),
    px: 2,
    onChange: (v) => store.edit((p) => setSwing(p, v / 100)),
  });
  const kit = segmented<Kit>(
    KITS,
    store.state.piece.kit,
    (k) => store.edit((p) => setKit(p, k)),
    'kit',
  );
  const seed = el('span', { class: 'seed', 'aria-label': 'seed' });

  const root = el(
    'header',
    { class: 'bar' },
    el(
      'div',
      { class: 'title' },
      el('h1', { text: 'rhythm' }),
      el('p', {
        text: 'Drum patterns from Markov chains stacked on Markov chains. Each level picks which matrix the level below is walking.',
      }),
    ),
    el(
      'div',
      { class: 'transport' },
      play,
      bpm.el,
      swing.el,
      kit.el,
      button('reroll', () => {
        store.edit((p) => rerollPiece(p, randomSeed()));
        player.rewind();
      }),
      button('new', () => {
        store.set({ piece: createPiece(randomSeed()), selection: null, solo: null });
        store.set({ muted: store.state.piece.voices.map(() => false) });
        player.rewind();
      }),
      seed,
    ),
  );

  function update(s: State): void {
    bpm.set(s.piece.bpm);
    swing.set(Math.round(s.piece.swing * 100));
    kit.set(s.piece.kit);
    seed.textContent = s.piece.seed.toString(16).padStart(8, '0');
    play.textContent = player.loading ? 'loading' : player.playing ? 'stop' : 'play';
    play.setAttribute('aria-pressed', String(player.playing));
  }

  return { el: root, update };
}

export function footer(store: Store) {
  const voices = el('div', { class: 'voices', role: 'group', 'aria-label': 'voices' });
  const notice = el('output', { class: 'notice', 'aria-live': 'polite' });
  const root = el(
    'footer',
    { class: 'bar' },
    voices,
    el(
      'div',
      { class: 'actions' },
      button('add level', () => {
        store.edit(addLevel);
        store.select({ kind: 'root' });
      }),
      button('share', () => void share(store)),
      button('export', () => store.set({ overlay: 'export' })),
      button('?', () => store.set({ overlay: store.state.overlay === 'keys' ? null : 'keys' }), {
        'aria-label': 'keyboard shortcuts',
      }),
      notice,
    ),
  );

  let voiceKey = '';
  function update(s: State): void {
    const k = `${s.piece.voices.join()}|${s.muted.join()}|${s.solo}`;
    if (k !== voiceKey) {
      voiceKey = k;
      clear(voices);
      s.piece.voices.forEach((v, i) => {
        const muted = s.muted[i] ?? false;
        const solo = s.solo === i;
        voices.append(
          el(
            'div',
            { class: 'voice' },
            el('span', { text: v }),
            button(
              'm',
              () => {
                const m = s.muted.slice();
                m[i] = !muted;
                store.set({ muted: m });
              },
              { 'aria-pressed': String(muted), 'aria-label': `mute ${v}` },
            ),
            button('s', () => store.set({ solo: solo ? null : i }), {
              'aria-pressed': String(solo),
              'aria-label': `solo ${v}`,
            }),
            button('x', () => store.edit((p) => removeVoice(p, i)), {
              'aria-label': `remove ${v}`,
              disabled: s.piece.voices.length <= LIMITS.voices.min ? 'true' : '',
            }),
          ),
        );
      });
      const free = VOICES.filter((v) => !s.piece.voices.includes(v));
      if (free.length > 0 && s.piece.voices.length < LIMITS.voices.max) {
        const select = el(
          'select',
          { 'aria-label': 'add voice' },
          el('option', { value: '', text: '+ voice' }),
        );
        for (const v of free) select.append(el('option', { value: v, text: v }));
        select.addEventListener('change', () => {
          const v = select.value as VoiceName;
          if (v) store.edit((p) => addVoice(p, v));
        });
        voices.append(select);
      }
    }
    notice.textContent = s.notice ?? '';
  }
  return { el: root, update };
}

export async function share(store: Store): Promise<void> {
  try {
    const url = await shareUrl(store.state.piece);
    await navigator.clipboard.writeText(url);
    store.notify('link copied');
  } catch {
    store.notify('share failed, the URL in the address bar still works');
  }
}

export function overlays(store: Store) {
  const keys = el(
    'dialog',
    { class: 'overlay' },
    el('h2', { text: 'keys' }),
    el(
      'dl',
      {},
      ...[
        ['space', 'play or stop'],
        ['r', 'reroll seed'],
        ['n', 'new piece'],
        ['l', 'add level'],
        ['t', 'tap tempo'],
        ['s', 'copy share link'],
        ['e', 'export'],
        ['esc', 'close'],
        ['arrows', 'move in a matrix'],
        ['+ -', 'change a cell'],
      ].flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]),
    ),
    button('close', () => store.set({ overlay: null })),
  );

  let bars = 16;
  const barsSeg = segmented([8, 16, 32, 64], bars, (b) => (bars = b), 'bars');
  const exp = el(
    'dialog',
    { class: 'overlay' },
    el('h2', { text: 'export' }),
    el('div', { class: 'field' }, el('span', { text: 'bars' }), barsSeg.el),
    el(
      'div',
      { class: 'row' },
      button('midi', () => {
        const { piece, muted, solo } = store.state;
        download(
          renderMidi(piece, bars, { muted, solo }),
          `rhythm-${piece.seed.toString(16)}.mid`,
          'audio/midi',
        );
        store.set({ overlay: null });
      }),
      button('wav', () => {
        const { piece, muted, solo } = store.state;
        store.notify('rendering');
        void renderWav(piece, bars, { muted, solo }).then((bytes) => {
          download(bytes, `rhythm-${piece.seed.toString(16)}.wav`, 'audio/wav');
          store.notify('wav saved');
        });
        store.set({ overlay: null });
      }),
      button('close', () => store.set({ overlay: null })),
    ),
  );
  for (const d of [keys, exp])
    d.addEventListener('close', () => store.state.overlay && store.set({ overlay: null }));

  function update(s: State): void {
    const want = { keys, export: exp };
    for (const [name, d] of Object.entries(want)) {
      const open = s.overlay === name;
      if (open && !d.open) d.showModal();
      if (!open && d.open) d.close();
    }
  }
  return { els: [keys, exp], update };
}
