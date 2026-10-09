/**
 * Orders: what the customer wants, with a timer. Shipping a finished ticket
 * completes one; letting the timer run out costs points. Also the level
 * timer, score and stars.
 */

import {
  BUG_CHANCE,
  BUG_EXPIRED_PENALTY,
  BUG_ORDER_POINTS,
  BUG_CHANCE_UNTESTED,
  BUG_DELAY_TICKS,
  EXPIRED_PENALTY,
  ORDER_POINTS,
  ORDER_SPEED_BONUS_MAX,
} from './balance';
import { TICKET_TITLES, bugTitle } from './content';
import * as rng from './rng';
import type { GameState, PlayerId } from './state';
import {
  REVIEWED_FEATURE_STEPS,
  type StepKind,
  TICKET_STEPS,
  type Ticket,
  type TicketKind,
  enqueueTicket,
  isShippable,
  queuedTickets,
  skippedShare,
} from './tickets';

export interface Order {
  id: number;
  kind: TicketKind;
  /** The steps a ticket must have to complete this order. */
  steps: StepKind[];
  createdTick: number;
  expiresTick: number;
}

/** A bug on its way back after a buggy ship. */
export interface PendingBug {
  /** Tick at which it lands in the bug queue. */
  tick: number;
  title: string;
}

export interface LevelResult {
  score: number;
  /** 0 to 3. */
  stars: number;
}

export type GameEvent =
  | { type: 'orderCreated'; order: Order }
  | {
      type: 'orderShipped';
      /** `null` when its order had already expired: shipped late, for nothing. */
      order: Order | null;
      points: number;
      playerId: PlayerId;
      /** Some tests were skipped. */
      untested: boolean;
    }
  | { type: 'orderExpired'; order: Order; penalty: number }
  | { type: 'levelEnded'; result: LevelResult }
  /** A finished build was left too long; `ticketId` has to be built again. */
  | { type: 'pipelineBroke'; x: number; y: number; ticketId: number }
  | { type: 'pipelineRepaired'; x: number; y: number }
  | { type: 'dashed'; playerId: PlayerId }
  | { type: 'thrown'; playerId: PlayerId; ticketId: number }
  | { type: 'caught'; playerId: PlayerId; ticketId: number }
  /** A thrown ticket came down on tile (x, y). */
  | { type: 'landed'; ticketId: number; x: number; y: number }
  /** A dashing player knocked `target` away. */
  | { type: 'shoved'; by: PlayerId; target: PlayerId };

/** Ticks left on an order; 0 once it's due. */
export function ticksLeft(state: GameState, order: Order): number {
  return Math.max(0, order.expiresTick - state.tick);
}

/** Chance a shipped ticket comes back as a bug: higher the more of its tests were skipped. */
export function bugChance(ticket: Ticket): number {
  return BUG_CHANCE + (BUG_CHANCE_UNTESTED - BUG_CHANCE) * skippedShare(ticket);
}

/** Points for shipping `order` at `tick`: base points plus a bonus for the share of time left. Bug fixes earn nothing. */
export function shipPoints(order: Order, tick: number): number {
  if (order.kind === 'bug') return BUG_ORDER_POINTS;
  const limit = order.expiresTick - order.createdTick;
  const left = Math.max(0, order.expiresTick - tick);
  const share = limit > 0 ? Math.min(1, left / limit) : 0;
  return ORDER_POINTS + Math.round(ORDER_SPEED_BONUS_MAX * share);
}

/** Stars for a score: one per threshold reached. */
export function starsFor(score: number, thresholds: readonly number[]): number {
  return thresholds.filter((t) => score >= t).length;
}

function sameSteps(a: readonly StepKind[], b: readonly StepKind[]): boolean {
  return a.length === b.length && a.every((s, i) => s === b[i]);
}

/** Open orders a ticket could complete, least time left first. */
export function matchingOrders(state: GameState, ticket: Ticket): Order[] {
  const steps = ticket.steps.map((s) => s.kind);
  return state.orders
    .filter((o) => sameSteps(o.steps, steps))
    .sort((a, b) => a.expiresTick - b.expiresTick || a.id - b.id);
}

/** Opens an order and puts its ticket in the queue for its kind; `steps` default to its kind's. */
export function createOrder(
  state: GameState,
  kind: TicketKind,
  title: string,
  steps: readonly StepKind[] = TICKET_STEPS[kind],
): Order {
  const { orderSchedule } = state.settings;
  const limit = kind === 'bug' ? orderSchedule.bugTimeLimitTicks : orderSchedule.timeLimitTicks;
  const order: Order = {
    id: state.nextOrderId++,
    kind,
    steps: [...steps],
    createdTick: state.tick,
    expiresTick: state.tick + limit,
  };
  state.orders.push(order);
  enqueueTicket(state, kind, title, steps);
  state.events.push({ type: 'orderCreated', order });
  return order;
}

/**
 * Ships the ticket `playerId` carries: completes the matching order with the
 * least time left, scores it and maybe sends a bug back later (more likely
 * when tests were skipped). A ticket whose order already expired still ships,
 * for no points. Refuses tickets missing a required step. Returns whether it
 * shipped.
 */
export function shipTicket(state: GameState, playerId: PlayerId, ticket: Ticket): boolean {
  if (!isShippable(ticket)) return false;
  const order = matchingOrders(state, ticket)[0] ?? null;

  const points = order ? shipPoints(order, state.tick) : 0;
  state.tickets = state.tickets.filter((t) => t !== ticket);
  if (order) state.orders = state.orders.filter((o) => o !== order);
  state.score += points;
  const untested = skippedShare(ticket) > 0;
  state.events.push({ type: 'orderShipped', order, points, playerId, untested });

  const [roll, s] = rng.next(state.rngState);
  state.rngState = s;
  if (roll < bugChance(ticket)) {
    state.pendingBugs.push({ tick: state.tick + BUG_DELAY_TICKS, title: bugTitle(ticket.title) });
  }
  return true;
}

/**
 * Expires orders whose timer ran out: the penalty, and one waiting ticket of
 * their kind leaves its queue. Runs after the tick counter moves on, so an
 * order is gone as soon as it has no time left.
 */
export function expireOrders(state: GameState): void {
  for (const order of state.orders.filter((o) => state.tick >= o.expiresTick)) {
    state.orders = state.orders.filter((o) => o !== order);
    const full = order.kind === 'bug' ? BUG_EXPIRED_PENALTY : EXPIRED_PENALTY;
    const penalty = Math.min(full, state.score);
    state.score -= penalty;
    const waiting = queuedTickets(state, order.kind)[0];
    if (waiting) state.tickets = state.tickets.filter((t) => t !== waiting);
    state.events.push({ type: 'orderExpired', order, penalty });
  }
}

/** Per tick: lands due bugs, and opens the next feature order once it's due and there's room. */
export function updateOrders(state: GameState): void {
  const due = state.pendingBugs.filter((b) => state.tick >= b.tick);
  if (due.length > 0) {
    state.pendingBugs = state.pendingBugs.filter((b) => state.tick < b.tick);
    for (const bug of due) createOrder(state, 'bug', bug.title);
  }

  const { orderSchedule } = state.settings;
  const openFeatures = state.orders.filter((o) => o.kind === 'feature').length;
  if (state.tick >= state.nextOrderTick && openFeatures < orderSchedule.maxOpenOrders) {
    const [title, s1] = rng.pick(state.rngState, TICKET_TITLES);
    const [jitter, s2] = rng.int(s1, -orderSchedule.jitterTicks, orderSchedule.jitterTicks);
    state.rngState = s2;
    createOrder(state, 'feature', title, featureSteps(state));
    state.nextOrderTick = state.tick + orderSchedule.intervalTicks + jitter;
  }
}

/** Steps for the next feature order: with a review for `reviewShare` of them. */
function featureSteps(state: GameState): readonly StepKind[] {
  // No roll at all without reviews, so levels without them keep their order sequence.
  if (state.settings.reviewShare <= 0) return TICKET_STEPS.feature;
  const [roll, s] = rng.next(state.rngState);
  state.rngState = s;
  return roll < state.settings.reviewShare ? REVIEWED_FEATURE_STEPS : TICKET_STEPS.feature;
}

/** Ends the level once its duration is up. */
export function updateLevelTimer(state: GameState): void {
  if (state.result || state.tick < state.settings.durationTicks) return;
  const result = {
    score: state.score,
    stars: starsFor(state.score, state.settings.starThresholds),
  };
  state.result = result;
  state.events.push({ type: 'levelEnded', result });
}
