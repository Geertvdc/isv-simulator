/**
 * Tickets: the items players carry around and work on, and the queues
 * (inbox and bug queue) they wait in.
 */

import type { Tile } from './level';
import type { GameState, PlayerId } from './state';

export type StepKind = 'code' | 'test' | 'pipeline';

/** Features are new work; bugs come back after shipping. */
export type TicketKind = 'feature' | 'bug';

/** The steps each kind of ticket needs, in the order they must be done. */
export const TICKET_STEPS: Readonly<Record<TicketKind, readonly StepKind[]>> = {
  feature: ['code', 'test', 'pipeline'],
  // Reproduce the bug first, then the usual cycle.
  bug: ['test', 'code', 'test', 'pipeline'],
};

/** Steps you may skip, at the price of a higher bug chance when shipping. */
export const OPTIONAL_STEPS: ReadonlySet<StepKind> = new Set(['test']);

/** The queue tile each kind of ticket waits on. */
export const QUEUE_TILE: Readonly<Record<TicketKind, Tile>> = {
  feature: 'inbox',
  bug: 'bugQueue',
};

export interface TicketStep {
  kind: StepKind;
  /** 0 to 1; 1 is done. */
  progress: number;
}

export type TicketLocation =
  | { kind: 'player'; playerId: PlayerId }
  | { kind: 'tile'; x: number; y: number }
  /** Waiting in the queue for its kind; oldest (lowest id) first. */
  | { kind: 'queue'; queue: TicketKind };

export interface Ticket {
  id: number;
  kind: TicketKind;
  /** Flavour only. */
  title: string;
  steps: TicketStep[];
  location: TicketLocation;
}

const PROGRESS_EPSILON = 1e-9;

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
 * stays skipped: you test in its phase or not at all.
 */
export function workableSteps(ticket: Ticket): TicketStep[] {
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
export function queueAt(tile: Tile | null): TicketKind | undefined {
  if (tile === QUEUE_TILE.feature) return 'feature';
  if (tile === QUEUE_TILE.bug) return 'bug';
  return undefined;
}

/** Tickets waiting in a queue, oldest first. */
export function queuedTickets(state: GameState, queue: TicketKind): Ticket[] {
  return state.tickets
    .filter((t) => t.location.kind === 'queue' && t.location.queue === queue)
    .sort((a, b) => a.id - b.id);
}

/** Puts a new ticket at the back of the queue for its kind. */
export function enqueueTicket(state: GameState, kind: TicketKind, title: string): Ticket {
  const ticket: Ticket = {
    id: state.nextTicketId++,
    kind,
    title,
    steps: TICKET_STEPS[kind].map((k) => ({ kind: k, progress: 0 })),
    location: { kind: 'queue', queue: kind },
  };
  state.tickets.push(ticket);
  return ticket;
}
