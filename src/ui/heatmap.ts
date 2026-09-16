import type { Matrix } from '../engine';
import { el } from './dom';

export interface HeatmapOpts {
  matrix: Matrix;
  rowLabels: readonly string[];
  colLabels: readonly string[];
  onChange: (from: number, to: number, value: number) => void;
  /** Row currently being walked from, drawn with the accent. */
  current?: number | undefined;
}

const DRAG_PX = 160;

/** Row-stochastic matrix editor: shade is probability, vertical drag changes a cell. */
export function heatmap(opts: HeatmapOpts): {
  el: HTMLElement;
  update(m: Matrix, current?: number): void;
} {
  const n = opts.matrix.length;
  const cells: HTMLButtonElement[][] = [];
  const grid = el('div', { class: 'heatmap', role: 'grid', 'aria-label': 'transition matrix' });
  grid.style.setProperty('--n', String(n));

  grid.append(el('span', { class: 'hm-corner' }));
  for (let j = 0; j < n; j++) {
    grid.append(
      el('span', { class: 'hm-col', role: 'columnheader', text: opts.colLabels[j] ?? String(j) }),
    );
  }

  let matrix = opts.matrix;
  let current = opts.current;
  const label = (i: number, j: number) =>
    `from ${opts.rowLabels[i] ?? i} to ${opts.colLabels[j] ?? j}, ${Math.round((matrix[i]?.[j] ?? 0) * 100)} percent`;

  const paint = (i: number, j: number) => {
    const cell = cells[i]?.[j];
    if (!cell) return;
    const p = matrix[i]?.[j] ?? 0;
    cell.style.setProperty('--p', p.toFixed(3));
    cell.textContent =
      p >= 0.995 ? '1' : p < 0.005 ? '' : `.${String(Math.round(p * 100)).padStart(2, '0')}`;
    cell.setAttribute('aria-label', label(i, j));
  };

  const focus = (i: number, j: number) => {
    const cell = cells[Math.max(0, Math.min(n - 1, i))]?.[Math.max(0, Math.min(n - 1, j))];
    cell?.focus();
  };

  for (let i = 0; i < n; i++) {
    const row: HTMLButtonElement[] = [];
    const header = el('span', {
      class: 'hm-row',
      role: 'rowheader',
      text: opts.rowLabels[i] ?? String(i),
    });
    grid.append(header);
    for (let j = 0; j < n; j++) {
      const cell = el('button', {
        type: 'button',
        class: 'hm-cell',
        role: 'gridcell',
        tabindex: i === 0 && j === 0 ? '0' : '-1',
      });
      let startY = 0;
      let startValue = 0;
      let dragging = false;
      cell.addEventListener('pointerdown', (e) => {
        dragging = true;
        startY = e.clientY;
        startValue = matrix[i]?.[j] ?? 0;
        cell.setPointerCapture(e.pointerId);
        e.preventDefault();
      });
      cell.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const v = startValue + (startY - e.clientY) / DRAG_PX;
        opts.onChange(i, j, Math.max(0, Math.min(1, v)));
      });
      const stop = () => {
        dragging = false;
      };
      cell.addEventListener('pointerup', stop);
      cell.addEventListener('pointercancel', stop);
      cell.addEventListener('keydown', (e) => {
        const v = matrix[i]?.[j] ?? 0;
        const step = e.shiftKey ? 0.2 : 0.05;
        switch (e.key) {
          case 'ArrowUp':
            focus(i - 1, j);
            break;
          case 'ArrowDown':
            focus(i + 1, j);
            break;
          case 'ArrowLeft':
            focus(i, j - 1);
            break;
          case 'ArrowRight':
            focus(i, j + 1);
            break;
          case '+':
          case '=':
            opts.onChange(i, j, Math.min(1, v + step));
            break;
          case '-':
          case '_':
            opts.onChange(i, j, Math.max(0, v - step));
            break;
          case '0':
            opts.onChange(i, j, 0);
            break;
          case '1':
            opts.onChange(i, j, 1);
            break;
          default:
            return;
        }
        e.preventDefault();
      });
      cell.addEventListener('focus', () => {
        for (const r of cells) for (const c of r) c.tabIndex = -1;
        cell.tabIndex = 0;
      });
      row.push(cell);
      grid.append(cell);
    }
    cells.push(row);
  }

  const paintAll = () => {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) paint(i, j);
      cells[i]?.forEach((c) => c.classList.toggle('hm-current', i === current));
    }
  };
  paintAll();

  return {
    el: grid,
    update(m, cur) {
      matrix = m;
      current = cur;
      paintAll();
    },
  };
}
