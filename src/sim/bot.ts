/**
 * Scripted bots for headless tuning runs and scenario tests. Each bot takes
 * one ticket at a time from a queue and walks it through every station
 * itself (shortest path, then work), ships it and goes back for the next.
 * Bugs first, since their timers are shorter. Bots that skip tests go
 * straight from code to pipeline and ship untested. A bot whose ticket is
 * stuck on a broken pipeline takes it out and repairs the pipeline. A
 * ticket waiting for review gets a second bot to help: any bot with nothing
 * better to do (empty hands, a build running, or no free station for what
 * it carries) goes and works the review station with the owner.
 * Incident hotfixes come first in the bug queue, so bots take them first.
 * Tickets whose order expired go straight in the bin.
 * Bots plan their walks around managers, and an invited bot drops
 * everything (but keeps carrying) and stands in the meeting room. Bots only
 * get in a lift car going the way their walk needs (`liftGate`).
 */

import { type GridPoint, type LevelMap, getTile, isSolid } from './level';
import { type Lift, hasDoors, isLiftHop } from './lifts';
import { managerTiles } from './manager';
import { shutDoors } from './meetings';
import { NEIGHBOURS, pathTo } from './path';
import { wetTiles } from './spills';
import { type GameState, type InputCommand, type PlayerId, getPlayer, targetTile } from './state';
import { chooseGoal } from './botGoals';
import { currentTile, findPath, samePoint } from './botNav';

/** How far off a tile's center line a bot may stand before it recenters to face a station. */
const CENTER_SLACK = 0.2;

export interface Bot {
  playerId: PlayerId;
  /** The ticket this bot is looking after, wherever it is. */
  ticketId: number | null;
  /** The station this bot is about to put its ticket on, so other bots leave it free. */
  dropTarget: GridPoint | null;
  /** The review station this bot is helping at, so no more bots than needed come. */
  helping: GridPoint | null;
  /** Interact was sent last tick: presses need a release in between. */
  interactWas: boolean;
  skipTests: boolean;
  assignmentPolicy: BotAssignmentPolicy;
}

export type BotAssignmentPolicy = 'role-neutral' | 'role-aware';

export function createBot(
  playerId: PlayerId,
  skipTests = false,
  assignmentPolicy: BotAssignmentPolicy = 'role-neutral',
): Bot {
  return {
    playerId,
    ticketId: null,
    dropTarget: null,
    helping: null,
    interactWas: false,
    skipTests,
    assignmentPolicy,
  };
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
    dash: false,
  };
  const goal = chooseGoal(state, bot, bots);
  const player = getPlayer(state, bot.playerId);
  if (!goal || !player) {
    bot.interactWas = false;
    return input;
  }

  const from = currentTile(state, bot.playerId);
  // Walk around managers when there is a way around; otherwise wait for them to move on.
  // Meeting doors shut to this bot count as walls (fallbacks below may still try them).
  const blocked = [...managerTiles(state), ...shutDoors(state, bot.playerId)];
  // Keep off wet floor (spills) when the dry way round is short enough.
  const wet = wetTiles(state);
  if (goal.action === 'stand') {
    const walk = preferDry(
      pathTo(state.level, from, goal.tile, [...blocked, ...wet], state.gates),
      pathTo(state.level, from, goal.tile, blocked, state.gates) ??
        pathTo(state.level, from, goal.tile, [], state.gates),
    );
    const gate = walk ? liftGate(state, from, walk) : null;
    const next = walk?.[0];
    if (gate) input.move = gate;
    else if (next) input.move = stepToward(state.level, player.pos, next);
    bot.interactWas = false;
    return input;
  }
  const others = goal.besideOthers
    ? state.players
        .filter((p) => p.id !== bot.playerId)
        .map((p) => ({ x: Math.round(p.pos.x), y: Math.round(p.pos.y) }))
    : [];
  const path = preferDry(
    findPath(state.level, from, goal.tile, others, [...blocked, ...wet], state.gates),
    findPath(state.level, from, goal.tile, others, blocked, state.gates) ??
      findPath(state.level, from, goal.tile, others, [], state.gates),
  );
  let wantsInteract = false;
  const gate = path && path.length > 0 ? liftGate(state, from, path) : null;
  if (gate) {
    input.move = gate;
  } else if (path && path.length > 0) {
    const next = path[0];
    if (next) input.move = stepToward(state.level, player.pos, next);
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

/** Steps a bot walks round wet floor (spills) rather than slide across it. */
const DRY_DETOUR_STEPS = 6;

/** The dry walk when it's at most a short detour, else the plain one. */
function preferDry(dry: GridPoint[] | null, plain: GridPoint[] | null): GridPoint[] | null {
  if (dry && plain && dry.length <= plain.length + DRY_DETOUR_STEPS) return dry;
  return plain ?? dry;
}

/**
 * The move toward the next tile of a path. A tile further than next door is a
 * lift ride: stand in the middle of the cabin tile and let the lift take you.
 */
function stepToward(
  map: LevelMap,
  pos: { x: number; y: number },
  next: GridPoint,
): { x: number; y: number } {
  if (isLiftHop(map, pos, next)) {
    const here = { x: Math.round(pos.x), y: Math.round(pos.y) };
    const off = Math.hypot(here.x - pos.x, here.y - pos.y);
    return off > 0.1 ? unit(here.x - pos.x, here.y - pos.y) : { x: 0, y: 0 };
  }
  return unit(next.x - pos.x, next.y - pos.y);
}

/** Which way a lift goes when it next leaves `floor`, or `null` when it isn't at or on its way to it. */
function nextLeaves(lift: Lift, floor: number): 1 | -1 | null {
  if (lift.at !== floor) return null;
  const next = lift.at + lift.dir;
  return next < 0 || next >= lift.stops.length ? (lift.dir === 1 ? -1 : 1) : lift.dir;
}

/** The lift (with doors), floor and floor index of a cabin tile, if `tile` is one. */
function cabinFloor(state: GameState, tile: GridPoint): { lift: Lift; floor: number } | null {
  for (const lift of state.lifts) {
    if (!hasDoors(lift)) continue;
    const floor = lift.stops.findIndex((cabin) =>
      cabin.some((t) => t.x === tile.x && t.y === tile.y),
    );
    if (floor >= 0) return { lift, floor };
  }
  return null;
}

/**
 * Lift manners for a bot whose walk rides a lift (with doors): it only gets
 * in when the lift's next stop from this floor is the one its walk needs.
 * Otherwise it waits a step back from the doors (so riders can get out) and
 * gets out of a car that goes the wrong way. Returns the move to make
 * instead of following the walk, or `null` to follow it.
 */
export function liftGate(
  state: GameState,
  from: GridPoint,
  path: readonly GridPoint[],
): { x: number; y: number } | null {
  if (!state.lifts.some(hasDoors)) return null;
  // The first ride on the walk, while it's at most two steps away.
  const stops = [from, ...path];
  let hop = -1;
  for (let i = 0; i + 1 < stops.length && i <= 2; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (a && b && isLiftHop(state.level, a, b)) {
      hop = i;
      break;
    }
  }
  const origin = stops[hop];
  const dest = stops[hop + 1];
  if (hop < 0 || !origin || !dest) return null;
  const at = cabinFloor(state, origin);
  const to = cabinFloor(state, dest);
  if (!at || !to || at.lift !== to.lift) return null;
  const wanted = to.floor > at.floor ? 1 : -1;
  if (nextLeaves(at.lift, at.floor) === wanted) return null;
  const inside = cabinFloor(state, from);
  if (inside && inside.lift === at.lift && inside.floor === at.floor) {
    // Wrong way, or the car is elsewhere: step out onto the floor in front of it.
    // (A rider can't move until the doors open on the next floor, so mid-ride this does nothing.)
    const cabin = at.lift.stops[at.floor] ?? [];
    for (const d of NEIGHBOURS) {
      const out = { x: from.x + d.x, y: from.y + d.y };
      if (cabin.some((t) => t.x === out.x && t.y === out.y)) continue;
      if (isSolid(getTile(state.level, out.x, out.y))) continue;
      return d;
    }
    return { x: 0, y: 0 };
  }
  // Outside: wait a step back from the doors, or where it is when that's the door step.
  return { x: 0, y: 0 };
}
