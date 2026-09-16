import type { Piece } from './engine';

export type Selection =
  | { kind: 'root' }
  | { kind: 'node'; level: number; node: number }
  | { kind: 'atom'; atom: number }
  | null;

export interface State {
  piece: Piece;
  selection: Selection;
  muted: boolean[];
  solo: number | null;
  overlay: 'keys' | 'export' | null;
  notice: string | null;
}

type Listener = (state: State, prev: State) => void;

export class Store {
  private listeners = new Set<Listener>();
  state: State;

  constructor(piece: Piece) {
    this.state = {
      piece,
      selection: null,
      muted: piece.voices.map(() => false),
      solo: null,
      overlay: null,
      notice: null,
    };
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  set(patch: Partial<State>): void {
    const prev = this.state;
    this.state = { ...prev, ...patch };
    for (const fn of this.listeners) fn(this.state, prev);
  }

  /** Apply an engine edit; the mix arrays follow the voice list. */
  edit(fn: (p: Piece) => Piece): void {
    const piece = fn(this.state.piece);
    if (piece === this.state.piece) return;
    const patch: Partial<State> = { piece };
    if (piece.voices.length !== this.state.muted.length) {
      patch.muted = piece.voices.map((_, i) => this.state.muted[i] ?? false);
      if (this.state.solo !== null && this.state.solo >= piece.voices.length) patch.solo = null;
    }
    this.set(patch);
  }

  select(selection: Selection): void {
    this.set({ selection });
  }

  notify(notice: string, ms = 1800): void {
    this.set({ notice });
    setTimeout(() => {
      if (this.state.notice === notice) this.set({ notice: null });
    }, ms);
  }
}
