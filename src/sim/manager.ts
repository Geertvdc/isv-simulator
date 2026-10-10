/**
 * Wandering managers: non-player characters that walk from one random floor
 * tile to the next, stop for a chat, and walk on. Players can't push them;
 * a walking manager shoves whoever is in the way. A player pinned against a
 * wall stops it, and after a while it walks somewhere else.
 */

import {
  MANAGER_BUMP_COOLDOWN_TICKS,
  MANAGER_PAUSE_MAX_TICKS,
  MANAGER_PAUSE_MIN_TICKS,
  MANAGER_RADIUS,
  MANAGER_SHOVE_SPEED,
  MANAGER_SPEED,
  MANAGER_STUCK_TICKS,
  PLAYER_RADIUS,
  TICKS_PER_SECOND,
} from './balance';
import { type GridPoint, type LevelMap, getTile } from './level';
import { isDashing, resolveCollisions } from './movement';
import { pathTo } from './path';
import * as rng from './rng';
import type { GameState, Player, Vec } from './state';

export interface Manager {
  id: number;
  /** Grid units, like players. */
  pos: Vec;
  /** Unit vector it walks or last walked along. */
  facing: Vec;
  /** Tile centers still to walk through, next first. Empty when standing. */
  path: GridPoint[];
  /** Ticks left standing still before it picks the next spot. */
  waitTicks: number;
  /** Ticks in a row it wanted to walk and was blocked. */
  stuckTicks: number;
  /** Tick from which it may shove someone again. */
  nextBumpTick: number;
  /** Whether it moved this tick. */
  walking: boolean;
}

const DT = 1 / TICKS_PER_SECOND;
/** A pinned player may still overlap the manager this much without stopping it. */
const PIN_SLACK = 0.02;
const EPSILON = 1e-9;

/** One manager per `M` on the map, standing still for a moment at the start. */
export function createManagers(map: LevelMap): Manager[] {
  return map.managerSpawns.map((spawn, i) => ({
    id: i + 1,
    pos: { x: spawn.x, y: spawn.y },
    facing: { x: 0, y: 1 },
    path: [],
    waitTicks: MANAGER_PAUSE_MIN_TICKS,
    stuckTicks: 0,
    nextBumpTick: 0,
    walking: false,
  }));
}

function floorTiles(map: LevelMap): GridPoint[] {
  const result: GridPoint[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (getTile(map, x, y) === 'floor') result.push({ x, y });
    }
  }
  return result;
}

function tileOf(pos: Vec): GridPoint {
  return { x: Math.round(pos.x), y: Math.round(pos.y) };
}

/** Picks a random floor tile and plans the walk there; stays put a moment if it can't. */
function pickTarget(state: GameState, manager: Manager): void {
  const [target, s] = rng.pick(state.rngState, floorTiles(state.level));
  state.rngState = s;
  const path = pathTo(state.level, tileOf(manager.pos), target);
  if (path && path.length > 0) manager.path = path;
  else manager.waitTicks = MANAGER_PAUSE_MIN_TICKS;
}

/** Overlap between a player and a manager standing at `at`; 0 when apart. */
function overlap(player: Player, at: Vec): number {
  const dist = Math.hypot(player.pos.x - at.x, player.pos.y - at.y);
  return Math.max(0, PLAYER_RADIUS + MANAGER_RADIUS - dist);
}

/** Direction from `at` to the player; the manager's facing when they stand on one spot. */
function awayFrom(player: Player, at: Vec, facing: Vec): Vec {
  const dx = player.pos.x - at.x;
  const dy = player.pos.y - at.y;
  const dist = Math.hypot(dx, dy);
  return dist > EPSILON ? { x: dx / dist, y: dy / dist } : facing;
}

/** Whether a manager stepping to `at` would squash a player who has nowhere to go. */
function pinsSomeone(map: LevelMap, players: readonly Player[], at: Vec, facing: Vec): boolean {
  return players.some((p) => {
    const depth = overlap(p, at);
    if (depth <= 0) return false;
    const n = awayFrom(p, at, facing);
    const pos = { x: p.pos.x + n.x * depth, y: p.pos.y + n.y * depth };
    resolveCollisions(map, pos);
    const left = PLAYER_RADIUS + MANAGER_RADIUS - Math.hypot(pos.x - at.x, pos.y - at.y);
    return left > PIN_SLACK;
  });
}

/** One step along the path, unless that would squash someone. */
function walk(state: GameState, manager: Manager): void {
  const next = manager.path[0];
  if (!next) return;
  const dx = next.x - manager.pos.x;
  const dy = next.y - manager.pos.y;
  const dist = Math.hypot(dx, dy);
  const step = MANAGER_SPEED * DT;
  const facing = dist > EPSILON ? { x: dx / dist, y: dy / dist } : manager.facing;
  const to =
    dist <= step
      ? { x: next.x, y: next.y }
      : {
          x: manager.pos.x + facing.x * step,
          y: manager.pos.y + facing.y * step,
        };
  manager.facing = facing;
  if (pinsSomeone(state.level, state.players, to, facing)) {
    manager.stuckTicks++;
    if (manager.stuckTicks >= MANAGER_STUCK_TICKS) {
      // Give up on this spot; a new one next tick.
      manager.path = [];
      manager.stuckTicks = 0;
    }
    return;
  }
  manager.pos = to;
  manager.stuckTicks = 0;
  manager.walking = true;
  if (dist <= step) {
    manager.path.shift();
    if (manager.path.length === 0) {
      const [wait, s] = rng.int(state.rngState, MANAGER_PAUSE_MIN_TICKS, MANAGER_PAUSE_MAX_TICKS);
      state.rngState = s;
      manager.waitTicks = wait;
    }
  }
}

/**
 * Pushes every player out of the manager and back out of walls. A walking
 * manager shoves them away (once per cooldown); a dash into a manager stops dead.
 */
function pushPlayers(state: GameState, manager: Manager): void {
  for (const player of state.players) {
    const depth = overlap(player, manager.pos);
    if (depth <= 0) continue;
    const n = awayFrom(player, manager.pos, manager.facing);
    player.pos.x += n.x * depth;
    player.pos.y += n.y * depth;
    resolveCollisions(state.level, player.pos);
    if (isDashing(player)) {
      player.dashTicks = 0;
      player.vel = { x: 0, y: 0 };
    }
    if (manager.walking && state.tick >= manager.nextBumpTick) {
      player.vel = { x: n.x * MANAGER_SHOVE_SPEED, y: n.y * MANAGER_SHOVE_SPEED };
      manager.nextBumpTick = state.tick + MANAGER_BUMP_COOLDOWN_TICKS;
      state.events.push({ type: 'managerBumped', managerId: manager.id, target: player.id });
    }
  }
}

/** Per tick, after players moved: every manager waits, picks a spot or walks, then pushes players. */
export function updateManagers(state: GameState): void {
  for (const manager of state.managers) {
    manager.walking = false;
    if (manager.waitTicks > 0) {
      manager.waitTicks--;
    } else {
      if (manager.path.length === 0) pickTarget(state, manager);
      walk(state, manager);
    }
    pushPlayers(state, manager);
  }
}

/** Tiles a manager stands on or walks into next, for bots to plan around. */
export function managerTiles(state: GameState): GridPoint[] {
  return state.managers.flatMap((m) => {
    const here = tileOf(m.pos);
    const next = m.path[0];
    return next && (next.x !== here.x || next.y !== here.y) ? [here, next] : [here];
  });
}
