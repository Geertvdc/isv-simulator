/** The level intro card before a round, and the countdown over the map. */

import type { FlowView } from '../render/GameScene';
import { SHIP_IT_BANNER_MS } from '../sim/balance';
import {
  COUNTDOWN_GO_TEXT,
  INTRO_CONTROLS,
  INTRO_ORDERS_TITLE,
  LEVEL_BLURBS,
  LEVEL_INTRO_TIPS,
  levelFile,
  levelLabel,
} from '../sim/content';
import { CHAPTERS, levelById } from '../sim/levels';
import { MAX_PLAYERS } from '../sim/level';
import { coverageHint, workloadForecast } from '../flow/workload';
import { selection } from '../flow/roster';
import { localBindings } from '../flow/online';
import { rolePanel, seatWindow, type RosterDispatch } from './roles';
import { el } from './dom';
import { introPicture } from './introPicture';
import { levelRecipes } from './recipes';
import type { ScreenView } from './screens';
import { statusBar } from './statusBar';
import { stepChips } from './stepTiles';

/** Where level `levelId` sits: its chapter and level number, counted from 1. */
function placeOf(levelId: string): { chapter: number; level: number } | null {
  for (const [c, chapter] of CHAPTERS.entries()) {
    const l = chapter.levels.findIndex((level) => level.id === levelId);
    if (l >= 0) return { chapter: c, level: l };
  }
  return null;
}

export function mountIntro(
  root: HTMLElement,
  dispatch: RosterDispatch,
): ScreenView & { toggleGuide: () => void } {
  const screen = el('div', 'screen intro-screen');
  screen.hidden = true;
  const card = el('div', 'intro-card');
  const header = el('div', 'intro-header');
  const title = el('h1', 'intro-name');
  const guideButton = document.createElement('button');
  guideButton.className = 'intro-guide-button';
  guideButton.type = 'button';
  guideButton.textContent = 'Level guide';
  guideButton.title = 'Up/down on keyboard or controller';
  guideButton.setAttribute('aria-expanded', 'false');
  const guide = el('div', 'intro-guide');
  guide.id = 'level-guide';
  guideButton.setAttribute('aria-controls', guide.id);
  guide.hidden = true;
  header.append(title, guideButton);
  let readingGuide = false;
  const team = el('div', 'intro-team');
  const seats = Array.from({ length: MAX_PLAYERS }, (_, i) => {
    const seat = el('div', 'intro-seat');
    const status = seatWindow(seat, i + 1);
    status.classList.add('intro-ready-state');
    const role = rolePanel(seat, dispatch);
    team.append(seat);
    return { seat, status, role };
  });
  const coverage = el('div', 'intro-coverage');
  const setupError = el('div', 'setup-error');
  setupError.setAttribute('role', 'alert');
  const body = el('div', 'intro-body');
  const legend = el(
    'div',
    'skill-legend',
    '1.00x = standard work speed · Review and builds unchanged',
  );
  body.append(header, card, team, guide, legend, coverage, setupError);
  guideButton.onclick = () => {
    readingGuide = !readingGuide;
    guide.hidden = !readingGuide;
    team.hidden = readingGuide;
    legend.hidden = readingGuide;
    guideButton.textContent = readingGuide ? 'Back to team' : 'Level guide';
    guideButton.setAttribute('aria-expanded', String(readingGuide));
  };
  for (const event of ['keydown', 'keyup'])
    guideButton.addEventListener(event, (e) => {
      if (e instanceof KeyboardEvent && (e.key === 'Enter' || e.key === ' ')) e.stopPropagation();
    });
  screen.append(
    body,
    statusBar('Left/right: role · Up/down: guide · E / RShift / A: ready · Esc / B: back'),
  );
  root.append(screen);
  /** The level and player count the card shows, so it is only built once per intro. */
  let shown = '';

  function build(view: FlowView): void {
    const levelId = view.levelIds[view.flow.levelIndex] ?? '';
    const place = placeOf(levelId);
    const chapter = place ? CHAPTERS[place.chapter] : undefined;
    const level = levelById(levelId);
    card.replaceChildren();
    guide.replaceChildren();
    if (!level) return;
    header.dataset.file = place ? levelFile(place.chapter + 1, place.level + 1) : 'role-lab.ts';
    title.textContent = `${place ? `${levelLabel(place.chapter + 1, place.level + 1)} · ` : ''}${level.name}`;
    title.title = chapter?.name ?? 'Development lab · no campaign progression';

    const forecast = el('div', 'intro-forecast');
    forecast.append(el('h2', 'intro-section', 'Planned workload'));
    const workload = workloadForecast(level, view.flow.lobby.players.length);
    for (const line of workload.summary) {
      forecast.append(el('p', '', line));
    }
    card.append(forecast);
    const tip = LEVEL_INTRO_TIPS[level.id];
    if (tip) {
      const box = el('div', 'intro-tip');
      box.append(introPicture(tip.picture), el('div', 'intro-tip-text', tip.text));
      guide.append(box);
    }

    const recipes = el('div', 'intro-recipes');
    recipes.append(el('h2', 'intro-section', INTRO_ORDERS_TITLE));
    for (const recipe of levelRecipes(level, view.flow.lobby.players.length)) {
      const row = el('div', 'intro-recipe');
      row.append(
        el('span', 'intro-recipe-name', recipe.name),
        stepChips(recipe.steps, recipe.kind),
      );
      recipes.append(row);
    }
    guide.append(recipes);
    const detail = el('div', 'intro-workload-detail');
    detail.append(el('h2', 'intro-section', 'Workload details'));
    for (const line of workload.lines) detail.append(el('p', '', line));
    guide.append(detail);
    // The very first level also lists the buttons.
    if (place?.chapter === 0 && place.level === 0) {
      const controls = el('div', 'intro-controls');
      for (const { action, keys } of INTRO_CONTROLS) {
        const row = el('div', 'intro-control');
        row.append(
          el('span', 'intro-control-action', action),
          el('span', 'intro-control-keys', keys),
        );
        controls.append(row);
      }
      guide.append(controls);
    }
    guide.setAttribute('aria-label', `${level.name}: ${LEVEL_BLURBS[level.id] ?? ''}`);
  }

  return {
    toggleGuide: () => {
      if (!screen.hidden) guideButton.click();
    },
    render: (view) => {
      const visible = view?.flow.screen === 'intro';
      screen.hidden = !visible;
      if (!view || !visible) {
        for (const { role } of seats) role.render(null, 0, false, true);
        shown = '';
        readingGuide = false;
        guide.hidden = true;
        team.hidden = false;
        legend.hidden = false;
        guideButton.textContent = 'Level guide';
        guideButton.setAttribute('aria-expanded', 'false');
        return;
      }
      const key = `${view.flow.levelIndex}:${view.flow.lobby.players.length}`;
      if (key !== shown) build(view);
      shown = key;
      const { lobby } = view.flow;
      team.dataset.count = String(lobby.players.length);
      const mine = new Set(
        view.online
          ? localBindings(view.online).map((p) => p.playerId)
          : lobby.players.map((p) => p.playerId),
      );
      for (const [i, seat] of seats.entries()) {
        const player = lobby.players[i];
        seat.seat.hidden = !player;
        const connected =
          !view.online ||
          view.online.members.some(
            (m) => m.connected && player?.deviceId.startsWith(`${m.sessionId}:`),
          );
        seat.role.render(
          player ? lobby : null,
          player?.playerId ?? i + 1,
          mine.has(player?.playerId ?? 0) && connected,
          true,
        );
        seat.status.textContent = !connected
          ? 'Reconnecting · not blocking ready'
          : selection(lobby, player?.playerId ?? 0).ready
            ? '✓ Ready'
            : 'Choosing role';
      }
      const level = levelById(view.levelIds[view.flow.levelIndex] ?? '');
      coverage.textContent = level
        ? coverageHint(
            workloadForecast(level, lobby.players.length),
            lobby.players.map((p) => selection(lobby, p.playerId).roleId),
          )
        : '';
      setupError.textContent = view.online?.setupError ?? '';
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
