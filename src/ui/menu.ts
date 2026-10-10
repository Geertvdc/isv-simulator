import { el } from './dom';

export interface MenuLine {
  label: string;
  /** Shown on the right, e.g. a setting's value. */
  value?: string;
}

export interface Menu {
  readonly root: HTMLElement;
  /** Shows these lines with `selected` highlighted; a disabled menu is dimmed. */
  render: (lines: readonly MenuLine[], selected: number, enabled?: boolean) => void;
}

/** The vertical menu every screen shares: big lines, one highlighted. */
export function createMenu(): Menu {
  const root = el('ul', 'menu');
  const rows: { row: HTMLElement; label: HTMLElement; value: HTMLElement }[] = [];
  return {
    root,
    render: (lines, selected, enabled = true) => {
      while (rows.length < lines.length) {
        const row = el('li', 'menu-item');
        const label = el('span', 'menu-label');
        const value = el('span', 'menu-value');
        row.append(label, value);
        root.append(row);
        rows.push({ row, label, value });
      }
      root.classList.toggle('disabled', !enabled);
      rows.forEach(({ row, label, value }, i) => {
        const line = lines[i];
        row.hidden = line === undefined;
        if (!line) return;
        row.classList.toggle('selected', i === selected);
        label.textContent = line.label;
        value.textContent = line.value ?? '';
        value.hidden = line.value === undefined;
      });
    },
  };
}
