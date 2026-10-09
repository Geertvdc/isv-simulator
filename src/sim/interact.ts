/**
 * Interact (pick up, put down, bin) and work (advance a step at a station).
 */

import { WORK_RATE } from './balance';
import { type Tile, getTile } from './level';
import { type GameState, type PlayerId, targetTile } from './state';
import { type StepKind, getStep, isStepDone, ticketCarriedBy, ticketOnTile } from './tickets';

const PROGRESS_EPSILON = 1e-9;

/** Tiles players can take a ticket from. */
const PICK_UP_FROM: ReadonlySet<Tile> = new Set(['counter', 'inbox', 'keyboard', 'testBench']);
/** Tiles players can put a ticket on. */
const PUT_DOWN_ON: ReadonlySet<Tile> = new Set(['counter', 'keyboard', 'testBench']);

/** The step each work station advances. */
const STATION_STEP: Partial<Record<Tile, StepKind>> = {
  keyboard: 'code',
  testBench: 'test',
};

/** Steps that must be done before a step can be worked on. */
const STEP_NEEDS: Partial<Record<StepKind, StepKind>> = {
  test: 'code',
};

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
    if (PUT_DOWN_ON.has(tile) && !onTile) {
      carried.location = { kind: 'tile', x, y };
      return true;
    }
    return false;
  }

  if (onTile && PICK_UP_FROM.has(tile)) {
    onTile.location = { kind: 'player', playerId };
    return true;
  }
  return false;
}

/**
 * Work held by `playerId` this tick. `worked` collects the tiles already
 * worked this tick (as `y * width + x`) so two players at one station don't
 * stack. Returns whether any progress was made.
 */
export function work(state: GameState, playerId: PlayerId, worked: Set<number>): boolean {
  const { x, y } = targetTile(state, playerId);
  const tile = getTile(state.level, x, y);
  if (tile === null) return false;
  const kind = STATION_STEP[tile];
  if (!kind) return false;
  const key = y * state.level.width + x;
  if (worked.has(key)) return false;

  const ticket = ticketOnTile(state, x, y);
  const step = ticket && getStep(ticket, kind);
  if (!ticket || !step || step.progress >= 1) return false;
  const needs = STEP_NEEDS[kind];
  if (needs && !isStepDone(ticket, needs)) return false;

  const progress = step.progress + WORK_RATE;
  // Snap float error so N ticks of WORK_RATE = 1 always finishes the step.
  step.progress = progress >= 1 - PROGRESS_EPSILON ? 1 : progress;
  worked.add(key);
  return true;
}
