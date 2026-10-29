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
 * everything (but keeps carrying) and stands in the meeting room.
 */

import {
  PIPELINE_BUILD_TICKS,
  DESIGNED_CODE_FACTOR,
  PLAYER_MAX_SPEED,
  REVIEWERS_NEEDED,
  REVIEW_RATE,
  TICKS_PER_SECOND,
  WORK_RATE,
} from './balance';
import { canPutDown, isAtItsStation } from './interact';
import { type GridPoint, type LevelMap, type Tile, getTile, isSolid } from './level';
import type { Level } from './levels';
import { type LevelResult, shipBlockedBy } from './orders';
import { managerTiles } from './manager';
import { inviteFor } from './meetings';
import { NEIGHBOURS, pathTo, searchPath } from './path';
import { isBroken } from './pipeline';
import { roleWorkRate, type RoleId, type TicketDomain } from './roles';
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
  type QueueKind,
  type StepKind,
  type Ticket,
  type TicketKind,
  currentStep,
  isPart,
  isShippable,
  queuedTickets,
  ticketCarriedBy,
  ticketOnTile,
  workableStep,
  workableSteps,
} from './tickets';

/** Where each step gets done. */
const STEP_TILE: Readonly<Record<StepKind, Tile>> = {
  design: 'whiteboard',
  code: 'keyboard',
  merge: 'merge',
  review: 'review',
  test: 'testBench',
  pipeline: 'pipeline',
};

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

/** `stand` means: stand on the tile itself (a meeting room tile), not next to it. */
type Action = 'interact' | 'work' | 'wait' | 'stand';

interface Goal {
  tile: GridPoint;
  action: Action;
  /** Stand next to the tile somewhere no other player stands, so two can work it. */
  besideOthers?: boolean;
}

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
 * tiles starting after `from`. Empty when already there; `null` when
 * unreachable. Spots in `taken` don't count as next to it; tiles in
 * `blocked` (where a manager walks) are walked around.
 */
export function findPath(
  map: LevelMap,
  from: GridPoint,
  target: GridPoint,
  taken: readonly GridPoint[] = [],
  blocked: readonly GridPoint[] = [],
): GridPoint[] | null {
  const key = (p: GridPoint): number => p.y * map.width + p.x;
  const takenKeys = new Set([...taken, ...blocked].map(key));
  const goals = new Set(
    standingSpots(map, target)
      .map(key)
      .filter((k) => !takenKeys.has(k)),
  );
  return searchPath(map, from, (p) => goals.has(key(p)), blocked);
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
  bot.helping = null;
  // A calendar invite beats everything: off to the meeting room, ticket and all.
  if (inviteFor(state, bot.playerId)) {
    if (bot.assignmentPolicy === 'role-aware') {
      const reserved = state.tickets.find((ticket) => ticket.id === bot.ticketId);
      if (reserved?.location.kind === 'queue') bot.ticketId = null;
    }
    const room = meetingGoal(state, bot);
    if (room) return room;
  }
  const carried = ticketCarriedBy(state, bot.playerId);
  if (carried) {
    bot.ticketId = carried.id;
    return carryGoal(state, bot, bots, carried) ?? reviewHelpGoal(state, bot, bots);
  }

  const own = state.tickets.find((t) => t.id === bot.ticketId);
  if (own?.location.kind === 'queue') {
    const head = queuedTickets(state, own.location.queue)[0];
    if (bot.assignmentPolicy === 'role-aware' && head?.id !== own.id) {
      bot.ticketId = null;
      return chooseGoal(state, bot, bots);
    }
    const tile = nearest(state, bot.playerId, tilesOf(state.level, QUEUE_TILE[own.location.queue]));
    return tile ? { tile, action: 'interact' } : null;
  }
  if (own?.location.kind === 'tile') {
    const tile = { x: own.location.x, y: own.location.y };
    const kind = getTile(state.level, tile.x, tile.y);
    // A coded part waits on the merge station for its other half, or parked on a counter.
    if ((kind === 'merge' || kind === 'counter') && isPart(own) && !own.expired) {
      bot.ticketId = null;
      return chooseGoal(state, bot, bots);
    }
    // A finished ticket parked for the incident waits there until shipping opens again.
    if (kind === 'counter' && isParkedForIncident(state, own)) {
      bot.ticketId = null;
      return chooseGoal(state, bot, bots);
    }
    if (!isAtItsStation(own, kind) || isBroken(state, tile)) return { tile, action: 'interact' };
    if (kind === 'pipeline') return reviewHelpGoal(state, bot, bots) ?? { tile, action: 'wait' };
    return { tile, action: 'work' };
  }
  bot.ticketId = null;

  const help = reviewHelpGoal(state, bot, bots);
  if (help) return help;
  const merged =
    expiredGoal(state, bot, bots) ??
    mergedGoal(state, bot, bots) ??
    parkedPartGoal(state, bot, bots) ??
    parkedFinishedGoal(state, bot, bots);
  if (merged) return merged;
  if (bot.assignmentPolicy === 'role-aware') return roleAwareQueueGoal(state, bot, bots);
  for (const queue of ['bug', 'feature'] as const satisfies readonly TicketKind[]) {
    if (queuedTickets(state, queue).length === 0) continue;
    const tile = nearest(state, bot.playerId, tilesOf(state.level, QUEUE_TILE[queue]));
    if (tile) return { tile, action: 'interact' };
  }

  function roleAwareQueueGoal(state: GameState, bot: Bot, bots: readonly Bot[]): Goal | null {
    const player = getPlayer(state, bot.playerId);
    if (!player) return null;
    for (const queue of ['bug', 'feature'] as const) {
      const queueTickets = queuedTickets(state, queue);
      const ticket = queueTickets[0];
      if (!ticket || bots.some((candidate) => candidate.ticketId === ticket.id)) continue;
      const queueTile = tilesOf(state.level, QUEUE_TILE[queue]);
      const available = bots
        .filter((candidate) => {
          if (
            ticketCarriedBy(state, candidate.playerId) ||
            candidate.helping ||
            inviteFor(state, candidate.playerId)
          ) {
            return false;
          }
          return candidate.ticketId === null;
        })
        .flatMap((candidate) => {
          const candidatePlayer = getPlayer(state, candidate.playerId);
          if (!candidatePlayer) throw new Error(`No player ${candidate.playerId}`);
          const walk = nearest(state, candidate.playerId, queueTile);
          if (!walk) return [];
          const path = findPath(state.level, currentTile(state, candidate.playerId), walk);
          if (!path) return [];
          return [
            {
              bot: candidate,
              score:
                assignmentTicks(ticket, candidatePlayer.roleId) +
                (path.length * TICKS_PER_SECOND) / PLAYER_MAX_SPEED,
            },
          ];
        })
        .sort((a, b) => a.score - b.score || a.bot.playerId - b.bot.playerId);
      if (available[0]?.bot.playerId !== bot.playerId) continue;
      bot.ticketId = ticket.id;
      const target = nearest(state, bot.playerId, queueTile);
      return target ? { tile: target, action: 'interact' } : null;
    }
    return null;
  }

  function assignmentTicks(ticket: Ticket, roleId: RoleId): number {
    return ticket.steps.reduce((total, step) => {
      if (step.kind === 'pipeline') return total + PIPELINE_BUILD_TICKS;
      if (step.kind === 'merge') return total;
      if (step.kind === 'review') return total + 1 / REVIEW_RATE;
      const rate = roleWorkRate(roleId, step.kind, ticket.domain);
      const design =
        step.kind === 'code' && ticket.steps.some((candidate) => candidate.kind === 'design');
      return total + 1 / (WORK_RATE * rate * (design ? DESIGNED_CODE_FACTOR : 1));
    }, 0);
  }
  return null;
}

/** The nearest expired ticket lying on a tile that no other bot is fetching: it goes in the bin. */
function expiredGoal(state: GameState, bot: Bot, bots: readonly Bot[]): Goal | null {
  if (!state.level.tiles.includes('bin')) return null;
  const lying = state.tickets.flatMap((t) =>
    t.expired && t.location.kind === 'tile' && !bots.some((b) => b !== bot && b.ticketId === t.id)
      ? [{ x: t.location.x, y: t.location.y }]
      : [],
  );
  const tile = nearest(state, bot.playerId, lying);
  if (!tile) return null;
  bot.ticketId = ticketOnTile(state, tile.x, tile.y)?.id ?? null;
  return { tile, action: 'interact' };
}

/** The nearest merged ticket waiting on a merge station that no other bot is fetching. */
function mergedGoal(state: GameState, bot: Bot, bots: readonly Bot[]): Goal | null {
  const waiting = tilesOf(state.level, 'merge').filter((t) => {
    const ticket = ticketOnTile(state, t.x, t.y);
    return ticket && !isPart(ticket) && !bots.some((b) => b !== bot && b.ticketId === ticket.id);
  });
  const tile = nearest(state, bot.playerId, waiting);
  if (!tile) return null;
  bot.ticketId = ticketOnTile(state, tile.x, tile.y)?.id ?? null;
  return { tile, action: 'interact' };
}

/** Whether a belt hands tickets to `tile`: parking there would stop the belt. */
function beltEndsAt(map: LevelMap, tile: GridPoint): boolean {
  return map.conveyors.some((c) => c.x + c.dir.x === tile.x && c.y + c.dir.y === tile.y);
}

/** The nearest empty counter no belt feeds and no other bot is about to use. */
function freeCounterGoal(state: GameState, bot: Bot, bots: readonly Bot[]): Goal | null {
  const counter = nearest(
    state,
    bot.playerId,
    tilesOf(state.level, 'counter').filter(
      (t) =>
        !ticketOnTile(state, t.x, t.y) &&
        !beltEndsAt(state.level, t) &&
        !bots.some((b) => b !== bot && samePoint(b.dropTarget, t)),
    ),
  );
  if (!counter) return null;
  bot.dropTarget = counter;
  return { tile: counter, action: 'interact' };
}

/** A finished ticket that can't ship yet because an incident is open. */
function isParkedForIncident(state: GameState, ticket: Ticket): boolean {
  return !isPart(ticket) && !ticket.expired && isShippable(ticket) && shipBlockedBy(state, ticket);
}

/** The nearest finished ticket parked on a counter that may ship again and no other bot is fetching. */
function parkedFinishedGoal(state: GameState, bot: Bot, bots: readonly Bot[]): Goal | null {
  const parked = tilesOf(state.level, 'counter').filter((t) => {
    const ticket = ticketOnTile(state, t.x, t.y);
    return (
      ticket &&
      !isPart(ticket) &&
      !ticket.expired &&
      isShippable(ticket) &&
      !shipBlockedBy(state, ticket) &&
      !bots.some((b) => b !== bot && b.ticketId === ticket.id)
    );
  });
  const tile = nearest(state, bot.playerId, parked);
  if (!tile) return null;
  bot.ticketId = ticketOnTile(state, tile.x, tile.y)?.id ?? null;
  return { tile, action: 'interact' };
}

/** The nearest coded part parked on a counter that a merge station would take now. */
function parkedPartGoal(state: GameState, bot: Bot, bots: readonly Bot[]): Goal | null {
  const merges = tilesOf(state.level, 'merge');
  const parked = tilesOf(state.level, 'counter').filter((t) => {
    const ticket = ticketOnTile(state, t.x, t.y);
    return (
      ticket &&
      isPart(ticket) &&
      !bots.some((b) => b !== bot && b.ticketId === ticket.id) &&
      merges.some((m) => canPutDown(state, ticket, m.x, m.y))
    );
  });
  const tile = nearest(state, bot.playerId, parked);
  if (!tile) return null;
  bot.ticketId = ticketOnTile(state, tile.x, tile.y)?.id ?? null;
  return { tile, action: 'interact' };
}

/** The nearest meeting tile nobody else stands on. */
function meetingGoal(state: GameState, bot: Bot): Goal | null {
  const from = currentTile(state, bot.playerId);
  const others = state.players
    .filter((p) => p.id !== bot.playerId)
    .map((p) => ({ x: Math.round(p.pos.x), y: Math.round(p.pos.y) }));
  const free = state.level.meetingTiles.filter((t) => !others.some((o) => samePoint(o, t)));
  let best: Goal | null = null;
  let bestLength = Infinity;
  for (const tile of free.length > 0 ? free : state.level.meetingTiles) {
    const path = pathTo(state.level, from, tile);
    if (path && path.length < bestLength) {
      best = { tile, action: 'stand' };
      bestLength = path.length;
    }
  }
  return best;
}

function carryGoal(state: GameState, bot: Bot, bots: readonly Bot[], ticket: Ticket): Goal | null {
  // Its order ran out: straight in the bin (or parked on a counter without one).
  if (ticket.expired) {
    const bin = nearest(state, bot.playerId, tilesOf(state.level, 'bin'));
    return bin ? { tile: bin, action: 'interact' } : freeCounterGoal(state, bot, bots);
  }
  const step = bot.skipTests
    ? workableSteps(ticket).find((s) => !OPTIONAL_STEPS.has(s.kind))
    : currentStep(ticket);
  if (!step && isPart(ticket)) {
    // A coded part goes to a merge station: the one holding its other half if there is one.
    const open = tilesOf(state.level, 'merge').filter((t) => canPutDown(state, ticket, t.x, t.y));
    const halves = open.filter((t) => ticketOnTile(state, t.x, t.y));
    const tile = nearest(state, bot.playerId, halves.length > 0 ? halves : open);
    if (tile) return { tile, action: 'interact' };
    // The station is taken (by the same half, or a merged ticket): park it on a free counter.
    const counter = nearest(
      state,
      bot.playerId,
      tilesOf(state.level, 'counter').filter(
        (t) => !ticketOnTile(state, t.x, t.y) && !beltEndsAt(state.level, t),
      ),
    );
    return counter ? { tile: counter, action: 'interact' } : null;
  }
  if (!step) {
    // Only the hotfix ships during an incident: park the rest on a counter, or hold on.
    if (shipBlockedBy(state, ticket)) return freeCounterGoal(state, bot, bots);
    const tile = nearest(state, bot.playerId, tilesOf(state.level, 'ship'));
    return tile ? { tile, action: 'interact' } : null;
  }
  const empty = tilesOf(state.level, STEP_TILE[step.kind]).filter(
    (t) =>
      !state.tickets.some(
        (o) => o.location.kind === 'tile' && o.location.x === t.x && o.location.y === t.y,
      ),
  );
  const free = empty.filter(
    (t) => !isBroken(state, t) && !bots.some((b) => b !== bot && samePoint(b.dropTarget, t)),
  );
  const tile = nearest(state, bot.playerId, free);
  if (!tile) {
    // Every pipeline is busy or broken: fix one, ticket in hand.
    const broken = nearest(
      state,
      bot.playerId,
      empty.filter((t) => isBroken(state, t)),
    );
    return broken ? { tile: broken, action: 'work' } : null;
  }
  bot.dropTarget = tile;
  return { tile, action: 'interact' };
}

/** The nearest review station with a ticket waiting for more reviewers than are on their way. */
function reviewHelpGoal(state: GameState, bot: Bot, bots: readonly Bot[]): Goal | null {
  const waiting = tilesOf(state.level, 'review').filter((t) => {
    const ticket = ticketOnTile(state, t.x, t.y);
    if (!ticket || !workableStep(ticket, 'review')) return false;
    const coming = bots.filter(
      (b) => b !== bot && (b.ticketId === ticket.id || samePoint(b.helping, t)),
    ).length;
    return coming < REVIEWERS_NEEDED;
  });
  const tile = nearest(state, bot.playerId, waiting);
  if (!tile) return null;
  bot.helping = tile;
  return { tile, action: 'work', besideOthers: true };
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
  const blocked = managerTiles(state);
  if (goal.action === 'stand') {
    const walk =
      pathTo(state.level, from, goal.tile, blocked) ?? pathTo(state.level, from, goal.tile);
    const next = walk?.[0];
    if (next) input.move = unit(next.x - player.pos.x, next.y - player.pos.y);
    bot.interactWas = false;
    return input;
  }
  const others = goal.besideOthers
    ? state.players
        .filter((p) => p.id !== bot.playerId)
        .map((p) => ({ x: Math.round(p.pos.x), y: Math.round(p.pos.y) }))
    : [];
  const path =
    findPath(state.level, from, goal.tile, others, blocked) ??
    findPath(state.level, from, goal.tile, others);
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
  ordersCreated: number;
  openOrdersAtEnd: number;
  shipped: number;
  shippedBugs: number;
  shippedUntested: number;
  /** Shipped orders that needed a review. */
  shippedReviewed: number;
  shippedIncidents: number;
  expired: number;
  expiredBugs: number;
  expiredIncidents: number;
  meetingsAttended: number;
  meetingsMissed: number;
  managerBumps: number;
  shippedByDomain: Record<TicketDomain, number>;
  expiredByDomain: Record<TicketDomain, number>;
  ordersByRecipeDomain: Record<string, number>;
  /** Resolved player-work ticks; counts only contributors reported by the sim. */
  stationWorkTicks: {
    code: number;
    test: number;
    design: number;
    review: number;
    repair: number;
  };
  /** Station-ticks with resolved work, deduplicated when multiple players share a station. */
  stationBusyTicks: {
    code: number;
    test: number;
    design: number;
    review: number;
    repair: number;
  };
  /** Percent of available station-ticks spent working, with the whole round as denominator. */
  stationUtilization: {
    code: number;
    test: number;
    design: number;
    review: number;
    repair: number;
  };
  travelTicks: number;
  idleTicks: number;
  queueWaitTicks: number;
  handovers: number;
  maxQueueLength: Record<QueueKind, number>;
  result: LevelResult;
}

/** Plays a whole level with `botCount` bots and reports how it went. */
export function runBots(
  level: Level,
  seed: number,
  botCount: number,
  {
    skipTests = false,
    roles,
    assignmentPolicy = 'role-neutral',
  }: {
    skipTests?: boolean;
    roles?: readonly RoleId[];
    assignmentPolicy?: BotAssignmentPolicy;
  } = {},
): BotRunSummary {
  const ids = Array.from({ length: botCount }, (_, i) => i + 1);
  if (roles && roles.length !== botCount) {
    throw new Error(`Expected ${botCount} role ids, received ${roles.length}`);
  }
  const roleByPlayer: Partial<Record<PlayerId, RoleId>> = {};
  ids.forEach((id, index) => {
    roleByPlayer[id] = roles?.[index] ?? 'generalist';
  });
  const state = createGame(level, seed, ids, roleByPlayer);
  const bots = ids.map((id) => createBot(id, skipTests, assignmentPolicy));
  const summary: Omit<BotRunSummary, 'result'> = {
    shipped: 0,
    shippedBugs: 0,
    shippedUntested: 0,
    shippedReviewed: 0,
    shippedIncidents: 0,
    expired: 0,
    expiredBugs: 0,
    expiredIncidents: 0,
    ordersCreated: 0,
    openOrdersAtEnd: 0,
    meetingsAttended: 0,
    meetingsMissed: 0,
    managerBumps: 0,
    shippedByDomain: { general: 0, frontend: 0, backend: 0, infra: 0, mixed: 0 },
    expiredByDomain: { general: 0, frontend: 0, backend: 0, infra: 0, mixed: 0 },
    ordersByRecipeDomain: {},
    stationWorkTicks: { code: 0, test: 0, design: 0, review: 0, repair: 0 },
    stationBusyTicks: { code: 0, test: 0, design: 0, review: 0, repair: 0 },
    stationUtilization: { code: 0, test: 0, design: 0, review: 0, repair: 0 },
    travelTicks: 0,
    idleTicks: 0,
    queueWaitTicks: 0,
    handovers: 0,
    maxQueueLength: { feature: 0, bug: 0 },
  };
  const stationTile = {
    code: 'keyboard',
    test: 'testBench',
    design: 'whiteboard',
    review: 'review',
    repair: 'pipeline',
  } as const;
  const stationCounts = {
    code: countTiles(state.level, stationTile.code),
    test: countTiles(state.level, stationTile.test),
    design: countTiles(state.level, stationTile.design),
    review: countTiles(state.level, stationTile.review),
    repair: countTiles(state.level, stationTile.repair),
  };
  while (!state.result) {
    const inputs = bots.map((bot) => botInput(state, bot, bots));
    for (const bot of bots) {
      const ticket = state.tickets.find((candidate) => candidate.id === bot.ticketId);
      if (ticket?.location.kind !== 'queue') continue;
      const head = queuedTickets(state, ticket.location.queue)[0];
      if (head?.id !== ticket.id) summary.queueWaitTicks++;
    }
    const priorLocations = new Map(
      state.tickets.map((ticket) => [ticket.id, ticket.location.kind]),
    );
    const priorPositions = new Map(
      state.players.map((player) => [player.id, { x: player.pos.x, y: player.pos.y }]),
    );
    tick(state, inputs);
    const workingPlayers = new Set(state.workFeedback.map(({ playerId }) => playerId));
    const activeStations = {
      code: new Set<number>(),
      test: new Set<number>(),
      design: new Set<number>(),
      review: new Set<number>(),
      repair: new Set<number>(),
    };
    const recordStation = (task: keyof typeof stationTile, playerId: PlayerId): void => {
      const { x, y } = targetTile(state, playerId);
      activeStations[task].add(y * state.level.width + x);
    };
    for (const feedback of state.workFeedback) {
      if (feedback.task === 'code') {
        summary.stationWorkTicks.code++;
        recordStation('code', feedback.playerId);
      }
      if (feedback.task === 'test') {
        summary.stationWorkTicks.test++;
        recordStation('test', feedback.playerId);
      }
      if (feedback.task === 'design') {
        summary.stationWorkTicks.design++;
        recordStation('design', feedback.playerId);
      }
      if (feedback.task === 'review') {
        summary.stationWorkTicks.review++;
        recordStation('review', feedback.playerId);
      }
      if (feedback.task === 'repair') {
        summary.stationWorkTicks.repair++;
        recordStation('repair', feedback.playerId);
      }
    }
    summary.stationBusyTicks.code += activeStations.code.size;
    summary.stationBusyTicks.test += activeStations.test.size;
    summary.stationBusyTicks.design += activeStations.design.size;
    summary.stationBusyTicks.review += activeStations.review.size;
    summary.stationBusyTicks.repair += activeStations.repair.size;
    for (const player of state.players) {
      const before = priorPositions.get(player.id);
      if (!before) throw new Error(`Missing prior position for player ${player.id}`);
      if (Math.hypot(player.pos.x - before.x, player.pos.y - before.y) > 1e-6) {
        summary.travelTicks++;
      } else {
        const input = inputs.find((candidate) => candidate.playerId === player.id);
        if (input && !workingPlayers.has(player.id) && !input.interact) summary.idleTicks++;
      }
    }
    for (const e of state.events) {
      if (e.type === 'orderCreated') {
        summary.ordersCreated++;
        const key = `created:${e.order.kind}:${e.order.domain}`;
        summary.ordersByRecipeDomain[key] = (summary.ordersByRecipeDomain[key] ?? 0) + 1;
      }
      if (e.type === 'orderShipped') {
        summary.shipped++;
        if (e.order.kind === 'bug') summary.shippedBugs++;
        if (e.untested) summary.shippedUntested++;
        if (e.order.steps.includes('review')) summary.shippedReviewed++;
        if (e.order.kind === 'incident') summary.shippedIncidents++;
        summary.shippedByDomain[e.order.domain]++;
        const key = `shipped:${e.order.kind}:${e.order.domain}`;
        summary.ordersByRecipeDomain[key] = (summary.ordersByRecipeDomain[key] ?? 0) + 1;
      }
      if (e.type === 'orderExpired') {
        summary.expired++;
        if (e.order.kind === 'bug') summary.expiredBugs++;
        if (e.order.kind === 'incident') summary.expiredIncidents++;
        summary.expiredByDomain[e.order.domain]++;
        const key = `expired:${e.order.kind}:${e.order.domain}`;
        summary.ordersByRecipeDomain[key] = (summary.ordersByRecipeDomain[key] ?? 0) + 1;
      }
      if (e.type === 'pickedUp' && priorLocations.get(e.ticketId) === 'tile') summary.handovers++;
      if (e.type === 'meetingAttended') summary.meetingsAttended++;
      if (e.type === 'meetingMissed') summary.meetingsMissed++;
      if (e.type === 'managerBumped') summary.managerBumps++;
    }
    summary.maxQueueLength.feature = Math.max(
      summary.maxQueueLength.feature,
      queuedTickets(state, 'feature').length,
    );
    summary.maxQueueLength.bug = Math.max(
      summary.maxQueueLength.bug,
      queuedTickets(state, 'bug').length,
    );
  }
  summary.openOrdersAtEnd = state.orders.length;
  for (const task of ['code', 'test', 'design', 'review', 'repair'] as const) {
    const capacity = stationCounts[task] * level.durationTicks;
    summary.stationUtilization[task] =
      capacity === 0 ? 0 : (100 * summary.stationBusyTicks[task]) / capacity;
  }
  return { ...summary, result: state.result };
}

function countTiles(map: LevelMap, tile: Tile): number {
  let count = 0;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (getTile(map, x, y) === tile) count++;
    }
  }
  return count;
}
