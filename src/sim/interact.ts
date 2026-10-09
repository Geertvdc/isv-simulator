/**
 * Interact (pick up, put down, bin, ship) and stations at work: players
 * working the keyboard and test bench, and the pipeline building on its own.
 */

import { PIPELINE_BUILD_TICKS, WORK_RATE } from './balance';
import { type Tile, getTile } from './level';
import { shipTicket } from './orders';
import { type GameState, type PlayerId, targetTile } from './state';
import {
  type StepKind,
  type Ticket,
  advanceStep,
  currentStep,
  queueAt,
  queuedTickets,
  ticketCarriedBy,
  ticketOnTile,
} from './tickets';

/** Tiles players can take a ticket from (queue tiles aside). */
const PICK_UP_FROM: ReadonlySet<Tile> = new Set(['counter', 'keyboard', 'testBench', 'pipeline']);
/** Tiles players can put any ticket on. */
const PUT_DOWN_ON: ReadonlySet<Tile> = new Set(['counter', 'keyboard', 'testBench']);

/** The step each station advances. */
const STATION_STEP: Partial<Record<Tile, StepKind>> = {
  keyboard: 'code',
  testBench: 'test',
  pipeline: 'pipeline',
};
/** Stations that need a player holding work; the rest run on their own. */
const WORKED_BY_HAND: ReadonlySet<Tile> = new Set(['keyboard', 'testBench']);

/** The step a station advances, or `undefined` for tiles that aren't stations. */
export function stationStep(tile: Tile | null): StepKind | undefined {
  return tile === null ? undefined : STATION_STEP[tile];
}

/** Whether a ticket sitting on a station is ready for that station's step. */
export function isAtItsStation(ticket: Ticket, tile: Tile | null): boolean {
  const kind = stationStep(tile);
  return kind !== undefined && currentStep(ticket)?.kind === kind;
}

/** A pipeline holds on to its ticket until the build is done. */
function isBuilding(ticket: Ticket, tile: Tile): boolean {
  return tile === 'pipeline' && isAtItsStation(ticket, tile);
}

/**
 * One interact press by `playerId` on the tile they face. Returns whether
 * anything happened.
 */
export function interact(state: GameState, playerId: PlayerId): boolean {
  const { x, y } = targetTile(state, playerId);
  const tile = getTile(state.level, x, y);
  if (tile === null) return false;
  const carried = ticketCarriedBy(state, playerId);
  const onTile = ticketOnTile(state, x, y);

  if (carried) {
    if (tile === 'bin') {
      state.tickets = state.tickets.filter((t) => t !== carried);
      return true;
    }
    if (tile === 'ship') return shipTicket(state, playerId, carried);
    const fits = PUT_DOWN_ON.has(tile) || (tile === 'pipeline' && isAtItsStation(carried, tile));
    if (fits && !onTile) {
      carried.location = { kind: 'tile', x, y };
      return true;
    }
    return false;
  }

  const queue = queueAt(tile);
  if (queue) {
    const oldest = queuedTickets(state, queue)[0];
    if (!oldest) return false;
    oldest.location = { kind: 'player', playerId };
    return true;
  }
  if (onTile && PICK_UP_FROM.has(tile) && !isBuilding(onTile, tile)) {
    onTile.location = { kind: 'player', playerId };
    return true;
  }
  return false;
}

/**
 * Work held by `playerId` this tick. `worked` collects the tiles already
 * worked this tick (as `y * width + x`) so two players at one station don't
 * stack. Only the ticket's current step can be worked. Returns whether any
 * progress was made.
 */
export function work(state: GameState, playerId: PlayerId, worked: Set<number>): boolean {
  const { x, y } = targetTile(state, playerId);
  const tile = getTile(state.level, x, y);
  if (tile === null || !WORKED_BY_HAND.has(tile)) return false;
  const key = y * state.level.width + x;
  if (worked.has(key)) return false;

  const ticket = ticketOnTile(state, x, y);
  if (!ticket || !isAtItsStation(ticket, tile)) return false;
  const step = currentStep(ticket);
  if (!step) return false;
  advanceStep(step, WORK_RATE);
  worked.add(key);
  return true;
}

/** Every ticket on a pipeline builds a little each tick, nobody needed. */
export function updatePipelines(state: GameState): void {
  for (const ticket of state.tickets) {
    if (ticket.location.kind !== 'tile') continue;
    const tile = getTile(state.level, ticket.location.x, ticket.location.y);
    if (tile !== 'pipeline' || !isAtItsStation(ticket, tile)) continue;
    const step = currentStep(ticket);
    if (step) advanceStep(step, 1 / PIPELINE_BUILD_TICKS);
  }
}
