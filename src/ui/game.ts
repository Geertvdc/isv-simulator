import type { GameFrame } from '../render/GameScene';
import { tileColor } from '../render/MapRenderer';
import { ORDER_URGENT_TICKS } from '../sim/balance';
import { PIPELINE_BROKE_TEXT, UNTESTED_SHIP_TEXT } from '../sim/content';
import { type Order, ticksLeft } from '../sim/orders';
import type { GameState } from '../sim/state';
import type { StepKind } from '../sim/tickets';
import { formatClock, starText } from './format';

/** Each step shows as the letter of its station on the map, in that station's color. */
const STEP_LABEL: Readonly<Record<StepKind, { letter: string; color: string }>> = {
  code: { letter: 'K', color: cssColor(tileColor('keyboard')) },
  test: { letter: 'T', color: cssColor(tileColor('testBench')) },
  pipeline: { letter: 'P', color: cssColor(tileColor('pipeline')) },
};

const ORDER_KIND_LABEL: Readonly<Record<Order['kind'], string>> = {
  feature: 'Feature',
  bug: 'Bug',
};

/** How long a "+25" or "-10" floats by the score. */
const POPUP_MS = 1200;

function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function el(tag: string, className: string, text = ''): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

interface OrderCard {
  card: HTMLElement;
  fill: HTMLElement;
}

export interface GameHud {
  /** Shows the round, or hides everything for `null`. */
  render: (frame: GameFrame | null) => void;
}

/** The in-game HUD: order bar on top, score and clock below, and the end screen. */
export function mountGameHud(root: HTMLElement, levelName: string): GameHud {
  const orders = el('div', 'orders');
  const score = el('div', 'hud-score');
  const scoreValue = el('span', 'hud-score-value', '0');
  score.append(el('span', 'hud-score-label', 'Score'), scoreValue);
  const clock = el('div', 'hud-clock');

  const end = el('div', 'end-screen');
  const endScore = el('div', 'end-score');
  const endStars = el('div', 'end-stars');
  const endHint = el('div', 'end-hint', 'Press A or Enter to play again');
  end.append(el('h1', 'end-title', levelName), endStars, endScore, endHint);

  const parts = [orders, score, clock, end];
  for (const part of parts) part.hidden = true;
  root.append(...parts);

  const cards = new Map<number, OrderCard>();

  function createCard(order: Order): OrderCard {
    const card = el('div', `order order-${order.kind}`);
    card.append(el('div', 'order-kind', ORDER_KIND_LABEL[order.kind]));
    const steps = el('div', 'order-steps');
    for (const step of order.steps) {
      const label = STEP_LABEL[step];
      const icon = el('span', 'order-step', label.letter);
      icon.style.setProperty('--step-color', label.color);
      steps.append(icon);
    }
    const timer = el('div', 'order-timer');
    const fill = el('div', 'order-timer-fill');
    timer.append(fill);
    card.append(steps, timer);
    return { card, fill };
  }

  function syncOrders(state: GameState): void {
    const open = new Set(state.orders.map((o) => o.id));
    for (const [id, { card }] of cards) {
      if (open.has(id)) continue;
      card.remove();
      cards.delete(id);
    }
    for (const order of state.orders) {
      let entry = cards.get(order.id);
      if (!entry) {
        entry = createCard(order);
        cards.set(order.id, entry);
        orders.append(entry.card);
      }
      const left = ticksLeft(state, order);
      const share = left / Math.max(1, order.expiresTick - order.createdTick);
      entry.fill.style.width = `${(share * 100).toFixed(1)}%`;
      entry.card.classList.toggle('urgent', left <= ORDER_URGENT_TICKS);
    }
  }

  function popup(text: string, className: string): void {
    const node = el('div', `score-popup ${className}`, text);
    score.append(node);
    setTimeout(() => {
      node.remove();
    }, POPUP_MS);
  }

  return {
    render: (frame) => {
      for (const part of parts) part.hidden = frame === null;
      if (!frame) {
        for (const { card } of cards.values()) card.remove();
        cards.clear();
        return;
      }
      const { state } = frame;
      syncOrders(state);
      scoreValue.textContent = String(state.score);
      clock.textContent = formatClock(state.settings.durationTicks - state.tick);
      for (const event of frame.events) {
        if (event.type === 'orderShipped') {
          const parts = event.points > 0 ? [`+${event.points}`] : [];
          if (event.untested) parts.push(UNTESTED_SHIP_TEXT);
          if (parts.length > 0) popup(parts.join(' '), 'gain');
        }
        if (event.type === 'orderExpired' && event.penalty > 0) popup(`-${event.penalty}`, 'loss');
        if (event.type === 'pipelineBroke') popup(PIPELINE_BROKE_TEXT, 'loss');
      }

      end.hidden = state.result === null;
      if (state.result) {
        endStars.textContent = starText(state.result.stars);
        endScore.textContent = `Score: ${state.result.score}`;
        endHint.style.visibility = frame.canRestart ? 'visible' : 'hidden';
      }
    },
  };
}
