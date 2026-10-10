/**
 * The game state: plain JSON-serializable data, advanced only by `tick`.
 */

import { INTERACT_REACH } from './balance';
import type { GridPoint, LevelMap } from './level';
import { type Level, type LevelSettings, settingsForPlayers } from './levels';
import type { GameEvent, LevelResult, Order, PendingBug } from './orders';
import { type Pipeline, createPipelines } from './pipeline';
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
  /** Whether dash was held last tick: dash starts only on the press. */
  dashHeld: boolean;
  /**
   * Ticks interact has been held since a press that did nothing while
   * carrying a ticket; the ticket is thrown once this reaches
   * `THROW_HOLD_TICKS`. 0 when not winding up a throw.
   */
  throwCharge: number;
  /** Ticks of dash left; 0 when not dashing. */
  dashTicks: number;
  /** Ticks until the next dash may start. */
  dashCooldown: number;
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
  dash: boolean;
}

export interface GameState {
  seed: number;
  rngState: RngState;
  tick: number;
  levelId: string;
  level: LevelMap;
  settings: LevelSettings;
  players: Player[];
  tickets: Ticket[];
  /** One per pipeline tile: whether it's broken and how long its build has waited. */
  pipelines: Pipeline[];
  nextTicketId: number;
  orders: Order[];
  nextOrderId: number;
  /** Tick from which the next feature order is due. */
  nextOrderTick: number;
  /** Tick from which the next incident is due; `null` on levels without incidents. */
  nextIncidentTick: number | null;
  /** Bugs on their way back from shipped tickets. */
  pendingBugs: PendingBug[];
  score: number;
  /** Set when the level ends; the sim stops advancing. */
  result: LevelResult | null;
  /** What happened during the last tick, for render and UI to react to. */
  events: GameEvent[];
}

/** Players start facing the camera. */
const START_FACING: Vec = { x: 0, y: 1 };

/** A player standing still at `pos`, facing the camera. */
export function newPlayer(id: PlayerId, pos: Vec): Player {
  return {
    id,
    pos: { x: pos.x, y: pos.y },
    vel: { x: 0, y: 0 },
    facing: { ...START_FACING },
    interactHeld: false,
    throwCharge: 0,
    dashHeld: false,
    dashTicks: 0,
    dashCooldown: 0,
  };
}

/** A new game with each player standing on their own spawn: player `n` on spawn `n`. */
export function createGame(level: Level, seed: number, playerIds: readonly PlayerId[]): GameState {
  const { map } = level;
  if (playerIds.length === 0) throw new Error('A game needs at least one player');
  if (new Set(playerIds).size !== playerIds.length) throw new Error('Duplicate player ids');
  const players = playerIds.map((id): Player => {
    const spawn = Number.isInteger(id) ? map.spawns[id - 1] : undefined;
    if (!spawn) throw new Error(`Level has no spawn for player ${id}`);
    return newPlayer(id, spawn);
  });
  return {
    seed,
    rngState: createRng(seed),
    tick: 0,
    levelId: level.id,
    level: map,
    settings: settingsForPlayers(level, playerIds.length),
    players,
    tickets: [],
    pipelines: createPipelines(map),
    nextTicketId: 1,
    orders: [],
    nextOrderId: 1,
    nextOrderTick: level.orderSchedule.firstOrderTick,
    nextIncidentTick: level.incidents?.firstTick ?? null,
    pendingBugs: [],
    score: 0,
    result: null,
    events: [],
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
