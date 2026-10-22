/**
 * Conveyor belts (the "message queue"): a ticket put on a belt moves one
 * tile every `CONVEYOR_TICKS` along the belt's direction, onto the next belt,
 * counter or station if that would take it, and waits on the belt when not.
 * A ticket at the end of a belt that points at nothing useful just waits.
 */

import { CONVEYOR_TICKS } from './balance';
import { canPutDown } from './interact';
import { type LevelMap, conveyorAt, getTile } from './level';
import type { GameState } from './state';
import { type Ticket, ticketOnTile } from './tickets';

/** The state of one belt tile: the ticket riding it and how long it has been on this tile. */
export interface Belt {
  x: number;
  y: number;
  /** The ticket on this belt when `ticks` last counted, so a new one starts from 0. */
  ticketId: number | null;
  /**
   * Ticks that ticket has been on this tile; from `CONVEYOR_TICKS` on it's
   * ready to move and keeps counting while it waits, so where belts merge
   * the one that has waited longest goes first.
   */
  ticks: number;
}

/** One belt state per conveyor tile, all empty. */
export function createBelts(map: LevelMap): Belt[] {
  return map.conveyors.map((c) => ({ x: c.x, y: c.y, ticketId: null, ticks: 0 }));
}

/**
 * One tick of every belt. Tickets that have ridden a tile long enough move
 * on, each at most one tile a tick: the front of a line first, so a full
 * belt moves as one; where belts merge, the ticket that has waited longest;
 * and a loop that is full turns all at once. Deterministic: ties go in map order.
 */
export function updateConveyors(state: GameState): void {
  for (const belt of state.belts) {
    const ticket = ticketOnTile(state, belt.x, belt.y);
    // A ticket new on this tile counts its first tick here.
    if (!ticket) belt.ticks = 0;
    else belt.ticks = ticket.id === belt.ticketId ? belt.ticks + 1 : 1;
    belt.ticketId = ticket?.id ?? null;
  }
  // Longest waiting first; a stable sort keeps map order among equals.
  const order = [...state.belts].sort((a, b) => b.ticks - a.ticks);
  const moved = new Set<number>();
  // Move one ticket at a time, always the longest-waiting one that can go, starting
  // over after each move: a tile freed by the one ahead goes to whoever waited longest.
  for (let next = nextMove(state, order, moved); next; next = nextMove(state, order, moved)) {
    move(state, next.ticket, next.x, next.y, moved);
  }
  turnFullLoops(state, moved);
}

/** The first ready ticket in `order` that can move on now, and where to. */
function nextMove(
  state: GameState,
  order: readonly Belt[],
  moved: ReadonlySet<number>,
): { ticket: Ticket; x: number; y: number } | null {
  for (const belt of order) {
    if (belt.ticks < CONVEYOR_TICKS) continue;
    const ticket = ticketOnTile(state, belt.x, belt.y);
    const conveyor = conveyorAt(state.level, belt.x, belt.y);
    if (!ticket || !conveyor || moved.has(ticket.id)) continue;
    const x = belt.x + conveyor.dir.x;
    const y = belt.y + conveyor.dir.y;
    if (getTile(state.level, x, y) === 'floor' || !canPutDown(state, ticket, x, y)) continue;
    return { ticket, x, y };
  }
  return null;
}

/** Moves `ticket` one tile on to (x, y), resetting the timers of the belts it leaves and enters. */
function move(state: GameState, ticket: Ticket, x: number, y: number, moved: Set<number>): void {
  ticket.location = { kind: 'tile', x, y };
  moved.add(ticket.id);
  state.events.push({ type: 'conveyed', ticketId: ticket.id, x, y });
}

/**
 * A loop of belts where every tile holds a ready ticket can't move one at a
 * time (each waits for the next): turn it all at once, like a sushi belt.
 */
function turnFullLoops(state: GameState, moved: Set<number>): void {
  const { level } = state;
  const turned = new Set<Belt>();
  for (const start of state.belts) {
    if (turned.has(start)) continue;
    const loop: { ticket: Ticket; to: { x: number; y: number } }[] = [];
    const seen = new Set<Belt>();
    let belt: Belt | undefined = start;
    while (belt && !seen.has(belt)) {
      seen.add(belt);
      const ticket = ticketOnTile(state, belt.x, belt.y);
      const conveyor = conveyorAt(level, belt.x, belt.y);
      if (!ticket || !conveyor || belt.ticks < CONVEYOR_TICKS || moved.has(ticket.id)) break;
      const to: { x: number; y: number } = {
        x: belt.x + conveyor.dir.x,
        y: belt.y + conveyor.dir.y,
      };
      loop.push({ ticket, to });
      belt = state.belts.find((b) => b.x === to.x && b.y === to.y);
    }
    // A loop only when the walk came back round to where it started.
    if (belt !== start || loop.length < 2) continue;
    for (const b of seen) turned.add(b);
    for (const { ticket, to } of loop) move(state, ticket, to.x, to.y, moved);
  }
}

/** How far along its tile the ticket on belt (x, y) is, 0 to 1 (for drawing it gliding). */
export function beltProgress(state: GameState, x: number, y: number): number {
  const belt = state.belts.find((b) => b.x === x && b.y === y);
  return belt ? Math.min(1, belt.ticks / CONVEYOR_TICKS) : 0;
}
