/**
 * Interact (pick up, put down, bin, ship) and stations at work: players
 * working the keyboard and test bench, and repairing broken pipelines.
 */

import { DESIGN_RATE, PAIR_RATE, REVIEWERS_NEEDED, REVIEW_RATE, WORK_RATE } from './balance';
import { type Tile, getTile } from './level';
import { shipTicket } from './orders';
import { isBroken, isBuilding, repairPipeline } from './pipeline';
import { type GameState, type PlayerId, getPlayer, targetTile } from './state';
import {
  type StepKind,
  type Ticket,
  type TicketStep,
  advanceStep,
  canMerge,
  isFinished,
  isPart,
  mergeParts,
  queueAt,
  queuedTickets,
  ticketCarriedBy,
  ticketOnTile,
  workableStep,
} from './tickets';

/** Tiles players can take a ticket from (queue tiles aside). */
const PICK_UP_FROM: ReadonlySet<Tile> = new Set([
  'counter',
  'conveyor',
  'whiteboard',
  'merge',
  'keyboard',
  'testBench',
  'pipeline',
  'review',
  'floor',
]);
/** Tiles players can put any ticket on. */
const PUT_DOWN_ON: ReadonlySet<Tile> = new Set([
  'counter',
  'conveyor',
  'whiteboard',
  'keyboard',
  'testBench',
  'review',
]);

/** The step each station advances. */
const STATION_STEP: Partial<Record<Tile, StepKind>> = {
  whiteboard: 'design',
  keyboard: 'code',
  review: 'review',
  testBench: 'test',
  pipeline: 'pipeline',
};
/** Stations that need a player holding work; the rest run on their own. */
const WORKED_BY_HAND: ReadonlySet<Tile> = new Set(['keyboard', 'testBench', 'whiteboard']);
/** How fast each hand-worked station advances its step. */
const HAND_RATE: Partial<Record<Tile, number>> = {
  keyboard: WORK_RATE,
  testBench: WORK_RATE,
  whiteboard: DESIGN_RATE,
};

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
  const onTile = ticketOnTile(state, x, y);
  // The merge station takes a coded part, and then its other half (which merges them).
  if (tile === 'merge') {
    if (!isPart(ticket) || !isFinished(ticket)) return false;
    return !onTile || canMerge(onTile, ticket);
  }
  if (tile === null || onTile) return false;
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
      state.events.push({ type: 'binned', playerId, ticketId: carried.id });
      return true;
    }
    if (tile === 'ship') return shipTicket(state, playerId, carried);
    if (canPutDown(state, carried, x, y)) {
      state.events.push({ type: 'putDown', playerId, ticketId: carried.id });
      settleOn(state, carried, x, y);
      return true;
    }
    return false;
  }

  const queue = queueAt(tile);
  const pick =
    queue !== undefined
      ? queuedTickets(state, queue)[0]
      : onTile && PICK_UP_FROM.has(tile) && !isBuilding(state, onTile)
        ? onTile
        : ticketOnTile(state, ...standingTile(state, playerId));
  if (!pick) return false;
  pick.location = { kind: 'player', playerId };
  state.events.push({ type: 'pickedUp', playerId, ticketId: pick.id });
  return true;
}

/**
 * Puts `ticket` on tile (x, y), which `canPutDown` allowed: on a merge
 * station holding its other half, the two become one full-stack ticket.
 * Returns the ticket now on the tile.
 */
export function settleOn(state: GameState, ticket: Ticket, x: number, y: number): Ticket {
  const onTile = ticketOnTile(state, x, y);
  if (onTile && onTile !== ticket && canMerge(onTile, ticket)) {
    return mergeParts(state, onTile, ticket, x, y);
  }
  ticket.location = { kind: 'tile', x, y };
  return ticket;
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
  /** On levels with pairing: players coding at each keyboard this tick. */
  coders: Map<number, PlayerId[]>;
}

export function newTickWork(): TickWork {
  return { worked: new Set(), reviewers: new Map(), coders: new Map() };
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
  if (tile === 'keyboard' && state.settings.pairing) {
    // Pairing: everyone at the keyboard signs up; `finishCoding` advances it once.
    const ticket = ticketOnTile(state, x, y);
    if (!ticket || !stationWorkStep(ticket, tile)) return false;
    tickWork.coders.set(key, [...(tickWork.coders.get(key) ?? []), playerId]);
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
  advanceStep(step, HAND_RATE[tile] ?? WORK_RATE);
  worked.add(key);
  return true;
}

/**
 * On levels with pairing, advances each keyboard someone coded at this tick:
 * at `PAIR_RATE` with two or more players, else at the normal rate.
 */
export function finishCoding(state: GameState, tickWork: TickWork): void {
  const { width } = state.level;
  for (const [key, players] of tickWork.coders) {
    const x = key % width;
    const y = Math.floor(key / width);
    const ticket = ticketOnTile(state, x, y);
    const step = ticket && stationWorkStep(ticket, 'keyboard');
    if (step) advanceStep(step, players.length >= 2 ? PAIR_RATE : WORK_RATE);
  }
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
