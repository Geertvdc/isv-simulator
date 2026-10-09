/**
 * Scripted bots for headless tuning runs and scenario tests. Each bot takes
 * one ticket at a time from a queue and walks it through every station
 * itself (shortest path, then work), ships it and goes back for the next.
 * Bugs first, since their timers are shorter. Bots that skip tests go
 * straight from code to pipeline and ship untested.
 */

import { isAtItsStation } from './interact';
import { type GridPoint, type LevelMap, type Tile, getTile, isSolid } from './level';
import type { Level } from './levels';
import { type LevelResult, matchingOrders } from './orders';
import {
  type GameState,
  type InputCommand,
  type PlayerId,
  createGame,
  getPlayer,
  targetTile,
} from './state';
import { tick } from './tick';
import {
  OPTIONAL_STEPS,
  QUEUE_TILE,
  type StepKind,
  type Ticket,
  type TicketKind,
  currentStep,
  queuedTickets,
  ticketCarriedBy,
  workableSteps,
} from './tickets';

/** Where each step gets done. */
const STEP_TILE: Readonly<Record<StepKind, Tile>> = {
  code: 'keyboard',
  test: 'testBench',
  pipeline: 'pipeline',
};

const NEIGHBOURS: readonly GridPoint[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/** How far off a tile's center line a bot may stand before it recenters to face a station. */
const CENTER_SLACK = 0.2;

export interface Bot {
  playerId: PlayerId;
  /** The ticket this bot is looking after, wherever it is. */
  ticketId: number | null;
  /** The station this bot is about to put its ticket on, so other bots leave it free. */
  dropTarget: GridPoint | null;
  /** Interact was sent last tick: presses need a release in between. */
  interactWas: boolean;
  skipTests: boolean;
}

type Action = 'interact' | 'work' | 'wait';

interface Goal {
  tile: GridPoint;
  action: Action;
}

export function createBot(playerId: PlayerId, skipTests = false): Bot {
  return { playerId, ticketId: null, dropTarget: null, interactWas: false, skipTests };
}

function tilesOf(map: LevelMap, tile: Tile): GridPoint[] {
  const result: GridPoint[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (getTile(map, x, y) === tile) result.push({ x, y });
    }
  }
  return result;
}

/** Floor tiles next to `tile`, where a player can stand to use it. */
function standingSpots(map: LevelMap, tile: GridPoint): GridPoint[] {
  return NEIGHBOURS.map((d) => ({ x: tile.x + d.x, y: tile.y + d.y })).filter(
    (p) => !isSolid(getTile(map, p.x, p.y)),
  );
}

/**
 * Shortest floor path from `from` to any tile next to `target`, as a list of
 * tiles starting after `from`. Empty when already there; `null` when unreachable.
 */
export function findPath(map: LevelMap, from: GridPoint, target: GridPoint): GridPoint[] | null {
  const key = (p: GridPoint): number => p.y * map.width + p.x;
  const goals = new Set(standingSpots(map, target).map(key));
  if (goals.has(key(from))) return [];
  const cameFrom = new Map<number, GridPoint | null>([[key(from), null]]);
  const queue: GridPoint[] = [from];
  for (let i = 0; i < queue.length; i++) {
    const at = queue[i];
    if (!at) break;
    for (const d of NEIGHBOURS) {
      const next = { x: at.x + d.x, y: at.y + d.y };
      if (isSolid(getTile(map, next.x, next.y)) || cameFrom.has(key(next))) continue;
      cameFrom.set(key(next), at);
      if (goals.has(key(next))) {
        const path: GridPoint[] = [];
        for (let p: GridPoint | null | undefined = next; p && key(p) !== key(from);) {
          path.unshift(p);
          p = cameFrom.get(key(p));
        }
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

function currentTile(state: GameState, playerId: PlayerId): GridPoint {
  const p = getPlayer(state, playerId);
  if (!p) throw new Error(`No player ${playerId}`);
  return { x: Math.round(p.pos.x), y: Math.round(p.pos.y) };
}

/** The candidate closest by walking distance, or `undefined` if none is reachable. */
function nearest(state: GameState, playerId: PlayerId, tiles: GridPoint[]): GridPoint | undefined {
  const from = currentTile(state, playerId);
  let best: GridPoint | undefined;
  let bestLength = Infinity;
  for (const tile of tiles) {
    const path = findPath(state.level, from, tile);
    if (path && path.length < bestLength) {
      best = tile;
      bestLength = path.length;
    }
  }
  return best;
}

function samePoint(a: GridPoint | null, b: GridPoint | null): boolean {
  return a !== null && b !== null && a.x === b.x && a.y === b.y;
}

/** What `bot` wants to do next. */
function chooseGoal(state: GameState, bot: Bot, bots: readonly Bot[]): Goal | null {
  bot.dropTarget = null;
  const carried = ticketCarriedBy(state, bot.playerId);
  if (carried) {
    bot.ticketId = carried.id;
    return carryGoal(state, bot, bots, carried);
  }

  const own = state.tickets.find((t) => t.id === bot.ticketId);
  if (own?.location.kind === 'tile') {
    const tile = { x: own.location.x, y: own.location.y };
    const kind = getTile(state.level, tile.x, tile.y);
    if (!isAtItsStation(own, kind)) return { tile, action: 'interact' };
    return { tile, action: kind === 'pipeline' ? 'wait' : 'work' };
  }
  bot.ticketId = null;

  for (const queue of ['bug', 'feature'] as const satisfies readonly TicketKind[]) {
    if (queuedTickets(state, queue).length === 0) continue;
    const tile = nearest(state, bot.playerId, tilesOf(state.level, QUEUE_TILE[queue]));
    if (tile) return { tile, action: 'interact' };
  }
  return null;
}

function carryGoal(state: GameState, bot: Bot, bots: readonly Bot[], ticket: Ticket): Goal | null {
  const step = bot.skipTests
    ? workableSteps(ticket).find((s) => !OPTIONAL_STEPS.has(s.kind))
    : currentStep(ticket);
  if (!step) {
    const where = matchingOrders(state, ticket).length > 0 ? 'ship' : 'bin';
    const tile = nearest(state, bot.playerId, tilesOf(state.level, where));
    return tile ? { tile, action: 'interact' } : null;
  }
  const free = tilesOf(state.level, STEP_TILE[step.kind]).filter(
    (t) =>
      !state.tickets.some(
        (o) => o.location.kind === 'tile' && o.location.x === t.x && o.location.y === t.y,
      ) && !bots.some((b) => b !== bot && samePoint(b.dropTarget, t)),
  );
  const tile = nearest(state, bot.playerId, free);
  if (!tile) return null;
  bot.dropTarget = tile;
  return { tile, action: 'interact' };
}

function unit(x: number, y: number): { x: number; y: number } {
  const len = Math.hypot(x, y);
  return len < 1e-9 ? { x: 0, y: 0 } : { x: x / len, y: y / len };
}

/** This tick's input for one bot. */
export function botInput(state: GameState, bot: Bot, bots: readonly Bot[]): InputCommand {
  const input: InputCommand = {
    playerId: bot.playerId,
    tick: state.tick,
    move: { x: 0, y: 0 },
    interact: false,
    work: false,
  };
  const goal = chooseGoal(state, bot, bots);
  const player = getPlayer(state, bot.playerId);
  if (!goal || !player) {
    bot.interactWas = false;
    return input;
  }

  const path = findPath(state.level, currentTile(state, bot.playerId), goal.tile);
  let wantsInteract = false;
  if (path && path.length > 0) {
    const next = path[0];
    if (next) input.move = unit(next.x - player.pos.x, next.y - player.pos.y);
  } else if (path) {
    const here = currentTile(state, bot.playerId);
    const dir = { x: goal.tile.x - here.x, y: goal.tile.y - here.y };
    const offCenter = dir.x !== 0 ? player.pos.y - here.y : player.pos.x - here.x;
    if (Math.abs(offCenter) > CENTER_SLACK) {
      input.move = unit(here.x - player.pos.x, here.y - player.pos.y);
    } else if (samePoint(targetTile(state, bot.playerId), goal.tile)) {
      wantsInteract = goal.action === 'interact';
      input.work = goal.action === 'work';
    } else {
      input.move = dir;
    }
  }
  input.interact = wantsInteract && !bot.interactWas;
  bot.interactWas = input.interact;
  return input;
}

export interface BotRunSummary {
  shipped: number;
  shippedBugs: number;
  shippedUntested: number;
  expired: number;
  expiredBugs: number;
  result: LevelResult;
}

/** Plays a whole level with `botCount` bots and reports how it went. */
export function runBots(
  level: Level,
  seed: number,
  botCount: number,
  { skipTests = false }: { skipTests?: boolean } = {},
): BotRunSummary {
  const ids = Array.from({ length: botCount }, (_, i) => i + 1);
  const state = createGame(level, seed, ids);
  const bots = ids.map((id) => createBot(id, skipTests));
  const summary = { shipped: 0, shippedBugs: 0, shippedUntested: 0, expired: 0, expiredBugs: 0 };
  while (!state.result) {
    tick(
      state,
      bots.map((b) => botInput(state, b, bots)),
    );
    for (const e of state.events) {
      if (e.type === 'orderShipped') {
        summary.shipped++;
        if (e.order.kind === 'bug') summary.shippedBugs++;
        if (e.untested) summary.shippedUntested++;
      }
      if (e.type === 'orderExpired') {
        summary.expired++;
        if (e.order.kind === 'bug') summary.expiredBugs++;
      }
    }
  }
  return { ...summary, result: state.result };
}
