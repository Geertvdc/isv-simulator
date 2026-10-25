import { STATUS_BRANCH } from '../sim/content';
import { el } from './dom';

/**
 * The button hint along the bottom of a menu screen, drawn like a code
 * editor's status bar: the branch on its left (from `data-branch`), then
 * `text`. Its text can be changed later; the branch stays.
 */
export function statusBar(text = '', className = ''): HTMLElement {
  const bar = el('div', `screen-hint ${className}`.trim(), text);
  bar.dataset.branch = STATUS_BRANCH;
  return bar;
}
