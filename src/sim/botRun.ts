/** Headless whole-level bot runs for tuning and benchmarks. */

import { type LevelMap, type Tile, getTile } from './level';
import type { Level } from './levels';
import { type LevelResult } from './orders';
import { type RoleId, type TicketDomain } from './roles';
import { type PlayerId, createGame, targetTile } from './state';
import { tick } from './tick';
import { type QueueKind, queuedTickets } from './tickets';
import { type BotAssignmentPolicy, botInput, createBot } from './bot';

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
