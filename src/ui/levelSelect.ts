import type { LevelSelect } from '../input/levelSelect';
import { LEVEL_BLURBS } from '../sim/content';
import { LEVELS } from '../sim/levels';
import { starText } from './format';
import { type StorageLike, loadBestStars } from './progress';

export interface LevelSelectView {
  /** Shows the level select with its cursor, or hides it for `null`. */
  render: (select: LevelSelect | null) => void;
}

function el(tag: string, className: string, text = ''): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

/** One card per level with its best stars; the highlighted one is picked with interact. */
export function mountLevelSelect(root: HTMLElement, storage: StorageLike | null): LevelSelectView {
  const panel = el('div', 'level-select');
  panel.hidden = true;
  const cards = el('div', 'level-cards');
  const entries = LEVELS.map((level, i) => {
    const card = el('div', 'level-card');
    const stars = el('div', 'level-card-stars');
    card.append(
      el('div', 'level-card-number', `Level ${i + 1}`),
      el('div', 'level-card-name', level.name),
      el('div', 'level-card-blurb', LEVEL_BLURBS[level.id] ?? ''),
      stars,
    );
    cards.append(card);
    return { card, stars, id: level.id };
  });
  panel.append(
    el('h1', 'level-select-title', 'Pick a level'),
    cards,
    el('div', 'level-select-hint', 'Move left or right, interact to play'),
  );
  root.append(panel);

  return {
    render: (select) => {
      panel.hidden = select === null;
      if (!select) return;
      const best = loadBestStars(storage);
      entries.forEach(({ card, stars, id }, i) => {
        card.classList.toggle('selected', i === select.index);
        const got = best[id];
        stars.textContent = got === undefined ? 'Not played yet' : starText(got);
        stars.classList.toggle('played', got !== undefined);
      });
    },
  };
}
