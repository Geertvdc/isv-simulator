import { describe, expect, it } from 'vitest';
import { PIPELINE_FAIL_TICKS, REPAIR_TICKS, TICKS_PER_SECOND } from './balance';
import { type Bot, botInput, createBot, findPath, runBots } from './bot';
import { getTile, parseLevelMap } from './level';
import { DOWN_THE_HALL, GARAGE, levelById, levelWithMap } from './levels';
import type { Ticket } from './tickets';
import { createOrder } from './orders';
import { type GameState, type PlayerId, createGame } from './state';
import { pipelineAt } from './pipeline';
import { COL, addTicket, idle, newTestGame, standAt } from './testing';
import { tick } from './tick';

describe('findPath', () => {
  const map = parseLevelMap(['#####', '#1.K#', '#2#.#', '#34.#', '#####'].join('\n'));

  it('finds the shortest walk to a tile next to the target', () => {
    expect(findPath(map, { x: 1, y: 3 }, { x: 3, y: 1 })).toEqual([
      { x: 2, y: 3 },
      { x: 3, y: 3 },
      { x: 3, y: 2 },
    ]);
  });

  it('is empty when already standing next to the target', () => {
    expect(findPath(map, { x: 2, y: 1 }, { x: 3, y: 1 })).toEqual([]);
  });

  it('walks around blocked tiles (a manager) when there is a way around', () => {
    const open = parseLevelMap(['#####', '#1.K#', '#2..#', '#34.#', '#####'].join('\n'));
    const path = findPath(open, { x: 1, y: 2 }, { x: 3, y: 1 }, [], [{ x: 2, y: 2 }]);
    expect(path).not.toBeNull();
    expect(path).not.toContainEqual({ x: 2, y: 2 });
  });

  it('is null when the target cannot be reached', () => {
    const walled = parseLevelMap(['######', '#1#.K#', '#2#.##', '#34###', '######'].join('\n'));
    expect(findPath(walled, { x: 1, y: 1 }, { x: 4, y: 1 })).toBeNull();
  });
});

describe('bot run on the garage', () => {
  it('two bots with a fixed seed earn at least 1 star', () => {
    const run = runBots(GARAGE, 1, 2);
    expect(run.shipped).toBeGreaterThan(5);
    expect(run.result.stars).toBeGreaterThanOrEqual(1);
  });

  it('bots that skip tests ship untested and get more bugs', () => {
    const tested = runBots(GARAGE, 1, 2);
    const skipping = runBots(GARAGE, 1, 2, { skipTests: true });
    expect(tested.shippedUntested).toBe(0);
    expect(skipping.shippedUntested).toBe(skipping.shipped);
    expect(skipping.shippedBugs).toBeGreaterThan(tested.shippedBugs);
  });

  it('is deterministic per seed', () => {
    expect(runBots(GARAGE, 3, 2)).toEqual(runBots(GARAGE, 3, 2));
  });

  it('accounts for created, shipped, expired, and remaining orders in benchmark metrics', () => {
    const run = runBots(GARAGE, 9, 2);
    const createdByRecipe = Object.entries(run.ordersByRecipeDomain)
      .filter(([key]) => key.startsWith('created:'))
      .reduce((total, [, count]) => total + count, 0);

    expect(createdByRecipe).toBe(run.ordersCreated);
    expect(run.ordersCreated).toBe(run.shipped + run.expired + run.openOrdersAtEnd);
  });

  it('reports resolved station work and utilization within available station capacity', () => {
    const run = runBots(GARAGE, 5, 2);
    const stationTypes = {
      code: 'keyboard',
      test: 'testBench',
      design: 'whiteboard',
      review: 'review',
      repair: 'pipeline',
    } as const;
    for (const task of ['code', 'test', 'design', 'review', 'repair'] as const) {
      let stationCount = 0;
      for (let y = 0; y < GARAGE.map.height; y++) {
        for (let x = 0; x < GARAGE.map.width; x++) {
          if (getTile(GARAGE.map, x, y) === stationTypes[task]) stationCount++;
        }
      }
      const capacity = stationCount * GARAGE.durationTicks;
      expect(run.stationWorkTicks[task]).toBeGreaterThanOrEqual(run.stationBusyTicks[task]);
      expect(run.stationBusyTicks[task]).toBeLessThanOrEqual(capacity);
      expect(run.stationUtilization[task]).toBeCloseTo(
        capacity === 0 ? 0 : (100 * run.stationBusyTicks[task]) / capacity,
      );
    }
  });

  it('does not strand the three-player mixed role-aware team behind queue heads', () => {
    const level = levelById('lab-roles');
    if (!level) throw new Error('Missing role lab');
    const run = runBots(level, 1, 3, {
      roles: ['generalist', 'frontend', 'qa'],
      assignmentPolicy: 'role-aware',
    });

    expect(run.queueWaitTicks).toBe(0);
  });

  it('accepts explicit role compositions and a role-aware task assignment policy', () => {
    const options = {
      roles: ['frontend', 'qa'] as const,
      assignmentPolicy: 'role-aware' as const,
    };
    expect(runBots(GARAGE, 13, 2, options)).toEqual(runBots(GARAGE, 13, 2, options));
    expect(() => runBots(GARAGE, 13, 2, { roles: ['qa'] })).toThrow(/Expected 2 role ids/);
  });
});

// Every level's 1-star bot runs live in campaign.test.ts.
describe('bot runs', () => {
  it('two bots team up for reviews', () => {
    const run = runBots(DOWN_THE_HALL, 1, 2);
    expect(run.shippedReviewed).toBeGreaterThan(2);
    expect(run.expired).toBeLessThanOrEqual(1);
  });
});

describe('bot and new mechanics', () => {
  it('an invited bot walks to the meeting room and sits the meeting out', () => {
    const map = parseLevelMap(['########', '#1...mm#', '#234.mm#', '########'].join('\n'));
    const meetings = {
      firstTick: 0,
      intervalTicks: 100_000,
      jitterTicks: 0,
      timeLimitTicks: 20 * TICKS_PER_SECOND,
      attendTicks: 4 * TICKS_PER_SECOND,
    };
    const state = createGame(levelWithMap(map, { meetings }), 1, [1]);
    state.nextOrderTick = Number.MAX_SAFE_INTEGER;
    const bot = createBot(1);
    let attended = false;
    for (let i = 0; i < 15 * TICKS_PER_SECOND && !attended; i++) {
      tick(state, [botInput(state, bot, [bot])]);
      attended = state.events.some((e) => e.type === 'meetingAttended');
    }
    expect(attended).toBe(true);
  });

  it('takes the incident hotfix before an older bug', () => {
    const state = newTestGame({
      incidents: { firstTick: 0, intervalTicks: 100_000, jitterTicks: 0, timeLimitTicks: 10_000 },
    });
    state.nextIncidentTick = 1;
    createOrder(state, 'bug', 'Bug: old');
    const bot = createBot(1);
    for (let i = 0; i < 5 * TICKS_PER_SECOND; i++) {
      tick(state, [botInput(state, bot, [bot])]);
      if (state.tickets.some((t) => t.location.kind === 'player')) break;
    }
    const carried = state.tickets.find((t) => t.location.kind === 'player');
    expect(carried?.kind).toBe('incident');
  });

  it('assigns a queued domain to the available bot with the shortest role-adjusted work', () => {
    const state = newTestGame();
    createOrder(state, 'feature', 'Frontend work', undefined, 'frontend');
    const queued = state.tickets[0];
    if (!queued) throw new Error('Missing queued feature ticket');
    const generalist = state.players.find((player) => player.id === 1);
    const frontend = state.players.find((player) => player.id === 2);
    if (!generalist || !frontend) throw new Error('Missing bot players');
    generalist.roleId = 'backend';
    frontend.roleId = 'frontend';
    const bots = [createBot(1, false, 'role-aware'), createBot(2, false, 'role-aware')];
    const inputs = bots.map((bot) => botInput(state, bot, bots));
    expect(bots[0]?.ticketId).toBeNull();
    expect(bots[1]?.ticketId).toBe(queued.id);
    expect(inputs[0]?.interact).toBe(false);
  });

  it('does not let an unassigned role-aware bot take a reserved queue ticket', () => {
    const state = newTestGame();
    const reserved = createOrder(state, 'feature', 'Reserved work', undefined, 'frontend');
    const queued = state.tickets.find(
      (ticket) => ticket.kind === 'feature' && ticket.domain === reserved.domain,
    );
    if (!queued) throw new Error('Missing reserved feature ticket');
    const assigned = createBot(1, false, 'role-aware');
    const unassigned = createBot(2, false, 'role-aware');
    assigned.ticketId = queued.id;

    const command = botInput(state, unassigned, [assigned, unassigned]);

    expect(unassigned.ticketId).toBeNull();
    expect(command.interact).toBe(false);
  });

  it('compares walking distance and role work in the same tick units', () => {
    const state = newTestGame();
    const order = createOrder(state, 'feature', 'Work', undefined, 'frontend');
    const farBot = createBot(1, false, 'role-aware');
    const nearBot = createBot(2, false, 'role-aware');
    const farPlayer = state.players.find((player) => player.id === 1);
    const nearPlayer = state.players.find((player) => player.id === 2);
    if (!farPlayer || !nearPlayer) throw new Error('Missing bot players');
    farPlayer.roleId = 'frontend';
    nearPlayer.roleId = 'generalist';
    const bots = [farBot, nearBot];
    standAt(state, 1, 11);
    standAt(state, 2, 2);

    botInput(state, farBot, bots);
    botInput(state, nearBot, bots);

    expect(farBot.ticketId).toBeNull();
    expect(nearBot.ticketId).toBe(order.id);
  });

  it('breaks equal assignment costs by player id, independent of bot list order', () => {
    const state = newTestGame();
    const order = createOrder(state, 'feature', 'Work');
    const higherId = createBot(2, false, 'role-aware');
    const lowerId = createBot(1, false, 'role-aware');
    const bots = [higherId, lowerId];
    standAt(state, 1, 2);
    standAt(state, 2, 2);

    botInput(state, higherId, bots);
    botInput(state, lowerId, bots);

    expect(higherId.ticketId).toBeNull();
    expect(lowerId.ticketId).toBe(order.id);
  });

  it('does not reserve a later queued ticket while the queue head is being fetched', () => {
    const state = newTestGame();
    createOrder(state, 'feature', 'Frontend work', undefined, 'frontend');
    createOrder(state, 'feature', 'Backend work', undefined, 'backend');
    const frontendTicket = state.tickets.find((ticket) => ticket.domain === 'frontend');
    const backendTicket = state.tickets.find((ticket) => ticket.domain === 'backend');
    const frontendPlayer = state.players.find((player) => player.id === 1);
    const backendPlayer = state.players.find((player) => player.id === 2);
    if (!frontendTicket || !backendTicket || !frontendPlayer || !backendPlayer) {
      throw new Error('Missing queued tickets or players');
    }
    frontendPlayer.roleId = 'frontend';
    backendPlayer.roleId = 'backend';
    const frontendBot = createBot(1, false, 'role-aware');
    const backendBot = createBot(2, false, 'role-aware');

    botInput(state, frontendBot, [frontendBot, backendBot]);
    const backendCommand = botInput(state, backendBot, [frontendBot, backendBot]);

    expect(frontendBot.ticketId).toBe(frontendTicket.id);
    expect(backendBot.ticketId).toBeNull();
    expect(backendCommand.interact).toBe(false);
    expect(backendTicket.location.kind).toBe('queue');
  });

  it('does not reserve queue work for an invited bot and releases existing reservations', () => {
    const state = newTestGame();
    const order = createOrder(state, 'feature', 'Work');
    const ticket = state.tickets.find((candidate) => candidate.id === order.id);
    if (!ticket) throw new Error('Missing queued feature ticket');
    state.invites.push({
      id: 1,
      playerId: 1,
      title: 'Planning meeting',
      createdTick: 0,
      expiresTick: 100,
      attendedTicks: 0,
      attendTicks: 30,
    });
    const invited = createBot(1, false, 'role-aware');
    const available = createBot(2, false, 'role-aware');
    invited.ticketId = ticket.id;
    const bots = [invited, available];

    botInput(state, invited, bots);

    expect(invited.ticketId).toBeNull();
    botInput(state, available, bots);
    expect(available.ticketId).toBe(ticket.id);
  });
});

describe('bot and a broken pipeline', () => {
  it('takes its ticket out, repairs the pipeline and builds again', () => {
    const state = newTestGame();
    const ticket = addTicket(state, COL.pipeline, { done: 3 });
    idle(state, PIPELINE_FAIL_TICKS);
    expect(pipelineAt(state, COL.pipeline, 1)?.broken).toBe(true);

    const bot = createBot(1);
    bot.ticketId = ticket.id;
    for (let i = 0; i < REPAIR_TICKS + 10 * TICKS_PER_SECOND; i++) {
      tick(state, [botInput(state, bot, [bot])]);
      if (ticket.location.kind === 'tile' && !pipelineAt(state, COL.pipeline, 1)?.broken) break;
    }
    expect(pipelineAt(state, COL.pipeline, 1)?.broken).toBe(false);
    expect(ticket.location).toEqual({ kind: 'tile', x: COL.pipeline, y: 1 });
  });
});

describe('bots and full-stack features', () => {
  /** Inbox, two keyboards, merge station, two counters, test bench, pipeline, ship. */
  const MERGE_MAP = [
    '###########',
    '#IKKGCCTPS#',
    '#.........#',
    '#1234.....#',
    '###########',
  ].join('\n');

  function mergeGame(): GameState {
    const state = createGame(levelWithMap(parseLevelMap(MERGE_MAP)), 1, [1, 2]);
    state.nextOrderTick = Number.MAX_SAFE_INTEGER;
    return state;
  }

  function play(state: GameState, bots: Bot[], seconds: number): void {
    for (let i = 0; i < seconds * TICKS_PER_SECOND; i++) {
      tick(
        state,
        bots.map((b) => botInput(state, b, bots)),
      );
    }
  }

  it('code both halves, merge them and ship the full-stack order', () => {
    const state = mergeGame();
    createOrder(state, 'fullstack', 'Checkout');
    const before = state.score;
    play(state, [createBot(1), createBot(2)], 40);
    expect(state.orders).toHaveLength(0);
    expect(state.score).toBeGreaterThan(before);
  });

  it('park a half on a counter when the merge station holds the same half', () => {
    const state = mergeGame();
    const part = (playerId: PlayerId | null): Ticket => {
      const t: Ticket = {
        id: state.nextTicketId++,
        kind: 'frontend',
        domain: 'frontend',
        title: 'Checkout',
        steps: [{ kind: 'code', progress: 1 }],
        location: playerId === null ? { kind: 'tile', x: 4, y: 1 } : { kind: 'player', playerId },
      };
      state.tickets.push(t);
      return t;
    };
    part(null);
    const held = part(1);
    play(state, [createBot(1)], 5);
    expect(held.location.kind).toBe('tile');
    if (held.location.kind === 'tile') {
      expect(getTile(state.level, held.location.x, held.location.y)).toBe('counter');
    }
  });
});
