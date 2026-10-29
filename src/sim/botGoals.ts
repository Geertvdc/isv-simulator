/** What a bot wants to do next: which tile to walk to and what to do there. */

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
import { type GridPoint, type LevelMap, type Tile, getTile } from './level';
import { shipBlockedBy } from './orders';
import { inviteFor } from './meetings';
import { pathTo } from './path';
import { isBroken } from './pipeline';
import { roleWorkRate, type RoleId } from './roles';
import { type GameState, getPlayer } from './state';
import {
  OPTIONAL_STEPS,
  QUEUE_TILE,
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
import type { Bot } from './bot';
import { currentTile, findPath, nearest, samePoint, tilesOf } from './botNav';

/** Where each step gets done. */
const STEP_TILE: Readonly<Record<StepKind, Tile>> = {
  design: 'whiteboard',
  code: 'keyboard',
  merge: 'merge',
  review: 'review',
  test: 'testBench',
  pipeline: 'pipeline',
};

/** `stand` means: stand on the tile itself (a meeting room tile), not next to it. */
export type Action = 'interact' | 'work' | 'wait' | 'stand';

export interface Goal {
  tile: GridPoint;
  action: Action;
  /** Stand next to the tile somewhere no other player stands, so two can work it. */
  besideOthers?: boolean;
}

/** What `bot` wants to do next. */
export function chooseGoal(state: GameState, bot: Bot, bots: readonly Bot[]): Goal | null {
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
