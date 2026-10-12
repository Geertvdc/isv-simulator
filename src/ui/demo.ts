/**
 * Demo mode over the round the bots play: a bar at the bottom saying it's a
 * demo and how to play, and once the round is over a card with the bots'
 * score, a dare to beat it.
 */

import { MAX_STARS } from '../sim/balance';
import { DEMO_PRESS_TEXT, DEMO_TAG, GAME_TITLE, LEVEL_NAMES, demoScoreText } from '../sim/content';
import { el } from './dom';
import type { ScreenView } from './screens';

/** While the demo shows, `root` gets this class: the HUD makes room for the bar. */
const DEMO_CLASS = 'demo-mode';

export function mountDemo(root: HTMLElement): ScreenView {
  const bar = el('div', 'demo-bar');
  const level = el('span', 'demo-level');
  bar.append(
    el('span', 'demo-tag', DEMO_TAG),
    el('span', 'demo-game', GAME_TITLE),
    level,
    el('span', 'demo-press', DEMO_PRESS_TEXT),
  );
  const card = el('div', 'demo-card');
  const cardLevel = el('div', 'demo-card-level');
  const stars = el('div', 'demo-card-stars');
  const starEls = Array.from({ length: MAX_STARS }, () => el('span', 'demo-card-star', '★'));
  stars.append(...starEls);
  const score = el('div', 'demo-card-score');
  card.append(cardLevel, stars, score, el('div', 'demo-card-press', DEMO_PRESS_TEXT));
  bar.hidden = true;
  card.hidden = true;
  root.append(bar, card);
  return {
    render: (view) => {
      const demo = view?.flow.screen === 'demo' ? view : null;
      root.classList.toggle(DEMO_CLASS, demo !== null);
      bar.hidden = demo === null;
      const end = demo?.flow.demoEnd ?? null;
      card.hidden = end === null;
      if (!demo) return;
      const levelId = demo.levelIds[demo.flow.levelIndex] ?? '';
      const name = LEVEL_NAMES[levelId] ?? levelId;
      level.textContent = name;
      if (!end) return;
      cardLevel.textContent = name;
      starEls.forEach((star, i) => star.classList.toggle('earned', i < end.stars));
      score.textContent = demoScoreText(end.score);
    },
  };
}
