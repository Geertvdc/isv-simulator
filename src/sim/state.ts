/**
 * The game state: plain JSON-serializable data, advanced only by `tick`.
 */

import { INBOX_FIRST_SPAWN_TICK, INTERACT_REACH } from './balance';
import type { GridPoint, LevelMap } from './level';
import { type RngState, createRng } from './rng';
import type { Ticket } from './tickets';

/** A direction or velocity in grid units. */
export interface Vec {
  x: number;
  y: number;
}

export type PlayerId = number;

export interface Player {
  id: PlayerId;
  /** Grid units; tile centers sit on integers. */
  pos: Vec;
  /** Tiles per second. */
  vel: Vec;
  /** Unit vector the player looks along. */
  facing: Vec;
  /** Whether interact was held last tick: interact acts only on the press. */
  interactHeld: boolean;
}

/**
 * One player's input for one sim tick. The sim never knows whether it came
 * from a keyboard, a gamepad or the network.
 */
export interface InputCommand {
  playerId: PlayerId;
  tick: number;
  /** World direction, length 0 to 1. */
  move: Vec;
  interact: boolean;
  work: boolean;
}

export interface GameState {
  seed: number;
  rngState: RngState;
  tick: number;
  level: LevelMap;
  players: Player[];
  tickets: Ticket[];
  nextTicketId: number;
  /** Tick at which the inbox next tries to spawn a ticket. */
  nextInboxSpawnTick: number;
}

/** Players start facing the camera. */
const START_FACING: Vec = { x: 0, y: 1 };

/** A new game with each player standing on their own spawn: player `n` on spawn `n`. */
export function createGame(
  level: LevelMap,
  seed: number,
  playerIds: readonly PlayerId[],
): GameState {
  if (playerIds.length === 0) throw new Error('A game needs at least one player');
  if (new Set(playerIds).size !== playerIds.length) throw new Error('Duplicate player ids');
  const players = playerIds.map((id): Player => {
    const spawn = Number.isInteger(id) ? level.spawns[id - 1] : undefined;
    if (!spawn) throw new Error(`Level has no spawn for player ${id}`);
    return {
      id,
      pos: { x: spawn.x, y: spawn.y },
      vel: { x: 0, y: 0 },
      facing: { ...START_FACING },
      interactHeld: false,
    };
  });
  return {
    seed,
    rngState: createRng(seed),
    tick: 0,
    level,
    players,
    tickets: [],
    nextTicketId: 1,
    nextInboxSpawnTick: INBOX_FIRST_SPAWN_TICK,
  };
}

export function getPlayer(state: GameState, id: PlayerId): Player | undefined {
  return state.players.find((p) => p.id === id);
}

/** The tile in front of the player: what interact and work act on. */
export function targetTile(state: GameState, playerId: PlayerId): GridPoint {
  const player = getPlayer(state, playerId);
  if (!player) throw new Error(`No player ${playerId}`);
  // `+ 0` turns -0 into 0 so callers can compare tiles with ===.
  return {
    x: Math.round(player.pos.x + player.facing.x * INTERACT_REACH) + 0,
    y: Math.round(player.pos.y + player.facing.y * INTERACT_REACH) + 0,
  };
}
