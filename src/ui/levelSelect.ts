import { isUnlocked, totalStars } from '../flow/save';
import type { FlowView } from '../render/GameScene';
import { MAX_STARS, STARS_TO_UNLOCK } from '../sim/balance';
import { LEVEL_BLURBS, LEVEL_SELECT_HINT, LEVEL_SELECT_TITLE, unlockHint } from '../sim/content';
import { LEVELS } from '../sim/levels';
import { el } from './dom';
import { starText } from './format';

export interface LevelSelectView {
  /** Shows the level select with its cursor, or hides it for `null`. */
  render: (view: FlowView | null) => void;
}

/**
 * One card per level with its best stars and score; locked levels are greyed
 * out and say what opens them. The highlighted one is picked with confirm.
 */
export function mountLevelSelect(root: HTMLElement): LevelSelectView {
  const panel = el('div', 'screen level-select');
  panel.hidden = true;
  const total = el('div', 'level-select-total');
  const cards = el('div', 'level-cards');
  const entries = LEVELS.map((level, i) => {
    const card = el('div', 'level-card');
    const stars = el('div', 'level-card-stars');
    const score = el('div', 'level-card-score');
    card.append(
      el('div', 'level-card-number', `Level ${i + 1}`),
      el('div', 'level-card-name', level.name),
      el('div', 'level-card-blurb', LEVEL_BLURBS[level.id] ?? ''),
      stars,
      score,
    );
    cards.append(card);
    return { card, stars, score, id: level.id };
  });
  panel.append(
    el('h1', 'screen-title', LEVEL_SELECT_TITLE),
    total,
    cards,
    el('div', 'screen-hint', LEVEL_SELECT_HINT),
  );
  root.append(panel);

  return {
    render: (view) => {
      panel.hidden = view === null;
      if (!view) return;
      const { flow, save, levelIds, unlockAll } = view;
      total.textContent = `${totalStars(save, levelIds)} / ${levelIds.length * MAX_STARS} ★`;
      entries.forEach(({ card, stars, score, id }, i) => {
        const open = isUnlocked(save, levelIds, i, unlockAll);
        const record = save.levels[id];
        card.classList.toggle('selected', i === flow.levelIndex);
        card.classList.toggle('locked', !open);
        stars.classList.toggle('played', open && record !== undefined);
        if (!open) {
          stars.textContent = `🔒 ${unlockHint(STARS_TO_UNLOCK, LEVELS[i - 1]?.name ?? '')}`;
          score.textContent = '';
        } else if (record) {
          stars.textContent = starText(record.bestStars);
          score.textContent = `Best score: ${record.bestScore}`;
        } else {
          stars.textContent = 'Not played yet';
          score.textContent = '';
        }
      });
    },
  };
}
