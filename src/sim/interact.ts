/**
 * Interact (pick up, put down, bin, ship) and stations at work: players
 * working the keyboard and test bench, and repairing broken pipelines.
 */

import { REVIEWERS_NEEDED, REVIEW_RATE, WORK_RATE } from './balance';
import { type Tile, getTile } from './level';
import { shipTicket } from './orders';
import { isBroken, isBuilding, repairPipeline } from './pipeline';
import { type GameState, type PlayerId, getPlayer, targetTile } from './state';
import {
  type StepKind,
  type Ticket,
  type TicketStep,
  advanceStep,
  queueAt,
  queuedTickets,
  ticketCarriedBy,
  ticketOnTile,
  workableStep,
} from './tickets';

/** Tiles players can take a ticket from (queue tiles aside). */
const PICK_UP_FROM: ReadonlySet<Tile> = new Set([
  'counter',
  'keyboard',
  'testBench',
  'pipeline',
  'review',
  'floor',
]);
/** Tiles players can put any ticket on. */
const PUT_DOWN_ON: ReadonlySet<Tile> = new Set(['counter', 'keyboard', 'testBench', 'review']);

/** The step each station advances. */
const STATION_STEP: Partial<Record<Tile, StepKind>> = {
  keyboard: 'code',
  review: 'review',
  testBench: 'test',
  pipeline: 'pipeline',
};
/** Stations that need a player holding work; the rest run on their own. */
const WORKED_BY_HAND: ReadonlySet<Tile> = new Set(['keyboard', 'testBench']);

/** The step a station advances, or `undefined` for tiles that aren't stations. */
export function stationStep(tile: Tile | null): StepKind | undefined {
  return tile === null ? undefined : STATION_STEP[tile];
}

/** The step of `ticket` that the station on `tile` can work on now, if any. */
export function stationWorkStep(ticket: Ticket, tile: Tile | null): TicketStep | undefined {
  const kind = stationStep(tile);
  return kind === undefined ? undefined : workableStep(ticket, kind);
}

/** Whether a ticket sitting on a station is ready for that station's step. */
export function isAtItsStation(ticket: Ticket, tile: Tile | null): boolean {
  return stationWorkStep(ticket, tile) !== undefined;
}

/**
 * Whether `ticket` may be put on tile (x, y): a free counter or station, or
 * a free working pipeline it's ready for. Thrown tickets land by the same rule.
 */
export function canPutDown(state: GameState, ticket: Ticket, x: number, y: number): boolean {
  const tile = getTile(state.level, x, y);
  if (tile === null || ticketOnTile(state, x, y)) return false;
  return (
    PUT_DOWN_ON.has(tile) ||
    (tile === 'pipeline' && isAtItsStation(ticket, tile) && !isBroken(state, { x, y }))
  );
}

/**
 * One interact press by `playerId` on the tile they face. Returns whether
 * anything happened. Empty hands also pick up a ticket lying on the floor
 * underfoot.
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
    if (canPutDown(state, carried, x, y)) {
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
  if (onTile && PICK_UP_FROM.has(tile) && !isBuilding(state, onTile)) {
    onTile.location = { kind: 'player', playerId };
    return true;
  }
  const underfoot = ticketOnTile(state, ...standingTile(state, playerId));
  if (underfoot) {
    underfoot.location = { kind: 'player', playerId };
    return true;
  }
  return false;
}

function standingTile(state: GameState, playerId: PlayerId): [number, number] {
  const p = getPlayer(state, playerId);
  return p ? [Math.round(p.pos.x), Math.round(p.pos.y)] : [-1, -1];
}

/** Who worked where during one tick. Tiles are keyed as `y * width + x`. */
export interface TickWork {
  /** Tiles already worked this tick, so two players at one station don't stack. */
  worked: Set<number>;
  /** Players holding work at each review station with a ticket to review. */
  reviewers: Map<number, PlayerId[]>;
}

export function newTickWork(): TickWork {
  return { worked: new Set(), reviewers: new Map() };
}

/**
 * Work held by `playerId` this tick. Only a step that's workable now (see
 * `workableSteps`) advances; at a broken pipeline, work repairs it. At a
 * review station work only signs the player up: `finishReviews` advances
 * reviews with enough players. Returns whether this player did any work.
 */
export function work(state: GameState, playerId: PlayerId, tickWork: TickWork): boolean {
  const { x, y } = targetTile(state, playerId);
  const tile = getTile(state.level, x, y);
  const key = y * state.level.width + x;
  const { worked, reviewers } = tickWork;
  if (tile === 'review') {
    const ticket = ticketOnTile(state, x, y);
    if (!ticket || !stationWorkStep(ticket, tile)) return false;
    reviewers.set(key, [...(reviewers.get(key) ?? []), playerId]);
    return true;
  }
  if (worked.has(key)) return false;
  if (tile === 'pipeline') {
    if (!repairPipeline(state, x, y)) return false;
    worked.add(key);
    return true;
  }
  if (tile === null || !WORKED_BY_HAND.has(tile)) return false;

  const ticket = ticketOnTile(state, x, y);
  const step = ticket && stationWorkStep(ticket, tile);
  if (!step) return false;
  advanceStep(step, WORK_RATE);
  worked.add(key);
  return true;
}

/** Advances every review that `REVIEWERS_NEEDED` players worked on this tick; more don't speed it up. */
export function finishReviews(state: GameState, tickWork: TickWork): void {
  const { width } = state.level;
  for (const [key, players] of tickWork.reviewers) {
    if (players.length < REVIEWERS_NEEDED) continue;
    const x = key % width;
    const y = Math.floor(key / width);
    const ticket = ticketOnTile(state, x, y);
    const step = ticket && stationWorkStep(ticket, 'review');
    if (step) advanceStep(step, REVIEW_RATE);
  }
}
