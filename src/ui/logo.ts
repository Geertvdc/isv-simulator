/**
 * The game's logo on the title screen: the name as a self-closing tag,
 * `<OverEngineered/>`, its two words in two colors, with a blinking cursor
 * after it.
 */

import { el } from './dom';

/** The title split into its words at a capital: "OverEngineered" → ["Over", "Engineered"]. */
export function logoWords(title: string): string[] {
  const words = title.split(/(?<=[a-z])(?=[A-Z])|\s+/).filter((w) => w.length > 0);
  return words.length > 0 ? words : [title];
}

/** The logo element: the brackets, one span per word and the cursor. */
export function createLogo(title: string): HTMLElement {
  const logo = el('h1', 'logo');
  logo.setAttribute('aria-label', title);
  const open = el('span', 'logo-bracket', '<');
  const close = el('span', 'logo-bracket', '/>');
  const cursor = el('span', 'logo-cursor');
  const words = logoWords(title).map((word, w) => el('span', `logo-word logo-word-${w}`, word));
  for (const node of [open, ...words, close, cursor]) node.setAttribute('aria-hidden', 'true');
  logo.append(open, ...words, close, cursor);
  return logo;
}
