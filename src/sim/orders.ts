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
import type { TicketDomain } from './roles';
import {
  DESIGNED_FEATURE_STEPS,
  PART_KINDS,
  REVIEWED_FEATURE_STEPS,
  type StepKind,
  TICKET_STEPS,
  type QueueKind,
  type Ticket,
  type TicketKind,
  enqueueTicket,
  isPart,
  isShippable,
  skippedShare,
} from './tickets';

export interface Order {
  id: number;
  kind: TicketKind;
  domain: TicketDomain;
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
  domain: TicketDomain;
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
      order: Order;
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
  /**
   * A ticket came down in a gap or off the edge: it's back in its queue, its
   * work lost. An expired one is gone for good (`queue` is `null`).
   */
  | { type: 'ticketLost'; ticketId: number; x: number; y: number; queue: QueueKind | null }
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

/** The open order `ticket` is for, if it's still open. */
export function orderOf(state: GameState, ticket: Ticket): Order | undefined {
  return state.orders.find((o) => o.id === ticket.orderId);
}

/** Opens an order and puts its ticket in the queue for its kind; `steps` default to its kind's. */
export function createOrder(
  state: GameState,
  kind: TicketKind,
  title: string,
  steps: readonly StepKind[] = TICKET_STEPS[kind],
  domain?: TicketDomain,
): Order {
  const orderDomain = kind === 'fullstack' ? 'mixed' : (domain ?? defaultOrderDomain(kind));
  const limit = timeLimit(state, kind, steps);
  const order: Order = {
    id: state.nextOrderId++,
    kind,
    domain: orderDomain,
    steps: [...steps],
    createdTick: state.tick,
    expiresTick: state.tick + limit,
  };
  state.orders.push(order);
  if (kind === 'fullstack') {
    // It arrives as its two parts, to be coded apart and merged.
    for (const part of PART_KINDS) {
      enqueueTicket(state, part, title, order.id, TICKET_STEPS[part], part);
    }
  } else {
    enqueueTicket(state, kind, title, order.id, steps, orderDomain);
  }
  state.events.push({ type: 'orderCreated', order });
  return order;
}

function defaultOrderDomain(kind: TicketKind): TicketDomain {
  if (kind === 'frontend') return 'frontend';
  if (kind === 'backend') return 'backend';
  return 'general';
}

/**
 * Ships the ticket `playerId` carries: completes its own order, scores it
 * and maybe sends a bug back later (more likely when tests were skipped).
 * Refuses tickets missing a required step, expired tickets (their order ran
 * out: bin them), and anything but the hotfix while an incident is open.
 * Returns whether it shipped.
 */
export function shipTicket(state: GameState, playerId: PlayerId, ticket: Ticket): boolean {
  // Half a full-stack feature can't ship: merge it with its other half first.
  if (!isShippable(ticket) || isPart(ticket) || ticket.expired) return false;
  const order = orderOf(state, ticket);
  if (!order) return false;
  if (shipBlockedBy(state, ticket)) {
    state.events.push({ type: 'shipBlocked', playerId, ticketId: ticket.id });
    return false;
  }

  const points = shipPoints(order, state.tick);
  state.tickets = state.tickets.filter((t) => t !== ticket);
  state.orders = state.orders.filter((o) => o !== order);
  state.score += points;
  const untested = skippedShare(ticket) > 0;
  state.events.push({ type: 'orderShipped', order, points, playerId, untested });

  const [roll, s] = rng.next(state.rngState);
  state.rngState = s;
  if (roll < bugChance(ticket)) {
    state.pendingBugs.push({
      tick: state.tick + BUG_DELAY_TICKS,
      title: bugTitle(ticket.title),
      domain: ticket.domain,
    });
  }
  return true;
}

/**
 * Expires orders whose timer ran out: the penalty, their tickets still
 * waiting in a queue leave it, and every other ticket of theirs (carried, on
 * a tile, flying) turns expired, fit only for the bin. Runs after the tick
 * counter moves on, so an order is gone as soon as it has no time left.
 */
export function expireOrders(state: GameState): void {
  for (const order of state.orders.filter((o) => state.tick >= o.expiresTick)) {
    state.orders = state.orders.filter((o) => o !== order);
    const penalty = Math.min(expiredPenalty(order.kind), state.score);
    state.score -= penalty;
    state.tickets = state.tickets.filter(
      (t) => t.orderId !== order.id || t.location.kind !== 'queue',
    );
    for (const ticket of state.tickets) {
      if (ticket.orderId === order.id) ticket.expired = true;
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
    for (const bug of due) createOrder(state, 'bug', bug.title, TICKET_STEPS.bug, bug.domain);
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
    else createOrder(state, 'feature', title, featureSteps(state), nextDomain(state));
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
  createOrder(state, 'incident', title, TICKET_STEPS.incident, schedule.domain ?? 'general');
  state.nextIncidentTick = state.tick + schedule.intervalTicks + jitter;
}

/** Chooses one domain from a seeded, exact-count batch; classic levels use no extra RNG. */
function nextDomain(state: GameState): TicketDomain {
  const schedule = state.settings.domainSchedule;
  if (!schedule) return 'general';
  if (state.domainBatchIndex >= state.domainBatch.length) buildDomainBatch(state, schedule);
  const domain = state.domainBatch[state.domainBatchIndex];
  if (!domain) throw new Error('Domain schedule produced an empty batch');
  state.domainBatchIndex++;
  for (const [candidate, count] of Object.entries(schedule.counts) as [TicketDomain, number][]) {
    if (count === 0) continue;
    state.domainDrought[candidate] = domain === candidate ? 0 : state.domainDrought[candidate] + 1;
    if (state.domainDrought[candidate] > schedule.maxDrought) {
      throw new Error(`Domain schedule exceeded the ${candidate} drought limit`);
    }
  }
  return domain;
}

function buildDomainBatch(
  state: GameState,
  schedule: NonNullable<GameState['settings']['domainSchedule']>,
): void {
  const entries = Object.entries(schedule.counts) as [TicketDomain, number][];
  if (
    !Number.isInteger(schedule.maxDrought) ||
    schedule.maxDrought < 0 ||
    entries.some(([, count]) => !Number.isInteger(count) || count < 0) ||
    !entries.some(([, count]) => count > 0)
  ) {
    throw new Error('Domain schedule needs non-negative integer counts and a positive batch size');
  }
  const counts = new Map(entries.filter(([, count]) => count > 0));
  for (let attempt = 0; attempt < 128; attempt++) {
    const batch = [...counts].flatMap(([domain, count]) => Array<TicketDomain>(count).fill(domain));
    for (let i = batch.length - 1; i > 0; i--) {
      const [index, nextState] = rng.int(state.rngState, 0, i);
      state.rngState = nextState;
      [batch[i], batch[index]] = [batch[index] as TicketDomain, batch[i] as TicketDomain];
    }
    const drought = { ...state.domainDrought };
    let valid = true;
    for (const domain of batch) {
      for (const [candidate] of counts) {
        drought[candidate] = domain === candidate ? 0 : drought[candidate] + 1;
        if (drought[candidate] > schedule.maxDrought) valid = false;
      }
    }
    if (!valid) continue;
    state.domainBatch = batch;
    state.domainBatchIndex = 0;
    return;
  }
  throw new Error('Domain counts cannot satisfy the configured maximum drought');
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
