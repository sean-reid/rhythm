import type { Player } from '../audio/player';
import { type Entry, entriesUntil, stepsFor } from '../audio/timeline';
import { at, atomSteps } from '../engine';
import type { Selection, Store } from '../store';
import { el } from './dom';

const LABEL_W = 48;
const ROOT_H = 18;
const META_H = 30;
const ATOM_HEAD = 16;
const VOICE_H = 12;
const PLAYHEAD = 0.3;

interface Geometry {
  width: number;
  height: number;
  metaH: number;
  voiceH: number;
  laneTop: number[];
  atomTop: number;
  atomH: number;
  pxPerSec: number;
  x0: number;
  now: number;
}

/** Scrolling timeline: one lane per level, slowest on top, the atom step grid at the bottom. */
export function lanes(store: Store, player: Player) {
  const canvas = el('canvas', { role: 'img', 'aria-label': 'timeline of levels and atoms' });
  const root = el('section', { class: 'lanes' }, canvas);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas unavailable');
  const ctx: CanvasRenderingContext2D = context;

  const css = (name: string) => getComputedStyle(root).getPropertyValue(name).trim();
  let colors = { fg: '#e6e6e6', dim: '#7a7a7a', line: '#2a2a2a', accent: '#ff4a1c', bg: '#0e0e0e' };
  const readColors = () => {
    colors = {
      fg: css('--fg'),
      dim: css('--dim'),
      line: css('--line'),
      accent: css('--accent'),
      bg: css('--bg'),
    };
  };

  function geometry(): Geometry {
    const { piece } = store.state;
    const width = root.clientWidth;
    const levels = piece.levels.length;
    const base = ROOT_H + levels * META_H + ATOM_HEAD + piece.voices.length * VOICE_H;
    const scale = Math.min(2.4, Math.max(1, (root.clientHeight - 16) / base));
    const metaH = Math.round(META_H * scale);
    const voiceH = Math.round(VOICE_H * scale);
    const laneTop: number[] = [];
    let y = ROOT_H;
    for (let k = levels - 1; k >= 0; k--) {
      laneTop[k] = y;
      y += metaH;
    }
    const atomH = ATOM_HEAD + piece.voices.length * voiceH;
    const visibleBeats = width < 600 ? 10 : width < 1000 ? 18 : 26;
    const pxPerBeat = (width - LABEL_W) / visibleBeats;
    return {
      width,
      height: y + atomH,
      metaH,
      voiceH,
      laneTop,
      atomTop: y,
      atomH,
      pxPerSec: (pxPerBeat * piece.bpm) / 60,
      x0: LABEL_W + (width - LABEL_W) * PLAYHEAD,
      now: player.now(),
    };
  }

  function visible(g: Geometry): Entry[] {
    const left = g.now - (g.x0 - LABEL_W) / g.pxPerSec;
    const right = g.now + (g.width - g.x0) / g.pxPerSec;
    const past = player.played.filter((e) => e.start + e.duration > left);
    return [...past, ...entriesUntil(store.state.piece, player.head, right)];
  }

  const xAt = (g: Geometry, t: number) => g.x0 + (t - g.now) * g.pxPerSec;

  function isSelected(
    sel: Selection,
    kind: 'node' | 'atom',
    level: number,
    index: number,
  ): boolean {
    if (!sel) return false;
    if (kind === 'atom') return sel.kind === 'atom' && sel.atom === index;
    return sel.kind === 'node' && sel.level === level && sel.node === index;
  }

  function draw(): void {
    const g = geometry();
    const dpr = window.devicePixelRatio || 1;
    if (
      canvas.width !== Math.round(g.width * dpr) ||
      canvas.height !== Math.round(g.height * dpr)
    ) {
      canvas.width = Math.round(g.width * dpr);
      canvas.height = Math.round(g.height * dpr);
      canvas.style.height = `${g.height}px`;
      readColors();
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, g.width, g.height);
    const { piece, selection } = store.state;
    const entries = visible(g);
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = colors.dim;
    ctx.fillText('root', 4, ROOT_H / 2);
    ctx.fillStyle = 'rgba(230,230,230,0.08)';
    ctx.fillRect(LABEL_W, 2, g.width - LABEL_W, ROOT_H - 4);
    if (selection?.kind === 'root') {
      ctx.strokeStyle = colors.fg;
      ctx.lineWidth = 1;
      ctx.strokeRect(LABEL_W + 0.5, 2.5, g.width - LABEL_W - 1, ROOT_H - 5);
    }
    ctx.fillStyle = colors.dim;
    ctx.fillText(`walks L${piece.levels.length}`, LABEL_W + 5, ROOT_H / 2);

    for (let k = piece.levels.length - 1; k >= 0; k--) {
      const top = at(g.laneTop, k);
      ctx.fillStyle = colors.dim;
      ctx.fillText(`L${k + 1}`, 4, top + g.metaH / 2);
      let i = 0;
      while (i < entries.length) {
        const e = at(entries, i);
        const node = at(e.state.nodes, k);
        let j = i + 1;
        while (j < entries.length && at(at(entries, j).state.nodes, k) === node) j++;
        const last = at(entries, j - 1);
        const xa = Math.max(LABEL_W, xAt(g, e.start));
        const xb = Math.min(g.width, xAt(g, last.start + last.duration));
        const isNow = e.start <= g.now && last.start + last.duration > g.now;
        const past = last.start + last.duration <= g.now;
        const count = at(piece.levels, k).nodes.length;
        const shade = 0.12 + (0.3 * (node + 1)) / count;
        ctx.globalAlpha = past ? 0.55 : 1;
        ctx.fillStyle = `rgba(230,230,230,${shade.toFixed(3)})`;
        ctx.fillRect(xa, top + 3, Math.max(0, xb - xa - 1), g.metaH - 6);
        if (isSelected(selection, 'node', k, node)) {
          ctx.strokeStyle = colors.fg;
          ctx.lineWidth = 1;
          ctx.strokeRect(xa + 0.5, top + 3.5, Math.max(0, xb - xa - 2), g.metaH - 7);
        }
        if (isNow) {
          ctx.fillStyle = colors.accent;
          ctx.fillRect(xa, top + 3, Math.max(0, xb - xa - 1), 2);
        }
        for (let m = i; m < j; m++) {
          const em = at(entries, m);
          if (m > i && at(em.state.counters, k) === 0) {
            ctx.fillStyle = colors.bg;
            ctx.fillRect(xAt(g, em.start) - 1, top + 3, 1, g.metaH - 6);
          }
        }
        if (xb - xa > 18) {
          ctx.fillStyle = colors.fg;
          ctx.fillText(String(node), xa + 5, top + g.metaH / 2);
        }
        ctx.globalAlpha = 1;
        i = j;
      }
    }

    const top = g.atomTop;
    ctx.fillStyle = colors.line;
    ctx.fillRect(LABEL_W, top, g.width - LABEL_W, 1);
    ctx.fillStyle = colors.dim;
    ctx.fillText('atoms', 4, top + ATOM_HEAD / 2);
    piece.voices.forEach((v, r) => {
      ctx.fillStyle = colors.dim;
      ctx.fillText(v.slice(0, 5), 4, top + ATOM_HEAD + r * g.voiceH + g.voiceH / 2);
    });
    for (const e of entries) {
      const atom = at(piece.atoms, e.state.atom);
      const steps = stepsFor(piece, e.state.atom);
      const n = atomSteps(atom);
      const xa = xAt(g, e.start);
      const w = e.duration * g.pxPerSec;
      if (xa + w < LABEL_W || xa > g.width) continue;
      const past = e.start + e.duration <= g.now;
      const isNow = e.start <= g.now && e.start + e.duration > g.now;
      ctx.save();
      ctx.beginPath();
      ctx.rect(LABEL_W, top, g.width - LABEL_W, g.atomH);
      ctx.clip();
      ctx.globalAlpha = past ? 0.5 : 1;
      ctx.fillStyle = colors.line;
      ctx.fillRect(xa, top, 1, g.atomH);
      ctx.fillStyle = isSelected(selection, 'atom', 0, e.state.atom) ? colors.fg : colors.dim;
      ctx.fillText(String(e.state.atom), xa + 4, top + ATOM_HEAD / 2);
      const cw = w / n;
      for (let r = 0; r < steps.length; r++) {
        const row = at(steps, r);
        for (let s = 0; s < n; s++) {
          const v = row[s] ?? 0;
          if (v === 0) continue;
          const alpha = v === 1 ? 0.3 : v === 2 ? 0.62 : 1;
          ctx.fillStyle = `rgba(230,230,230,${alpha})`;
          ctx.fillRect(
            xa + s * cw + 1,
            top + ATOM_HEAD + r * g.voiceH + 1,
            Math.max(1, cw - 2),
            VOICE_H - 2,
          );
        }
      }
      if (isNow) {
        const s = Math.min(n - 1, Math.floor(((g.now - e.start) / e.duration) * n));
        ctx.fillStyle = colors.accent;
        ctx.globalAlpha = 0.18;
        ctx.fillRect(xa + s * cw, top + ATOM_HEAD, cw, g.atomH - ATOM_HEAD);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    ctx.fillStyle = colors.accent;
    ctx.fillRect(Math.round(g.x0), 0, 1, g.height);
  }

  function hit(x: number, y: number): Selection | undefined {
    const g = geometry();
    if (y < ROOT_H) return { kind: 'root' };
    if (x < LABEL_W) return undefined;
    const t = g.now + (x - g.x0) / g.pxPerSec;
    const entries = visible(g);
    const e = entries.find((en) => en.start <= t && en.start + en.duration > t);
    if (!e) return undefined;
    if (y >= g.atomTop) return { kind: 'atom', atom: e.state.atom };
    for (let k = 0; k < g.laneTop.length; k++) {
      const top = at(g.laneTop, k);
      if (y >= top && y < top + g.metaH)
        return { kind: 'node', level: k, node: at(e.state.nodes, k) };
    }
    return undefined;
  }

  canvas.addEventListener('click', (ev) => {
    const r = canvas.getBoundingClientRect();
    const sel = hit(ev.clientX - r.left, ev.clientY - r.top);
    if (sel !== undefined) store.select(sel);
  });

  new ResizeObserver(() => draw()).observe(root);

  return { el: root, draw };
}
