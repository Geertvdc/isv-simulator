/**
 * Tickets: the items players carry around and work on, and the inbox that
 * spawns them.
 */

import { INBOX_MAX_TICKETS, INBOX_SPAWN_JITTER_TICKS, INBOX_SPAWN_TICKS } from './balance';
import { TICKET_TITLES } from './content';
import { type GridPoint, getTile } from './level';
import * as rng from './rng';
import type { GameState, PlayerId } from './state';

export type StepKind = 'code' | 'test' | 'pipeline';

/** Every ticket needs these steps, in this order. */
export const STEP_ORDER: readonly StepKind[] = ['code', 'test', 'pipeline'];

export interface TicketStep {
  kind: StepKind;
  /** 0 to 1; 1 is done. */
  progress: number;
}

export type TicketLocation =
  { kind: 'player'; playerId: PlayerId } | { kind: 'tile'; x: number; y: number };

export interface Ticket {
  id: number;
  /** Flavour only. */
  title: string;
  steps: TicketStep[];
  location: TicketLocation;
}

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

export function getStep(ticket: Ticket, kind: StepKind): TicketStep | undefined {
  return ticket.steps.find((s) => s.kind === kind);
}

export function isStepDone(ticket: Ticket, kind: StepKind): boolean {
  return (getStep(ticket, kind)?.progress ?? 0) >= 1;
}

/** All inbox tiles, row by row. */
export function inboxTiles(state: GameState): GridPoint[] {
  const { level } = state;
  const result: GridPoint[] = [];
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      if (getTile(level, x, y) === 'inbox') result.push({ x, y });
    }
  }
  return result;
}

/**
 * Once the spawn timer is due, puts a new ticket on a random free inbox tile
 * and restarts the timer with seeded jitter. When the inbox already holds
 * `INBOX_MAX_TICKETS` or has no free tile, this spawn is skipped and the
 * timer restarts all the same.
 */
export function updateInbox(state: GameState): void {
  if (state.tick < state.nextInboxSpawnTick) return;

  const tiles = inboxTiles(state);
  const free = tiles.filter((t) => !ticketOnTile(state, t.x, t.y));
  const waiting = tiles.length - free.length;
  if (free.length > 0 && waiting < INBOX_MAX_TICKETS) {
    const [tile, s1] = rng.pick(state.rngState, free);
    const [title, s2] = rng.pick(s1, TICKET_TITLES);
    state.rngState = s2;
    state.tickets.push({
      id: state.nextTicketId++,
      title,
      steps: STEP_ORDER.map((kind) => ({ kind, progress: 0 })),
      location: { kind: 'tile', x: tile.x, y: tile.y },
    });
  }

  const [jitter, s3] = rng.int(state.rngState, -INBOX_SPAWN_JITTER_TICKS, INBOX_SPAWN_JITTER_TICKS);
  state.rngState = s3;
  state.nextInboxSpawnTick = state.tick + INBOX_SPAWN_TICKS + jitter;
}
