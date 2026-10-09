/** Helpers for sim tests: a small map with one of everything, and ways to poke at it. */

import { parseLevelMap } from './level';
import { type LevelSettings, levelWithMap } from './levels';
import {
  type GameState,
  type InputCommand,
  type PlayerId,
  type Vec,
  createGame,
  getPlayer,
} from './state';
import { tick } from './tick';
import { TICKET_STEPS, type Ticket, type TicketKind } from './tickets';

/**
 * Row 1 holds one of everything; players stand on row 2 facing up.
 * Columns: 1=I 2=K 3=T 4=C 5=C 6=X 7=P 8=S 9=R 10=# (wall) 11=. (floor) 12=B
 */
export const TEST_MAP = [
  '##############',
  '#IKTCCXPSR#.B#',
  '#............#',
  '#1234........#',
  '##############',
].join('\n');

export const COL = {
  inbox: 1,
  keyboard: 2,
  testBench: 3,
  counter: 4,
  counter2: 5,
  bin: 6,
  pipeline: 7,
  ship: 8,
  review: 9,
  wall: 10,
  floor: 11,
  bugQueue: 12,
} as const;

/** A game on the test map with no orders unless a test opens them. */
export function newTestGame(settings: Partial<LevelSettings> = {}): GameState {
  const state = createGame(levelWithMap(parseLevelMap(TEST_MAP)), 1, [1, 2]);
  // Overrides replace the settings as scaled for the two test players.
  state.settings = { ...state.settings, ...settings };
  state.nextOrderTick = Number.MAX_SAFE_INTEGER;
  return state;
}

/** Puts a player on row 2 under column `x`, facing up at row 1. */
export function standAt(state: GameState, playerId: PlayerId, x: number): void {
  const p = getPlayer(state, playerId);
  if (!p) throw new Error(`No player ${playerId}`);
  p.pos = { x, y: 2 };
  p.facing = { x: 0, y: -1 };
}

/**
 * Puts a ticket on row 1 at column `x`. `done` is how many of its steps are
 * finished; `progress` is the progress of the step after those.
 */
export function addTicket(
  state: GameState,
  x: number,
  {
    kind = 'feature',
    done = 0,
    progress = 0,
  }: { kind?: TicketKind; done?: number; progress?: number } = {},
): Ticket {
  const ticket: Ticket = {
    id: state.nextTicketId++,
    kind,
    title: 'Test ticket',
    steps: TICKET_STEPS[kind].map((k, i) => ({
      kind: k,
      progress: i < done ? 1 : i === done ? progress : 0,
    })),
    location: { kind: 'tile', x, y: 1 },
  };
  state.tickets.push(ticket);
  return ticket;
}

export function cmd(
  state: GameState,
  playerId: PlayerId,
  buttons: { interact?: boolean; work?: boolean; dash?: boolean; move?: Vec },
): InputCommand {
  return {
    playerId,
    tick: state.tick,
    move: buttons.move ?? { x: 0, y: 0 },
    interact: buttons.interact ?? false,
    work: buttons.work ?? false,
    dash: buttons.dash ?? false,
  };
}

/** A full press: interact down for one tick, then released. */
export function press(state: GameState, playerId: PlayerId = 1): void {
  tick(state, [cmd(state, playerId, { interact: true })]);
  tick(state, [cmd(state, playerId, {})]);
}

export function holdWork(state: GameState, ticks: number, playerIds: PlayerId[] = [1]): void {
  for (let i = 0; i < ticks; i++) {
    tick(
      state,
      playerIds.map((id) => cmd(state, id, { work: true })),
    );
  }
}

/** Runs `n` ticks with nobody touching anything. */
export function idle(state: GameState, n: number): void {
  for (let i = 0; i < n; i++) tick(state, []);
}

/** Puts a ticket in `playerId`'s hands. */
export function give(playerId: PlayerId, ticket: Ticket): void {
  ticket.location = { kind: 'player', playerId };
}
