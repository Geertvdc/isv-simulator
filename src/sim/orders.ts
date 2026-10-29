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
  INCIDENT_EXPIRED_PENALTY,
  INCIDENT_POINTS,
  DESIGNED_ORDER_POINTS,
  DESIGNED_TIME_FACTOR,
  FULLSTACK_ORDER_POINTS,
  FULLSTACK_TIME_FACTOR,
  ORDER_POINTS,
  ORDER_SPEED_BONUS_MAX,
} from './balance';
import { INCIDENT_TITLES, TICKET_TITLES, bugTitle } from './content';
import type { Invite } from './meetings';
import * as rng from './rng';
import type { GameState, PlayerId } from './state';
import {
  DESIGNED_FEATURE_STEPS,
  PART_KINDS,
  REVIEWED_FEATURE_STEPS,
  type StepKind,
  TICKET_STEPS,
  type QueueKind,
  type Ticket,
  type TicketKind,
  QUEUE_OF,
  enqueueTicket,
  isPart,
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
  /** `playerId` tried to ship `ticketId` while an incident is open: hotfix first. */
  | { type: 'shipBlocked'; playerId: PlayerId; ticketId: number }
  | { type: 'levelEnded'; result: LevelResult }
  /** A finished build was left too long; `ticketId` has to be built again. */
  | { type: 'pipelineBroke'; x: number; y: number; ticketId: number }
  | { type: 'pipelineRepaired'; x: number; y: number }
  /** The pipeline at (x, y) finished building `ticketId`: come and get it. */
  | { type: 'buildDone'; x: number; y: number; ticketId: number }
  | { type: 'pickedUp'; playerId: PlayerId; ticketId: number }
  | { type: 'putDown'; playerId: PlayerId; ticketId: number }
  | { type: 'binned'; playerId: PlayerId; ticketId: number }
  /** A ticket came down in a gap or off the edge: it's back in its queue, its work lost. */
  | { type: 'ticketLost'; ticketId: number; x: number; y: number; queue: QueueKind }
  /** A front end and a back end became full-stack ticket `ticketId` on tile (x, y). */
  | { type: 'merged'; ticketId: number; parts: [number, number]; x: number; y: number }
  /** A conveyor moved a ticket onto tile (x, y). */
  | { type: 'conveyed'; ticketId: number; x: number; y: number }
  | { type: 'dashed'; playerId: PlayerId }
  | { type: 'thrown'; playerId: PlayerId; ticketId: number }
  | { type: 'caught'; playerId: PlayerId; ticketId: number }
  /** A thrown ticket came down on tile (x, y). */
  | { type: 'landed'; ticketId: number; x: number; y: number }
  /** A dashing player knocked `target` away. */
  | { type: 'shoved'; by: PlayerId; target: PlayerId }
  /** A walking manager knocked `target` away. */
  | { type: 'managerBumped'; managerId: number; target: PlayerId }
  /** A calendar invite went out to `invite.playerId`. */
  | { type: 'inviteSent'; invite: Invite }
  | { type: 'meetingAttended'; invite: Invite }
  | { type: 'meetingMissed'; invite: Invite; penalty: number };

/** Ticks left on an order; 0 once it's due. */
export function ticksLeft(state: GameState, order: Order): number {
  return Math.max(0, order.expiresTick - state.tick);
}

/** Chance a shipped ticket comes back as a bug: higher the more of its tests were skipped. */
export function bugChance(ticket: Ticket): number {
  return BUG_CHANCE + (BUG_CHANCE_UNTESTED - BUG_CHANCE) * skippedShare(ticket);
}

/**
 * Points for shipping `order` at `tick`: base points plus a bonus for the
 * share of time left. Bug fixes earn nothing; hotfixes earn incident points.
 */
export function shipPoints(order: Order, tick: number): number {
  if (order.kind === 'bug') return BUG_ORDER_POINTS;
  if (order.kind === 'fullstack') {
    return FULLSTACK_ORDER_POINTS + Math.round(ORDER_SPEED_BONUS_MAX * timeShare(order, tick));
  }
  const designed = order.steps.includes('design');
  const base =
    order.kind === 'incident' ? INCIDENT_POINTS : designed ? DESIGNED_ORDER_POINTS : ORDER_POINTS;
  return base + Math.round(ORDER_SPEED_BONUS_MAX * timeShare(order, tick));
}

/** Share of an order's time still left at `tick`, 0 to 1. */
function timeShare(order: Order, tick: number): number {
  const limit = order.expiresTick - order.createdTick;
  const left = Math.max(0, order.expiresTick - tick);
  return limit > 0 ? Math.min(1, left / limit) : 0;
}

/** Points lost when an order of `kind` runs out. */
export function expiredPenalty(kind: TicketKind): number {
  if (kind === 'bug') return BUG_EXPIRED_PENALTY;
  if (kind === 'incident') return INCIDENT_EXPIRED_PENALTY;
  return EXPIRED_PENALTY;
}

/** Ticks an order of `kind` lasts on this level. */
function timeLimit(state: GameState, kind: TicketKind, steps: readonly StepKind[]): number {
  const { orderSchedule, incidents } = state.settings;
  if (kind === 'bug') return orderSchedule.bugTimeLimitTicks;
  if (kind === 'incident') return incidents?.timeLimitTicks ?? orderSchedule.bugTimeLimitTicks;
  if (kind === 'fullstack') return Math.round(orderSchedule.timeLimitTicks * FULLSTACK_TIME_FACTOR);
  if (steps.includes('design'))
    return Math.round(orderSchedule.timeLimitTicks * DESIGNED_TIME_FACTOR);
  return orderSchedule.timeLimitTicks;
}

/** The open incident order, if production is on fire. */
export function openIncident(state: GameState): Order | undefined {
  return state.orders.find((o) => o.kind === 'incident');
}

/** Whether an open incident keeps `ticket` from shipping: only the hotfix ships then. */
export function shipBlockedBy(state: GameState, ticket: Ticket): boolean {
  return ticket.kind !== 'incident' && openIncident(state) !== undefined;
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
  const limit = timeLimit(state, kind, steps);
  const order: Order = {
    id: state.nextOrderId++,
    kind,
    steps: [...steps],
    createdTick: state.tick,
    expiresTick: state.tick + limit,
  };
  state.orders.push(order);
  if (kind === 'fullstack') {
    // It arrives as its two parts, to be coded apart and merged.
    for (const part of PART_KINDS) enqueueTicket(state, part, title);
  } else {
    enqueueTicket(state, kind, title, steps);
  }
  state.events.push({ type: 'orderCreated', order });
  return order;
}

/**
 * Ships the ticket `playerId` carries: completes the matching order with the
 * least time left, scores it and maybe sends a bug back later (more likely
 * when tests were skipped). A ticket whose order already expired still ships,
 * for no points. Refuses tickets missing a required step, and anything but
 * the hotfix while an incident is open. Returns whether it shipped.
 */
export function shipTicket(state: GameState, playerId: PlayerId, ticket: Ticket): boolean {
  // Half a full-stack feature can't ship: merge it with its other half first.
  if (!isShippable(ticket) || isPart(ticket)) return false;
  if (shipBlockedBy(state, ticket)) {
    state.events.push({ type: 'shipBlocked', playerId, ticketId: ticket.id });
    return false;
  }
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
    const penalty = Math.min(expiredPenalty(order.kind), state.score);
    state.score -= penalty;
    // Its waiting ticket leaves the queue too: for a full-stack feature a waiting merged
    // ticket (lost and back), or else both of its parts.
    const waitingOf = (kind: TicketKind) =>
      queuedTickets(state, QUEUE_OF[kind]).find((t) => t.kind === kind);
    const merged = order.kind === 'fullstack' ? waitingOf('fullstack') : undefined;
    const kinds = order.kind === 'fullstack' && !merged ? PART_KINDS : [order.kind];
    for (const kind of kinds) {
      const waiting = waitingOf(kind);
      if (waiting) state.tickets = state.tickets.filter((t) => t !== waiting);
    }
    state.events.push({ type: 'orderExpired', order, penalty });
  }
}

/**
 * Per tick: lands due bugs, opens an incident when one is due, and opens the
 * next feature order once it's due and there's room, unless an incident is open.
 */
export function updateOrders(state: GameState): void {
  const due = state.pendingBugs.filter((b) => state.tick >= b.tick);
  if (due.length > 0) {
    state.pendingBugs = state.pendingBugs.filter((b) => state.tick < b.tick);
    for (const bug of due) createOrder(state, 'bug', bug.title);
  }

  updateIncidents(state);
  // Production is down: nothing else ships and no new features open until the hotfix
  // ships (or the incident runs out).
  if (openIncident(state)) return;

  const { orderSchedule } = state.settings;
  const openFeatures = state.orders.filter(
    (o) => o.kind === 'feature' || o.kind === 'fullstack',
  ).length;
  if (state.tick >= state.nextOrderTick && openFeatures < orderSchedule.maxOpenOrders) {
    const [title, s1] = rng.pick(state.rngState, TICKET_TITLES);
    const [jitter, s2] = rng.int(s1, -orderSchedule.jitterTicks, orderSchedule.jitterTicks);
    state.rngState = s2;
    if (isFullstackNext(state)) createOrder(state, 'fullstack', title);
    else createOrder(state, 'feature', title, featureSteps(state));
    state.nextOrderTick = state.tick + orderSchedule.intervalTicks + jitter;
  }
}

/**
 * Opens an incident once it's due and none is open. Never with less than its
 * time limit left in the level: that would be a penalty nobody can avoid.
 */
function updateIncidents(state: GameState): void {
  const schedule = state.settings.incidents;
  if (!schedule || state.nextIncidentTick === null || state.tick < state.nextIncidentTick) return;
  if (openIncident(state)) return;
  if (state.settings.durationTicks - state.tick < schedule.timeLimitTicks) {
    state.nextIncidentTick = null;
    return;
  }
  const [title, s1] = rng.pick(state.rngState, INCIDENT_TITLES);
  const [jitter, s2] = rng.int(s1, -schedule.jitterTicks, schedule.jitterTicks);
  state.rngState = s2;
  createOrder(state, 'incident', title);
  state.nextIncidentTick = state.tick + schedule.intervalTicks + jitter;
}

/**
 * Steps for the next feature order: with a review for `reviewShare` of them,
 * else a design first for `designShare` of them.
 */
function featureSteps(state: GameState): readonly StepKind[] {
  // No roll at all without reviews or designs, so levels without them keep their order sequence.
  if (state.settings.reviewShare > 0 && roll(state) < state.settings.reviewShare) {
    return REVIEWED_FEATURE_STEPS;
  }
  const design = state.settings.designShare ?? 0;
  if (design > 0 && roll(state) < design) return DESIGNED_FEATURE_STEPS;
  return TICKET_STEPS.feature;
}

/** Whether the next feature order comes as a full-stack feature, in two parts. */
function isFullstackNext(state: GameState): boolean {
  const share = state.settings.fullstackShare ?? 0;
  return share > 0 && roll(state) < share;
}

/** A number from 0 to 1 off the level's RNG. */
function roll(state: GameState): number {
  const [value, s] = rng.next(state.rngState);
  state.rngState = s;
  return value;
}

/** Ends the level once its duration is up. */
export function updateLevelTimer(state: GameState): void {
  if (state.result || state.tick < state.settings.durationTicks) return;
  const result = {
    score: state.score,
    stars: starsFor(state.score, state.settings.starThresholds),
  };
  state.result = result;
  // Nobody pairs once the level is over.
  state.pairing = [];
  state.events.push({ type: 'levelEnded', result });
}
