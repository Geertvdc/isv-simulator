/** The level intro card before a round, and the countdown over the map. */

import type { FlowView } from '../render/GameScene';
import { SHIP_IT_BANNER_MS } from '../sim/balance';
import {
  COUNTDOWN_GO_TEXT,
  INTRO_CONTROLS,
  INTRO_HINT,
  INTRO_ORDERS_TITLE,
  LEVEL_BLURBS,
  LEVEL_INTRO_TIPS,
  levelLabel,
} from '../sim/content';
import { CHAPTERS } from '../sim/levels';
import { el } from './dom';
import { stepChips } from './game';
import { introPicture } from './introPicture';
import { levelRecipes } from './recipes';
import type { ScreenView } from './screens';

/** Where level `levelId` sits: its chapter and level number, counted from 1. */
function placeOf(levelId: string): { chapter: number; level: number } | null {
  for (const [c, chapter] of CHAPTERS.entries()) {
    const l = chapter.levels.findIndex((level) => level.id === levelId);
    if (l >= 0) return { chapter: c, level: l };
  }
  return null;
}

export function mountIntro(root: HTMLElement): ScreenView {
  const screen = el('div', 'screen intro-screen');
  screen.hidden = true;
  const card = el('div', 'intro-card');
  screen.append(card, el('div', 'screen-hint', INTRO_HINT));
  root.append(screen);
  /** The level and player count the card shows, so it is only built once per intro. */
  let shown = '';

  function build(view: FlowView): void {
    const levelId = view.levelIds[view.flow.levelIndex] ?? '';
    const place = placeOf(levelId);
    const chapter = place ? CHAPTERS[place.chapter] : undefined;
    const level = chapter?.levels[place?.level ?? 0];
    card.replaceChildren();
    if (!place || !chapter || !level) return;

    card.append(
      el(
        'div',
        'intro-place',
        `${chapter.name} · ${levelLabel(place.chapter + 1, place.level + 1)}`,
      ),
      el('h1', 'intro-name', level.name),
      el('div', 'intro-blurb', LEVEL_BLURBS[level.id] ?? ''),
    );

    const tip = LEVEL_INTRO_TIPS[level.id];
    if (tip) {
      const box = el('div', 'intro-tip');
      box.append(introPicture(tip.picture), el('div', 'intro-tip-text', tip.text));
      card.append(box);
    }

    const recipes = el('div', 'intro-recipes');
    recipes.append(el('h2', 'intro-section', INTRO_ORDERS_TITLE));
    for (const recipe of levelRecipes(level, view.flow.lobby.players.length)) {
      const row = el('div', 'intro-recipe');
      row.append(el('span', 'intro-recipe-name', recipe.name), stepChips(recipe.steps));
      recipes.append(row);
    }
    card.append(recipes);

    // The very first level also lists the buttons.
    if (place.chapter === 0 && place.level === 0) {
      const controls = el('div', 'intro-controls');
      for (const { action, keys } of INTRO_CONTROLS) {
        const row = el('div', 'intro-control');
        row.append(
          el('span', 'intro-control-action', action),
          el('span', 'intro-control-keys', keys),
        );
        controls.append(row);
      }
      card.append(controls);
    }
  }

  return {
    render: (view) => {
      const visible = view?.flow.screen === 'intro';
      screen.hidden = !visible;
      if (!view || !visible) {
        shown = '';
        return;
      }
      const key = `${view.flow.levelIndex}:${view.flow.lobby.players.length}`;
      if (key !== shown) build(view);
      shown = key;
    },
  };
}

/** "3, 2, 1" over the map during the countdown, then "Ship it!" as the round starts. */
export function mountCountdown(root: HTMLElement): ScreenView {
  const overlay = el('div', 'countdown');
  overlay.hidden = true;
  root.append(overlay);
  let last: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function show(text: string, className: string): void {
    clearTimeout(timer);
    overlay.hidden = false;
    overlay.textContent = text;
    // Restart the pop animation for every new number.
    overlay.className = 'countdown';
    overlay.getBoundingClientRect();
    overlay.className = `countdown ${className}`;
  }

  return {
    render: (view) => {
      const screen = view?.flow.screen;
      const number = view?.countdown ?? null;
      if (screen === 'countdown' && number !== null) {
        if (last !== String(number)) show(String(number), 'count');
        last = String(number);
        return;
      }
      if (screen === 'playing' && last !== null && last !== COUNTDOWN_GO_TEXT) {
        show(COUNTDOWN_GO_TEXT, 'go');
        last = COUNTDOWN_GO_TEXT;
        timer = setTimeout(() => {
          overlay.hidden = true;
        }, SHIP_IT_BANNER_MS);
        return;
      }
      if (screen !== 'playing') {
        clearTimeout(timer);
        overlay.hidden = true;
        last = null;
      }
    },
  };
}
