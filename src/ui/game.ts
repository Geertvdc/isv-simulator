import type { GameFrame } from '../render/GameScene';
import { KIND_COLOR, cssHex, orderStepTiles, orderTimeShare, timerColor } from '../render/stepLook';
import { ORDER_URGENT_TICKS } from '../sim/balance';
import {
  INCIDENT_BANNER_TEXT,
  MEETING_MISSED_TEXT,
  ORDER_EXPIRED_STAMP,
  ORDER_KIND_LABELS,
  PAUSE_HINT,
  inviteText,
  orderNumber,
  PIPELINE_BROKE_TEXT,
  UNTESTED_SHIP_TEXT,
} from '../sim/content';
import type { Invite } from '../sim/meetings';
import { type Order, openIncident, ticksLeft } from '../sim/orders';
import type { GameState } from '../sim/state';
import { playerCssColor } from '../render/playerColors';
import { el } from './dom';
import { formatClock } from './format';
import { playerBadge } from './playerBadge';
import { type StepTileView, stepRow } from './stepTiles';

/** How long a "+25" or "-10" floats by the score. */
const POPUP_MS = 1200;
/** How long an order card whose time ran out stays, greyed out and stamped. */
const EXPIRED_CARD_MS = 1100;

/**
 * An order card, like an issue-tracker card: the timer bar on top, `#id`,
 * a kind chip and the title, then its steps as tiles ticked off like CI checks.
 */
interface OrderCard {
  card: HTMLElement;
  fill: HTMLElement;
  title: HTMLElement;
  tiles: StepTileView[];
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
  const who = el('span', 'invite-who', inviteText(invite.playerId));
  who.prepend(playerBadge(invite.playerId));
  head.append(who, time);
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

  /** Cards of orders that just ran out, greyed out and stamped until they drop off. */
  const leaving = new Set<HTMLElement>();

  function createCard(state: GameState, order: Order): OrderCard {
    const card = el('div', `order order-${order.kind}`);
    card.style.setProperty('--kind-color', cssHex(KIND_COLOR[order.kind]));
    const timer = el('div', 'order-timer');
    const fill = el('div', 'order-timer-fill');
    timer.append(fill);
    const head = el('div', 'order-head');
    head.append(
      el('span', 'order-id', orderNumber(order.id)),
      el('span', 'order-chip', ORDER_KIND_LABELS[order.kind]),
    );
    const title = el('div', 'order-title');
    const { row, views } = stepRow(orderStepTiles(order, state.tickets));
    card.append(timer, head, title, row);
    return { card, fill, title, tiles: views };
  }

  /** The order ran out: grey the card, stamp it, and let it drop off a moment later. */
  function expireCard(id: number): void {
    const entry = cards.get(id);
    if (!entry) return;
    cards.delete(id);
    const { card } = entry;
    card.classList.remove('urgent');
    card.classList.add('expired');
    card.append(el('div', 'order-stamp', ORDER_EXPIRED_STAMP));
    leaving.add(card);
    setTimeout(() => {
      card.remove();
      leaving.delete(card);
    }, EXPIRED_CARD_MS);
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
        entry = createCard(state, order);
        cards.set(order.id, entry);
        orders.append(entry.card);
      }
      const left = ticksLeft(state, order);
      const share = orderTimeShare(order, state.tick);
      entry.fill.style.width = `${(share * 100).toFixed(1)}%`;
      entry.fill.style.background = cssHex(timerColor(share));
      entry.card.classList.toggle('urgent', left <= ORDER_URGENT_TICKS);
      const title = state.tickets.find((t) => t.orderId === order.id)?.title ?? '';
      if (entry.title.textContent !== title) entry.title.textContent = title;
      const tiles = orderStepTiles(order, state.tickets);
      entry.tiles.forEach((view, i) => {
        const tile = tiles[i];
        if (tile) view.update(tile);
      });
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
        for (const card of leaving) card.remove();
        cards.clear();
        inviteCards.clear();
        leaving.clear();
        return;
      }
      const { state } = frame;
      for (const event of frame.events) {
        if (event.type === 'orderExpired') expireCard(event.order.id);
      }
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
        if (event.type === 'shipBlocked') {
          // Restart the head shake even if it's still running.
          incidentBanner.classList.remove('nope');
          incidentBanner.getBoundingClientRect();
          incidentBanner.classList.add('nope');
        }
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
