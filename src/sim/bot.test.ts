import { describe, expect, it } from 'vitest';
import { PIPELINE_FAIL_TICKS, REPAIR_TICKS, TICKS_PER_SECOND } from './balance';
import { type Bot, botInput, createBot, findPath, runBots } from './bot';
import { getTile, parseLevelMap } from './level';
import { DOWN_THE_HALL, GARAGE, levelWithMap } from './levels';
import { TICKET_STEPS, type Ticket } from './tickets';
import { createOrder } from './orders';
import { type GameState, type PlayerId, createGame } from './state';
import { pipelineAt } from './pipeline';
import { COL, addTicket, give, idle, newTestGame } from './testing';
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

  it('assigns later queued tickets by role and waits for them to reach the queue head', () => {
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
    expect(backendBot.ticketId).toBe(backendTicket.id);
    expect(backendCommand.interact).toBe(false);
  });

  it('parks a finished feature on a counter during an incident and ships it after', () => {
    const state = newTestGame();
    const feature = createOrder(state, 'feature', 'Feature');
    const incident = createOrder(state, 'incident', 'Prod is down');
    feature.expiresTick = incident.expiresTick = 100_000;
    // Just the finished feature: no queued tickets to distract the bot.
    state.tickets = [];
    const ticket = addTicket(state, COL.floor, {
      done: TICKET_STEPS.feature.length,
      orderId: feature.id,
    });
    give(1, ticket);
    const bot = createBot(1);
    const play = (seconds: number): void => {
      for (let i = 0; i < seconds * TICKS_PER_SECOND; i++) {
        tick(state, [botInput(state, bot, [bot])]);
      }
    };

    play(10);
    expect(state.events.some((e) => e.type === 'shipBlocked')).toBe(false);
    expect(ticket.location.kind).toBe('tile');
    const at = ticket.location.kind === 'tile' ? ticket.location : null;
    expect(getTile(state.level, at?.x ?? -1, at?.y ?? -1)).toBe('counter');
    expect(state.orders).toContain(feature);

    state.orders = state.orders.filter((o) => o !== incident);
    let shipped = false;
    for (let i = 0; i < 15 * TICKS_PER_SECOND && !shipped; i++) {
      tick(state, [botInput(state, bot, [bot])]);
      shipped = state.events.some((e) => e.type === 'orderShipped');
    }
    expect(shipped).toBe(true);
    expect(state.orders).not.toContain(feature);
  });

  it('bins an expired ticket it carries instead of shipping it', () => {
    const state = newTestGame();
    const order = createOrder(state, 'feature', 'Late');
    state.tickets = [];
    const ticket = addTicket(state, COL.floor, {
      done: TICKET_STEPS.feature.length,
      orderId: order.id,
    });
    ticket.expired = true;
    give(1, ticket);
    const same = createOrder(state, 'feature', 'Same steps');
    same.expiresTick = 100_000;
    state.tickets = state.tickets.filter((t) => t === ticket);
    const bot = createBot(1);
    for (let i = 0; i < 10 * TICKS_PER_SECOND && state.tickets.includes(ticket); i++) {
      tick(state, [botInput(state, bot, [bot])]);
    }
    expect(state.tickets).not.toContain(ticket);
    expect(state.orders).toContain(same);
  });

  it('fetches an expired ticket off a counter and bins it', () => {
    const state = newTestGame();
    const ticket = addTicket(state, COL.counter, { done: 1 });
    ticket.expired = true;
    const bot = createBot(1);
    for (let i = 0; i < 10 * TICKS_PER_SECOND && state.tickets.includes(ticket); i++) {
      tick(state, [botInput(state, bot, [bot])]);
    }
    expect(state.tickets).not.toContain(ticket);
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
        orderId: 0,
        expired: false,
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
