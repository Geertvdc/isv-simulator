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
import { ticketOnTile } from './tickets';

/** The state of one belt tile: how long the ticket on it has been riding this tile. */
export interface Belt {
  x: number;
  y: number;
  /** Ticks the ticket on this belt has been on it; 0 when empty. */
  ticks: number;
}

/** One belt state per conveyor tile, all empty. */
export function createBelts(map: LevelMap): Belt[] {
  return map.conveyors.map((c) => ({ x: c.x, y: c.y, ticks: 0 }));
}

/**
 * One tick of every belt. Tickets that have ridden a tile long enough move
 * on, front of a line first, so a full belt moves as one; each ticket moves
 * at most one tile a tick. Deterministic: belts go in map order.
 */
export function updateConveyors(state: GameState): void {
  const { level } = state;
  for (const belt of state.belts) {
    belt.ticks = ticketOnTile(state, belt.x, belt.y) ? Math.min(belt.ticks + 1, CONVEYOR_TICKS) : 0;
  }
  const moved = new Set<number>();
  // Keep passing over the belts while something moves: a ticket only frees its tile
  // for the one behind it once it has gone, wherever the two sit in map order.
  for (let changed = true; changed;) {
    changed = false;
    for (const belt of state.belts) {
      if (belt.ticks < CONVEYOR_TICKS) continue;
      const ticket = ticketOnTile(state, belt.x, belt.y);
      const conveyor = conveyorAt(level, belt.x, belt.y);
      if (!ticket || !conveyor || moved.has(ticket.id)) continue;
      const x = belt.x + conveyor.dir.x;
      const y = belt.y + conveyor.dir.y;
      const next = getTile(level, x, y);
      if (next === null || next === 'floor' || !canPutDown(state, ticket, x, y)) continue;
      ticket.location = { kind: 'tile', x, y };
      belt.ticks = 0;
      const nextBelt = state.belts.find((b) => b.x === x && b.y === y);
      if (nextBelt) nextBelt.ticks = 0;
      moved.add(ticket.id);
      state.events.push({ type: 'conveyed', ticketId: ticket.id, x, y });
      changed = true;
    }
  }
}

/** How far along its tile the ticket on belt (x, y) is, 0 to 1 (for drawing it gliding). */
export function beltProgress(state: GameState, x: number, y: number): number {
  const belt = state.belts.find((b) => b.x === x && b.y === y);
  return belt ? belt.ticks / CONVEYOR_TICKS : 0;
}
