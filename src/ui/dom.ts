type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | ((e: Event) => void) | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (typeof v === 'function') node.addEventListener(k, v);
    else if (v === true) node.setAttribute(k, '');
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c);
  }
  return node;
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function button(
  label: string,
  onClick: () => void,
  attrs: Record<string, string> = {},
): HTMLButtonElement {
  return el('button', { type: 'button', text: label, click: onClick, ...attrs });
}

/** A row of joined buttons where exactly one is pressed. */
export function segmented<T extends string | number>(
  options: readonly T[],
  value: T,
  onChange: (v: T) => void,
  label: string,
): { el: HTMLElement; set(v: T): void } {
  const buttons = options.map((o) =>
    el('button', {
      type: 'button',
      text: String(o),
      'aria-pressed': String(o === value),
      click: () => onChange(o),
    }),
  );
  const root = el('div', { class: 'segmented', role: 'group', 'aria-label': label }, ...buttons);
  return {
    el: root,
    set(v) {
      buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i] === v)));
    },
  };
}
