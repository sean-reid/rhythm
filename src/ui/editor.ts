import type { Player } from '../audio/player';
import { stepsFor } from '../audio/timeline';
import {
  at,
  BEATS,
  type Beats,
  copyStepToAll,
  LIMITS,
  type Matrix,
  removeLevel,
  rerollAtom,
  setAtomShape,
  setDwell,
  setNodeCell,
  setPoolSize,
  setStepCell,
  type Subdiv,
  SUBDIVS,
} from '../engine';
import type { Selection, State, Store } from '../store';
import { button, clear, el, segmented } from './dom';
import { heatmap } from './heatmap';
import { scrub } from './scrub';

const STRENGTH = ['rest', 'ghost', 'hit', 'acc'];

function indices(n: number): string[] {
  return Array.from({ length: n }, (_, i) => String(i));
}

function selectionKey(s: Selection): string {
  if (!s) return '';
  if (s.kind === 'root') return 'root';
  if (s.kind === 'node') return `node:${s.level}:${s.node}`;
  return `atom:${s.atom}`;
}

/** Side panel (bottom sheet on narrow screens) editing whatever is selected in the lanes. */
export function editor(store: Store, player: Player) {
  const body = el('div', { class: 'panel-body' });
  const root = el(
    'aside',
    { class: 'panel', 'aria-label': 'editor' },
    el(
      'div',
      { class: 'panel-head' },
      button('close', () => store.select(null), { 'aria-label': 'close editor' }),
    ),
    body,
  );
  let key = '';
  let refresh: ((s: State) => void) | null = null;

  function currentRow(s: State): number | undefined {
    const sel = s.selection;
    const state = player.head.state;
    if (!sel) return undefined;
    if (sel.kind === 'root') return state.nodes[state.nodes.length - 1];
    if (sel.kind === 'node') {
      if (sel.level === 0) return state.atom;
      return state.nodes[sel.level - 1];
    }
    return undefined;
  }

  function buildMatrix(s: State, sel: Exclude<Selection, null>): void {
    const { piece } = s;
    const isRoot = sel.kind === 'root';
    const level = sel.kind === 'node' ? sel.level : piece.levels.length;
    const node = sel.kind === 'node' ? sel.node : -1;
    const belowLabel = level === 0 ? 'atoms' : `L${level} nodes`;
    const matrix: Matrix = isRoot ? piece.root : at(at(piece.levels, level).nodes, node);
    const n = matrix.length;
    const title = isRoot ? 'root' : `L${level + 1} node ${node}`;
    body.append(
      el('h2', { text: title }),
      el('p', { class: 'hint', text: `rows: from, columns: to, over ${belowLabel}` }),
    );
    const hm = heatmap({
      matrix,
      rowLabels: indices(n),
      colLabels: indices(n),
      current: currentRow(s),
      onChange: (i, j, v) => store.edit((p) => setNodeCell(p, level, node, i, j, v)),
    });
    body.append(hm.el);

    const controls = el('div', { class: 'row' });
    if (!isRoot) {
      const lv = at(piece.levels, level);
      controls.append(
        scrub({
          label: 'dwell',
          min: LIMITS.dwell.min,
          max: LIMITS.dwell.max,
          step: 1,
          value: lv.dwell,
          px: 8,
          onChange: (v) => store.edit((p) => setDwell(p, level, v)),
        }).el,
        scrub({
          label: 'nodes',
          min: LIMITS.pool.min,
          max: LIMITS.pool.max,
          step: 1,
          value: lv.nodes.length,
          px: 12,
          onChange: (v) => {
            store.edit((p) => setPoolSize(p, level + 1, v));
            store.select({ kind: 'node', level, node: Math.min(node, v - 1) });
          },
        }).el,
      );
      if (level === piece.levels.length - 1 && piece.levels.length > LIMITS.levels.min) {
        controls.append(
          button('remove level', () => {
            store.edit((p) => removeLevel(p, node));
            store.select({ kind: 'root' });
          }),
        );
      }
    }
    body.append(controls);
    refresh = (ns) => {
      const m: Matrix = isRoot ? ns.piece.root : (ns.piece.levels[level]?.nodes[node] ?? matrix);
      hm.update(m, currentRow(ns));
    };
  }

  function buildAtom(s: State, index: number): void {
    const { piece } = s;
    const atom = at(piece.atoms, index);
    body.append(el('h2', { text: `atom ${index}` }));

    const preview = el('div', {
      class: 'preview',
      role: 'img',
      'aria-label': `pattern of atom ${index}`,
    });
    const paintPreview = (p: State['piece']) => {
      clear(preview);
      const a = p.atoms[index];
      if (!a) return;
      const steps = stepsFor(p, index);
      preview.style.setProperty('--steps', String(a.beats * a.subdiv));
      steps.forEach((row, r) => {
        const line = el('div', { class: 'preview-row' }, el('span', { text: p.voices[r] ?? '' }));
        row.forEach((v) => line.append(el('i', { class: `s${v}` })));
        preview.append(line);
      });
    };
    paintPreview(piece);
    body.append(preview);

    const shape = el('div', { class: 'row' });
    const beatsSeg = segmented<Beats>(
      BEATS,
      atom.beats,
      (b) => store.edit((p) => setAtomShape(p, index, b, at(p.atoms, index).subdiv)),
      'beats',
    );
    const subSeg = segmented<Subdiv>(
      SUBDIVS,
      atom.subdiv,
      (d) => store.edit((p) => setAtomShape(p, index, at(p.atoms, index).beats, d)),
      'steps per beat',
    );
    shape.append(
      el('div', { class: 'field' }, el('span', { text: 'beats' }), beatsSeg.el),
      el('div', { class: 'field' }, el('span', { text: 'per beat' }), subSeg.el),
    );
    body.append(shape);

    body.append(
      el(
        'div',
        { class: 'row' },
        button('reroll', () => store.edit((p) => rerollAtom(p, index))),
        button('copy chains to all', () => {
          store.edit((p) => copyStepToAll(p, index));
          store.notify('chains copied to every atom');
        }),
        scrub({
          label: 'atoms',
          min: LIMITS.pool.min,
          max: LIMITS.pool.max,
          step: 1,
          value: piece.atoms.length,
          px: 12,
          onChange: (v) => {
            store.edit((p) => setPoolSize(p, 0, v));
            store.select({ kind: 'atom', atom: Math.min(index, v - 1) });
          },
        }).el,
      ),
    );

    const maps = piece.voices.map((voice, v) => {
      const hm = heatmap({
        matrix: at(atom.step, v),
        rowLabels: STRENGTH,
        colLabels: STRENGTH,
        onChange: (i, j, val) => store.edit((p) => setStepCell(p, index, v, i, j, val)),
      });
      body.append(el('h3', { text: voice }), hm.el);
      return hm;
    });

    refresh = (ns) => {
      const a = ns.piece.atoms[index];
      if (!a) return;
      beatsSeg.set(a.beats);
      subSeg.set(a.subdiv);
      maps.forEach((hm, v) => {
        const m = a.step[v];
        if (m) hm.update(m);
      });
      paintPreview(ns.piece);
    };
  }

  function update(s: State): void {
    const k = selectionKey(s.selection);
    root.classList.toggle('open', s.selection !== null);
    if (k !== key) {
      key = k;
      clear(body);
      refresh = null;
      const sel = s.selection;
      if (!sel) return;
      if (sel.kind === 'atom') buildAtom(s, sel.atom);
      else buildMatrix(s, sel);
      body.scrollTop = 0;
      return;
    }
    refresh?.(s);
  }

  return { el: root, update };
}
