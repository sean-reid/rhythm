import { clamp } from '../engine';
import { el } from './dom';

export interface ScrubOpts {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  /** Pixels of drag per step. */
  px?: number;
  format?: (v: number) => string;
  parse?: (s: string) => number;
  onChange: (v: number) => void;
}

/** Numeric field that drags like an encoder and types like an input. */
export function scrub(opts: ScrubOpts): { el: HTMLElement; set(v: number): void } {
  const format = opts.format ?? ((v: number) => String(v));
  const parse = opts.parse ?? ((s: string) => Number(s));
  const px = opts.px ?? 3;
  let value = opts.value;
  const input = el('input', {
    type: 'text',
    inputmode: 'decimal',
    role: 'spinbutton',
    'aria-label': opts.label,
    'aria-valuemin': String(opts.min),
    'aria-valuemax': String(opts.max),
    autocomplete: 'off',
  });
  const root = el('label', { class: 'scrub' }, el('span', { text: opts.label }), input);

  const render = () => {
    input.value = format(value);
    input.setAttribute('aria-valuenow', String(value));
  };
  const commit = (v: number) => {
    const snapped = clamp(Math.round(v / opts.step) * opts.step, opts.min, opts.max);
    const fixed = Number(snapped.toFixed(4));
    if (fixed === value) return;
    value = fixed;
    render();
    opts.onChange(value);
  };

  let startY = 0;
  let startValue = 0;
  let moved = false;
  let dragging = false;
  input.addEventListener('pointerdown', (e) => {
    if (document.activeElement === input) return;
    dragging = true;
    moved = false;
    startY = e.clientY;
    startValue = value;
    input.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  input.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dy = startY - e.clientY;
    if (Math.abs(dy) > 3) moved = true;
    if (moved) commit(startValue + (dy / px) * opts.step);
  });
  const release = () => {
    if (!dragging) return;
    dragging = false;
    if (!moved) {
      input.focus();
      input.select();
    }
  };
  input.addEventListener('pointerup', release);
  input.addEventListener('pointercancel', release);
  input.addEventListener('keydown', (e) => {
    const mult = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowUp') commit(value + opts.step * mult);
    else if (e.key === 'ArrowDown') commit(value - opts.step * mult);
    else if (e.key === 'Enter' || e.key === 'Escape') input.blur();
    else return;
    e.preventDefault();
  });
  input.addEventListener('blur', () => {
    const parsed = parse(input.value);
    if (Number.isFinite(parsed)) commit(parsed);
    else render();
  });
  render();
  return {
    el: root,
    set(v) {
      value = v;
      render();
    },
  };
}
