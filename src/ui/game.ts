import type { GameFrame } from '../render/GameScene';
import { tileColor } from '../render/MapRenderer';
import { ORDER_URGENT_TICKS } from '../sim/balance';
import {
  INCIDENT_BANNER_TEXT,
  MEETING_MISSED_TEXT,
  PAUSE_HINT,
  inviteText,
  PIPELINE_BROKE_TEXT,
  UNTESTED_SHIP_TEXT,
} from '../sim/content';
import type { Invite } from '../sim/meetings';
import { type Order, openIncident, ticksLeft } from '../sim/orders';
import type { GameState } from '../sim/state';
import type { StepKind } from '../sim/tickets';
import { playerCssColor } from '../render/playerColors';
import { formatClock } from './format';

/** Each step shows as the letter of its station on the map, in that station's color. */
const STEP_LABEL: Readonly<Record<StepKind, { letter: string; color: string }>> = {
  code: { letter: 'K', color: cssColor(tileColor('keyboard')) },
  review: { letter: 'R', color: cssColor(tileColor('review')) },
  test: { letter: 'T', color: cssColor(tileColor('testBench')) },
  pipeline: { letter: 'P', color: cssColor(tileColor('pipeline')) },
};

const ORDER_KIND_LABEL: Readonly<Record<Order['kind'], string>> = {
  feature: 'Feature',
  bug: 'Bug',
  incident: 'Incident!',
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

interface InviteCard {
  card: HTMLElement;
  time: HTMLElement;
  fill: HTMLElement;
}

/** A calendar invite in the HUD: whose it is, its subject, time left and time sat. */
function createInviteCard(invite: Invite): InviteCard {
  const card = el('div', 'invite');
  card.style.setProperty('--player-color', playerCssColor(invite.playerId));
  const head = el('div', 'invite-head');
  const time = el('span', 'invite-time');
  head.append(el('span', 'invite-who', inviteText(invite.playerId)), time);
  const bar = el('div', 'invite-bar');
  const fill = el('div', 'invite-bar-fill');
  bar.append(fill);
  card.append(head, el('div', 'invite-title', `📅 ${invite.title}`), bar);
  return { card, time, fill };
}

export interface GameHud {
  /** Shows the round, or hides everything for `null`. */
  render: (frame: GameFrame | null) => void;
}

/**
 * The in-game HUD: order bar on top, score and clock below. The results
 * screen is its own view.
 */
export function mountGameHud(root: HTMLElement): GameHud {
  const orders = el('div', 'orders');
  const score = el('div', 'hud-score');
  const scoreValue = el('span', 'hud-score-value', '0');
  score.append(el('span', 'hud-score-label', 'Score'), scoreValue);
  const clock = el('div', 'hud-clock');
  const pauseHint = el('div', 'hud-pause-hint', PAUSE_HINT);
  /** Bottom center, over the pause hint: incident banner and meeting invites. */
  const alerts = el('div', 'hud-alerts');
  const incidentBanner = el('div', 'hud-incident', INCIDENT_BANNER_TEXT);
  const invites = el('div', 'hud-invites');
  alerts.append(incidentBanner, invites);

  const parts = [orders, score, clock, pauseHint, alerts];
  for (const part of parts) part.hidden = true;
  root.append(...parts);

  const cards = new Map<number, OrderCard>();
  const inviteCards = new Map<number, InviteCard>();

  function syncInvites(state: GameState): void {
    const open = new Set(state.invites.map((i) => i.id));
    for (const [id, { card }] of inviteCards) {
      if (open.has(id)) continue;
      card.remove();
      inviteCards.delete(id);
    }
    for (const invite of state.invites) {
      let entry = inviteCards.get(invite.id);
      if (!entry) {
        entry = createInviteCard(invite);
        inviteCards.set(invite.id, entry);
        invites.append(entry.card);
      }
      const left = Math.max(0, invite.expiresTick - state.tick);
      entry.time.textContent = formatClock(left);
      entry.fill.style.width = `${((invite.attendedTicks / invite.attendTicks) * 100).toFixed(1)}%`;
      entry.card.classList.toggle('urgent', left <= ORDER_URGENT_TICKS / 2);
    }
  }

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
        for (const { card } of [...cards.values(), ...inviteCards.values()]) card.remove();
        cards.clear();
        inviteCards.clear();
        return;
      }
      const { state } = frame;
      syncOrders(state);
      syncInvites(state);
      scoreValue.textContent = String(state.score);
      clock.textContent = formatClock(state.settings.durationTicks - state.tick);
      pauseHint.hidden = state.result !== null;
      incidentBanner.hidden = openIncident(state) === undefined;
      for (const event of frame.events) {
        if (event.type === 'orderShipped') {
          const parts = event.points > 0 ? [`+${event.points}`] : [];
          if (event.untested) parts.push(UNTESTED_SHIP_TEXT);
          if (parts.length > 0) popup(parts.join(' '), 'gain');
        }
        if (event.type === 'orderExpired' && event.penalty > 0) popup(`-${event.penalty}`, 'loss');
        if (event.type === 'pipelineBroke') popup(PIPELINE_BROKE_TEXT, 'loss');
        if (event.type === 'meetingMissed') {
          popup(
            event.penalty > 0 ? `-${event.penalty} ${MEETING_MISSED_TEXT}` : MEETING_MISSED_TEXT,
            'loss',
          );
        }
      }
    },
  };
}
