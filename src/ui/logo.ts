/**
 * The game's logo on the title screen: the name in big chunky letters on a
 * gentle arch, its two words in two colors ("Over" + "Engineered").
 */

import { el } from './dom';

/** How high the arch's middle stands over its ends, and how far its end letters lean, at most. */
const ARCH = { lift: 0.22, tiltDeg: 7 };

/** The title split into its words at a capital: "OverEngineered" → ["Over", "Engineered"]. */
export function logoWords(title: string): string[] {
  const words = title.split(/(?<=[a-z])(?=[A-Z])|\s+/).filter((w) => w.length > 0);
  return words.length > 0 ? words : [title];
}

/**
 * Letter `i` of `count` on the arch: how far up it sits (em) and how far it
 * leans (degrees), the middle highest and the ends leaning out.
 */
export function archOf(i: number, count: number): { lift: number; tiltDeg: number } {
  if (count < 2) return { lift: 0, tiltDeg: 0 };
  const u = (i / (count - 1)) * 2 - 1;
  return { lift: ARCH.lift * (1 - u * u), tiltDeg: ARCH.tiltDeg * u };
}

/** The logo element: one span per word, one per letter, each placed on the arch. */
export function createLogo(title: string): HTMLElement {
  const logo = el('h1', 'logo');
  logo.setAttribute('aria-label', title);
  const words = logoWords(title);
  const count = words.reduce((n, w) => n + w.length, 0);
  let i = 0;
  words.forEach((word, w) => {
    const span = el('span', `logo-word logo-word-${w}`);
    span.setAttribute('aria-hidden', 'true');
    for (const letter of word) {
      const { lift, tiltDeg } = archOf(i++, count);
      const node = el('span', 'logo-letter', letter);
      node.style.transform = `translateY(${-lift}em) rotate(${tiltDeg}deg)`;
      span.append(node);
    }
    logo.append(span);
  });
  return logo;
}
