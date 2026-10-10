/** The menu screens around a round: title, pause, results, settings and credits. */

import creditsMarkdown from '../../CREDITS.md?raw';
import { type MenuItem, menuItems } from '../flow/flow';
import type { Settings } from '../flow/save';
import type { FlowView } from '../render/GameScene';
import { SFX_VOLUME_MAX } from '../sim/balance';
import { CHAPTERS } from '../sim/levels';
import {
  CHAPTER_UNLOCKED_TEXT,
  CREDITS_TITLE,
  GAME_TAGLINE,
  GAME_TITLE,
  LEVEL_NAMES,
  LEVEL_UNLOCKED_TEXT,
  MENU_HINT,
  MENU_LABELS,
  NEW_BEST_TEXT,
  PAUSED_TITLE,
  PRESS_ANY_BUTTON_TEXT,
  SETTINGS_TITLE,
} from '../sim/content';
import { parseCredits } from './credits';
import { el } from './dom';
import { starText } from './format';
import { type MenuLine, createMenu } from './menu';

export interface ScreenView {
  /** Shows the screen for this flow, or hides it for `null`. */
  render: (view: FlowView | null) => void;
}

/** How slowly credits that don't fit roll by. */
const CREDITS_ROLL_MS_PER_PX = 60;

function volumeText(volume: number): string {
  return `${'■'.repeat(volume)}${'□'.repeat(SFX_VOLUME_MAX - volume)}`;
}

function menuLine(item: MenuItem, settings: Settings): MenuLine {
  const label = MENU_LABELS[item];
  if (item === 'volume') return { label, value: `◀ ${volumeText(settings.sfxVolume)} ▶` };
  if (item === 'shake') return { label, value: settings.screenShake ? 'On' : 'Off' };
  return { label };
}

function menuLines(view: FlowView): MenuLine[] {
  return menuItems(view.flow).map((item) => menuLine(item, view.save.settings));
}

function panel(root: HTMLElement, className: string): HTMLElement {
  const node = el('div', `screen ${className}`);
  node.hidden = true;
  root.append(node);
  return node;
}

export function mountTitle(root: HTMLElement): ScreenView {
  const screen = panel(root, 'title-screen');
  const menu = createMenu();
  const press = el('div', 'title-press', PRESS_ANY_BUTTON_TEXT);
  const hint = el('div', 'screen-hint', MENU_HINT);
  screen.append(
    el('h1', 'title-name', GAME_TITLE),
    el('div', 'title-tagline', GAME_TAGLINE),
    press,
    menu.root,
    hint,
  );
  return {
    render: (view) => {
      screen.hidden = view === null;
      if (!view) return;
      const awake = view.flow.awake;
      press.hidden = awake;
      menu.root.hidden = !awake;
      hint.style.visibility = awake ? 'visible' : 'hidden';
      menu.render(menuLines(view), view.flow.menuIndex);
    },
  };
}

/** A title, a menu and the button hint: the pause and settings screens. */
function mountMenuScreen(root: HTMLElement, className: string, title: string): ScreenView {
  const screen = panel(root, className);
  const menu = createMenu();
  screen.append(el('h1', 'screen-title', title), menu.root, el('div', 'screen-hint', MENU_HINT));
  return {
    render: (view) => {
      screen.hidden = view === null;
      if (view) menu.render(menuLines(view), view.flow.menuIndex);
    },
  };
}

export function mountPause(root: HTMLElement): ScreenView {
  return mountMenuScreen(root, 'pause-screen', PAUSED_TITLE);
}

export function mountSettings(root: HTMLElement): ScreenView {
  return mountMenuScreen(root, 'settings-screen', SETTINGS_TITLE);
}

export function mountResults(root: HTMLElement): ScreenView {
  const screen = panel(root, 'results-screen');
  const title = el('h1', 'screen-title');
  const stars = el('div', 'results-stars');
  const score = el('div', 'results-score');
  const best = el('div', 'results-badge', NEW_BEST_TEXT);
  const unlocked = el('div', 'results-badge');
  const chapter = el('div', 'results-badge');
  const menu = createMenu();
  const hint = el('div', 'screen-hint', MENU_HINT);
  screen.append(title, stars, score, best, unlocked, chapter, menu.root, hint);
  return {
    render: (view) => {
      const results = view?.flow.results;
      screen.hidden = !view || !results;
      if (!view || !results) return;
      const levelId = view.levelIds[view.flow.levelIndex] ?? '';
      title.textContent = LEVEL_NAMES[levelId] ?? levelId;
      stars.textContent = starText(results.stars);
      score.textContent = `Score: ${results.score}`;
      best.hidden = !results.newBest;
      const unlockedId =
        results.unlockedIndex === null ? undefined : view.levelIds[results.unlockedIndex];
      unlocked.hidden = unlockedId === undefined;
      unlocked.textContent = `${LEVEL_UNLOCKED_TEXT} ${LEVEL_NAMES[unlockedId ?? ''] ?? ''}`.trim();
      const opened =
        results.unlockedChapter === null ? undefined : CHAPTERS[results.unlockedChapter];
      chapter.hidden = opened === undefined;
      chapter.textContent = `${CHAPTER_UNLOCKED_TEXT} ${opened?.name ?? ''}`.trim();
      hint.style.visibility = view.resultsReady ? 'visible' : 'hidden';
      menu.render(menuLines(view), view.flow.menuIndex, view.resultsReady);
    },
  };
}

export function mountCredits(root: HTMLElement): ScreenView {
  const screen = panel(root, 'credits-screen');
  const list = el('div', 'credits-list');
  const roll = el('div', 'credits-roll');
  list.append(roll);
  for (const line of parseCredits(creditsMarkdown)) {
    roll.append(el(line.kind === 'heading' ? 'h2' : 'p', `credits-${line.kind}`, line.text));
  }
  const menu = createMenu();
  screen.append(
    el('h1', 'screen-title', CREDITS_TITLE),
    list,
    menu.root,
    el('div', 'screen-hint', MENU_HINT),
  );
  return {
    render: (view) => {
      const wasHidden = screen.hidden;
      screen.hidden = view === null;
      if (!view) return;
      menu.render(menuLines(view), view.flow.menuIndex);
      if (wasHidden) {
        // Too long for the screen: roll slowly up and down, nobody scrolls with a gamepad.
        const overflow = Math.max(0, roll.scrollHeight - list.clientHeight);
        roll.style.setProperty('--overflow', `${-overflow}px`);
        roll.style.setProperty('--roll-time', `${CREDITS_ROLL_MS_PER_PX * overflow}ms`);
        roll.classList.toggle('rolling', overflow > 0);
      }
    },
  };
}
