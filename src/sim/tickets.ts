/**
 * Tickets: the items players carry around and work on, and the queues
 * (inbox and bug queue) they wait in.
 */

import type { Tile } from './level';
import type { GameState, PlayerId, Vec } from './state';

/**
 * `design` is sketched at a whiteboard before coding; `merge` is done the
 * moment a front end and a back end come together at the merge station.
 */
export type StepKind = 'design' | 'code' | 'review' | 'test' | 'merge' | 'pipeline';

/**
 * Features are new work; bugs come back after shipping; incidents are
 * production on fire. A full-stack feature comes in as two parts, a
 * `frontend` and a `backend`, that become one `fullstack` ticket when merged.
 */
export type TicketKind = 'feature' | 'bug' | 'incident' | 'frontend' | 'backend' | 'fullstack';

/** The two parts of a full-stack feature, and the ticket they become. */
export const PART_KINDS: readonly TicketKind[] = ['frontend', 'backend'];

/** The queues tickets wait in: the inbox and the bug queue. */
export type QueueKind = 'feature' | 'bug';

/** The steps each kind of ticket needs, in the order they must be done. */
export const TICKET_STEPS: Readonly<Record<TicketKind, readonly StepKind[]>> = {
  feature: ['code', 'test', 'pipeline'],
  // Reproduce the bug first, then the usual cycle.
  bug: ['test', 'code', 'test', 'pipeline'],
  // A hotfix: no time to test, straight to production.
  incident: ['code', 'pipeline'],
  // Each part of a full-stack feature is coded on its own...
  frontend: ['code'],
  backend: ['code'],
  // ...then merged (both parts' code counts as the one `code` step), tested and built.
  fullstack: ['code', 'merge', 'test', 'pipeline'],
};

/** Steps of a feature order that starts with a design at the whiteboard. */
export const DESIGNED_FEATURE_STEPS: readonly StepKind[] = ['design', 'code', 'test', 'pipeline'];

/** Steps of a feature order that needs a code review: two people at the review station. */
export const REVIEWED_FEATURE_STEPS: readonly StepKind[] = ['code', 'review', 'test', 'pipeline'];

/** Steps you may skip, at the price of a higher bug chance when shipping. */
export const OPTIONAL_STEPS: ReadonlySet<StepKind> = new Set(['test']);

/** The tile each queue sits on. */
export const QUEUE_TILE: Readonly<Record<QueueKind, Tile>> = {
  feature: 'inbox',
  bug: 'bugQueue',
};

/** The queue each kind of ticket waits in: hotfixes land in the bug queue. */
export const QUEUE_OF: Readonly<Record<TicketKind, QueueKind>> = {
  feature: 'feature',
  bug: 'bug',
  incident: 'bug',
  frontend: 'feature',
  backend: 'feature',
  fullstack: 'feature',
};

/** Within a queue, lower goes first: incidents jump the line. */
const QUEUE_PRIORITY: Readonly<Record<TicketKind, number>> = {
  incident: 0,
  bug: 1,
  feature: 1,
  frontend: 1,
  backend: 1,
  fullstack: 1,
};

export interface TicketStep {
  kind: StepKind;
  /** 0 to 1; 1 is done. */
  progress: number;
}

export type TicketLocation =
  | { kind: 'player'; playerId: PlayerId }
  | { kind: 'tile'; x: number; y: number }
  /** Waiting in a queue; incidents first, then oldest (lowest id) first. */
  | { kind: 'queue'; queue: QueueKind }
  /**
   * Thrown: flying from `from` along `dir` (unit), now at `pos`. `lastFloor`
   * is the last floor tile it passed, where it drops if it hits a wall.
   */
  | {
      kind: 'flying';
      pos: Vec;
      from: Vec;
      dir: Vec;
      thrownBy: PlayerId;
      lastFloor: { x: number; y: number };
    };

export interface Ticket {
  id: number;
  kind: TicketKind;
  /** Flavour only. */
  title: string;
  steps: TicketStep[];
  location: TicketLocation;
  /** The order this ticket is for: it can only complete that one. */
  orderId: number;
  /**
   * Its order ran out: nothing can be done with it any more but carrying,
   * throwing and binning it.
   */
  expired: boolean;
}

const PROGRESS_EPSILON = 1e-9;

/** The ticket on a counter or station, or the first one lying on a floor tile. */
export function ticketOnTile(state: GameState, x: number, y: number): Ticket | undefined {
  return state.tickets.find(
    (t) => t.location.kind === 'tile' && t.location.x === x && t.location.y === y,
  );
}

export function ticketCarriedBy(state: GameState, playerId: PlayerId): Ticket | undefined {
  return state.tickets.find(
    (t) => t.location.kind === 'player' && t.location.playerId === playerId,
  );
}

/** The step to do next: the first unfinished one, or `undefined` when the ticket is done. */
export function currentStep(ticket: Ticket): TicketStep | undefined {
  return ticket.steps.find((s) => s.progress < 1);
}

export function isFinished(ticket: Ticket): boolean {
  return currentStep(ticket) === undefined;
}

/**
 * Steps that can be worked on now: from the step last worked on, the
 * unfinished steps up to and including the first unfinished required one.
 * Optional steps (tests) can be skipped, but once work moves past a test it
 * stays skipped: you test in its phase or not at all. Nothing is workable on
 * an expired ticket.
 */
export function workableSteps(ticket: Pick<Ticket, 'steps' | 'expired'>): TicketStep[] {
  if (ticket.expired) return [];
  let lastWorked = 0;
  ticket.steps.forEach((s, i) => {
    if (s.progress > 0) lastWorked = i;
  });
  const result: TicketStep[] = [];
  for (const step of ticket.steps.slice(lastWorked)) {
    if (step.progress >= 1) continue;
    result.push(step);
    if (!OPTIONAL_STEPS.has(step.kind)) break;
  }
  return result;
}

/** The step of `kind` a station can work on now, if any. */
export function workableStep(ticket: Ticket, kind: StepKind): TicketStep | undefined {
  return workableSteps(ticket).find((s) => s.kind === kind);
}

/** Every required step is done; optional ones may have been skipped. */
export function isShippable(ticket: Ticket): boolean {
  return ticket.steps.every((s) => s.progress >= 1 || OPTIONAL_STEPS.has(s.kind));
}

/** Share of the ticket's optional steps (tests) left unfinished: 0 when fully tested. */
export function skippedShare(ticket: Ticket): number {
  const optional = ticket.steps.filter((s) => OPTIONAL_STEPS.has(s.kind));
  if (optional.length === 0) return 0;
  return optional.filter((s) => s.progress < 1).length / optional.length;
}

/** Adds `amount` progress to a step, snapping float error so N equal parts always finish it. */
export function advanceStep(step: TicketStep, amount: number): void {
  const progress = step.progress + amount;
  step.progress = progress >= 1 - PROGRESS_EPSILON ? 1 : progress;
}

/** Which queue a tile takes tickets from, if it's a queue tile. */
export function queueAt(tile: Tile | null): QueueKind | undefined {
  if (tile === QUEUE_TILE.feature) return 'feature';
  if (tile === QUEUE_TILE.bug) return 'bug';
  return undefined;
}

/** Tickets waiting in a queue, the one handed out next first: incidents, then oldest. */
export function queuedTickets(state: GameState, queue: QueueKind): Ticket[] {
  return state.tickets
    .filter((t) => t.location.kind === 'queue' && t.location.queue === queue)
    .sort((a, b) => QUEUE_PRIORITY[a.kind] - QUEUE_PRIORITY[b.kind] || a.id - b.id);
}

/** Puts a new ticket for order `orderId` in the queue for its kind; `steps` default to its kind's. */
export function enqueueTicket(
  state: GameState,
  kind: TicketKind,
  title: string,
  orderId: number,
  steps: readonly StepKind[] = TICKET_STEPS[kind],
): Ticket {
  const ticket: Ticket = {
    id: state.nextTicketId++,
    kind,
    title,
    steps: steps.map((k) => ({ kind: k, progress: 0 })),
    location: { kind: 'queue', queue: QUEUE_OF[kind] },
    orderId,
    expired: false,
  };
  state.tickets.push(ticket);
  return ticket;
}

/**
 * A ticket that fell into a gap or off the edge: back in its queue, every
 * step undone ("git reset --hard"), except a merge. Its order can still be met.
 * An expired ticket is simply gone: nobody needs it back.
 */
export function loseTicket(state: GameState, ticket: Ticket, at: { x: number; y: number }): void {
  if (ticket.expired) {
    state.tickets = state.tickets.filter((t) => t !== ticket);
    state.events.push({ type: 'ticketLost', ticketId: ticket.id, x: at.x, y: at.y, queue: null });
    return;
  }
  // A merged ticket keeps its merge (its parts are gone): only the work since is lost.
  const merged = ticket.steps.findIndex((s) => s.kind === 'merge');
  ticket.steps.forEach((step, i) => {
    if (i > merged) step.progress = 0;
  });
  const queue = QUEUE_OF[ticket.kind];
  ticket.location = { kind: 'queue', queue };
  state.events.push({ type: 'ticketLost', ticketId: ticket.id, x: at.x, y: at.y, queue });
}

/** Whether `ticket` is one part of a full-stack feature (it can't ship on its own). */
export function isPart(ticket: Pick<Ticket, 'kind'>): boolean {
  return PART_KINDS.includes(ticket.kind);
}

/**
 * Whether two tickets are the two halves of a full-stack feature, both coded,
 * ready to merge (and neither has expired).
 */
export function canMerge(a: Ticket, b: Ticket): boolean {
  return (
    isPart(a) &&
    isPart(b) &&
    a.kind !== b.kind &&
    isFinished(a) &&
    isFinished(b) &&
    !a.expired &&
    !b.expired
  );
}

/**
 * Merges two parts into one full-stack ticket on tile (x, y): the code and
 * the merge done, test and pipeline to go. Takes the front end's title and
 * its order.
 */
export function mergeParts(state: GameState, a: Ticket, b: Ticket, x: number, y: number): Ticket {
  const front = a.kind === 'frontend' ? a : b;
  state.tickets = state.tickets.filter((t) => t !== a && t !== b);
  const merged: Ticket = {
    id: state.nextTicketId++,
    kind: 'fullstack',
    title: front.title,
    steps: TICKET_STEPS.fullstack.map((kind) => ({
      kind,
      progress: kind === 'code' || kind === 'merge' ? 1 : 0,
    })),
    location: { kind: 'tile', x, y },
    orderId: front.orderId,
    expired: false,
  };
  state.tickets.push(merged);
  state.events.push({ type: 'merged', ticketId: merged.id, parts: [a.id, b.id], x, y });
  return merged;
}
