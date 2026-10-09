import { describe, expect, it } from 'vitest';
import {
  BUG_CHANCE,
  BUG_CHANCE_UNTESTED,
  BUG_DELAY_TICKS,
  BUG_EXPIRED_PENALTY,
  BUG_ORDER_POINTS,
  EXPIRED_PENALTY,
  ORDER_POINTS,
  ORDER_SPEED_BONUS_MAX,
} from './balance';
import { GARAGE } from './levels';
import { type Order, bugChance, createOrder, shipPoints, starsFor } from './orders';
import { createGame } from './state';
import { COL, addTicket, give, idle, newTestGame, press, standAt } from './testing';
import { tick } from './tick';
import { queuedTickets } from './tickets';

const SCHEDULE = newTestGame().settings.orderSchedule;

/** A game whose feature orders run on the garage schedule. */
function scheduledGame(seed = 1): ReturnType<typeof newTestGame> {
  const state = newTestGame({ durationTicks: Number.MAX_SAFE_INTEGER });
  state.seed = seed;
  state.rngState = seed;
  state.nextOrderTick = SCHEDULE.firstOrderTick;
  return state;
}

/** Ticks at which feature orders opened, shipping each away at once so the cap never bites. */
function orderTicks(state: ReturnType<typeof newTestGame>, ticks: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < ticks; i++) {
    tick(state, []);
    for (const e of state.events) {
      if (e.type === 'orderCreated') result.push(e.order.createdTick);
    }
    state.orders = [];
    state.tickets = [];
  }
  return result;
}

describe('order schedule', () => {
  it('opens the first order on firstOrderTick, with its ticket in the inbox', () => {
    const state = scheduledGame();
    idle(state, SCHEDULE.firstOrderTick + 1);
    expect(state.orders).toHaveLength(1);
    const [order] = state.orders;
    expect(order).toMatchObject({
      kind: 'feature',
      steps: ['code', 'test', 'pipeline'],
      createdTick: SCHEDULE.firstOrderTick,
      expiresTick: SCHEDULE.firstOrderTick + SCHEDULE.timeLimitTicks,
    });
    expect(queuedTickets(state, 'feature')).toHaveLength(1);
  });

  it('opens orders every intervalTicks give or take the jitter', () => {
    const state = scheduledGame();
    const ticks = orderTicks(state, SCHEDULE.intervalTicks * 20);
    expect(ticks.length).toBeGreaterThan(10);
    const gaps = ticks.slice(1).map((t, i) => t - (ticks[i] ?? 0));
    for (const gap of gaps) {
      expect(gap).toBeGreaterThanOrEqual(SCHEDULE.intervalTicks - SCHEDULE.jitterTicks);
      expect(gap).toBeLessThanOrEqual(SCHEDULE.intervalTicks + SCHEDULE.jitterTicks);
    }
    expect(new Set(gaps).size).toBeGreaterThan(1);
  });

  it('waits while maxOpenOrders feature orders are open, then opens one right away', () => {
    const state = newTestGame({
      orderSchedule: { ...SCHEDULE, intervalTicks: 10, jitterTicks: 0, timeLimitTicks: 100_000 },
    });
    state.nextOrderTick = 0;
    idle(state, 10 * SCHEDULE.maxOpenOrders + 50);
    expect(state.orders).toHaveLength(SCHEDULE.maxOpenOrders);
    createOrder(state, 'bug', 'Bug: x');
    state.orders = state.orders.filter((o) => o.id !== 1);
    idle(state, 1);
    expect(state.orders.filter((o) => o.kind === 'feature')).toHaveLength(SCHEDULE.maxOpenOrders);
  });

  it('is deterministic per seed', () => {
    const a = orderTicks(scheduledGame(7), SCHEDULE.intervalTicks * 10);
    expect(orderTicks(scheduledGame(7), SCHEDULE.intervalTicks * 10)).toEqual(a);
    expect(orderTicks(scheduledGame(8), SCHEDULE.intervalTicks * 10)).not.toEqual(a);
  });
});

describe('expiry', () => {
  it('removes the order, applies the penalty and takes a waiting ticket out of its queue', () => {
    const state = newTestGame();
    state.score = 50;
    const order = createOrder(state, 'feature', 'Late');
    idle(state, SCHEDULE.timeLimitTicks - 1);
    expect(state.orders).toEqual([order]);
    tick(state, []);
    expect(state.orders).toEqual([]);
    expect(state.score).toBe(50 - EXPIRED_PENALTY);
    expect(state.events).toEqual([{ type: 'orderExpired', order, penalty: EXPIRED_PENALTY }]);
    expect(queuedTickets(state, 'feature')).toEqual([]);
  });

  it('leaves tickets that are already in progress alone', () => {
    const state = newTestGame();
    createOrder(state, 'feature', 'Late');
    const t = queuedTickets(state, 'feature')[0];
    if (!t) throw new Error('no ticket');
    give(1, t);
    idle(state, SCHEDULE.timeLimitTicks);
    expect(state.orders).toEqual([]);
    expect(state.tickets).toEqual([t]);
  });

  it('never takes the score below 0', () => {
    const state = newTestGame();
    state.score = 3;
    createOrder(state, 'feature', 'Late');
    idle(state, SCHEDULE.timeLimitTicks);
    expect(state.score).toBe(0);
  });

  it('expired bugs cost BUG_EXPIRED_PENALTY', () => {
    const state = newTestGame();
    state.score = 100;
    createOrder(state, 'bug', 'Bug: x');
    idle(state, SCHEDULE.bugTimeLimitTicks);
    expect(state.score).toBe(100 - BUG_EXPIRED_PENALTY);
  });

  it('bug orders run out faster than features', () => {
    const state = newTestGame();
    const bug = createOrder(state, 'bug', 'Bug: x');
    expect(bug.expiresTick - bug.createdTick).toBe(SCHEDULE.bugTimeLimitTicks);
    expect(SCHEDULE.bugTimeLimitTicks).toBeLessThan(SCHEDULE.timeLimitTicks);
    expect(bug.steps).toEqual(['test', 'code', 'test', 'pipeline']);
    expect(queuedTickets(state, 'bug')).toHaveLength(1);
  });
});

describe('ship', () => {
  /** Player 1 at the ship tile carrying a finished ticket of `kind`. */
  function readyToShip(kind: 'feature' | 'bug' = 'feature'): {
    state: ReturnType<typeof newTestGame>;
    ticket: ReturnType<typeof addTicket>;
  } {
    const state = newTestGame();
    const ticket = addTicket(state, COL.counter, { kind, done: 4 });
    give(1, ticket);
    standAt(state, 1, COL.ship);
    return { state, ticket };
  }

  it('completes the matching order with the least time left', () => {
    const { state, ticket } = readyToShip();
    const later = createOrder(state, 'feature', 'Later');
    idle(state, 5);
    const sooner: Order = { ...later, id: 99, expiresTick: later.expiresTick - 100 };
    state.orders.push(sooner);
    const bug = createOrder(state, 'bug', 'Bug');
    press(state);
    expect(state.tickets).not.toContain(ticket);
    expect(state.orders.map((o) => o.id)).toEqual([later.id, bug.id]);
    expect(state.score).toBe(shipPoints(sooner, state.tick - 2));
  });

  it('reports the ship with its points', () => {
    const { state } = readyToShip();
    const order = createOrder(state, 'feature', 'X');
    tick(state, [
      {
        playerId: 1,
        tick: state.tick,
        move: { x: 0, y: 0 },
        interact: true,
        work: false,
        dash: false,
      },
    ]);
    const shipped = state.events.find((e) => e.type === 'orderShipped');
    expect(shipped).toEqual({
      type: 'orderShipped',
      order,
      points: state.score,
      playerId: 1,
      untested: false,
    });
  });

  it('ships untested tickets, flagged as untested', () => {
    const state = newTestGame();
    const ticket = addTicket(state, COL.counter, { done: 1 });
    const pipeline = ticket.steps[2];
    if (pipeline) pipeline.progress = 1;
    give(1, ticket);
    standAt(state, 1, COL.ship);
    createOrder(state, 'feature', 'X');
    tick(state, [
      {
        playerId: 1,
        tick: state.tick,
        move: { x: 0, y: 0 },
        interact: true,
        work: false,
        dash: false,
      },
    ]);
    expect(state.tickets).not.toContain(ticket);
    expect(state.events.find((e) => e.type === 'orderShipped')).toMatchObject({ untested: true });
  });

  it('refuses tickets that have not been through the pipeline', () => {
    const state = newTestGame();
    const ticket = addTicket(state, COL.counter, { done: 2, progress: 0.9 });
    give(1, ticket);
    standAt(state, 1, COL.ship);
    createOrder(state, 'feature', 'X');
    press(state);
    expect(ticket.location).toEqual({ kind: 'player', playerId: 1 });
    expect(state.orders).toHaveLength(1);
  });

  it('ships tickets whose order already expired, for no points', () => {
    const { state, ticket } = readyToShip('bug');
    const feature = createOrder(state, 'feature', 'X');
    state.score = 50;
    tick(state, [
      {
        playerId: 1,
        tick: state.tick,
        move: { x: 0, y: 0 },
        interact: true,
        work: false,
        dash: false,
      },
    ]);
    expect(state.tickets).not.toContain(ticket);
    expect(state.orders).toEqual([feature]);
    expect(state.score).toBe(50);
    expect(state.events.find((e) => e.type === 'orderShipped')).toMatchObject({
      order: null,
      points: 0,
    });
  });

  it(`sends about ${BUG_CHANCE * 100}% of ships back as a bug after BUG_DELAY_TICKS`, () => {
    let bugs = 0;
    const runs = 400;
    for (let seed = 0; seed < runs; seed++) {
      const { state, ticket } = readyToShip();
      state.rngState = seed * 7919;
      ticket.title = 'Center a div';
      createOrder(state, 'feature', 'X');
      press(state);
      if (state.pendingBugs.length === 0) continue;
      bugs++;
      const shippedAt = state.tick - 2;
      expect(state.pendingBugs).toEqual([
        { tick: shippedAt + BUG_DELAY_TICKS, title: 'Bug: Center a div' },
      ]);
      idle(state, BUG_DELAY_TICKS - 2);
      expect(state.orders.filter((o) => o.kind === 'bug')).toHaveLength(0);
      idle(state, 1);
      expect(state.orders.filter((o) => o.kind === 'bug')).toHaveLength(1);
      expect(queuedTickets(state, 'bug').map((t) => t.title)).toEqual(['Bug: Center a div']);
    }
    expect(bugs / runs).toBeGreaterThan(BUG_CHANCE - 0.07);
    expect(bugs / runs).toBeLessThan(BUG_CHANCE + 0.07);
  });
});

describe('bug chance', () => {
  it('goes from BUG_CHANCE fully tested to BUG_CHANCE_UNTESTED with every test skipped', () => {
    const state = newTestGame();
    const tested = addTicket(state, COL.counter, { done: 3 });
    expect(bugChance(tested)).toBe(BUG_CHANCE);
    const untested = addTicket(state, COL.counter, { done: 1 });
    expect(bugChance(untested)).toBe(BUG_CHANCE_UNTESTED);
    // A bug fix with one of its two tests skipped lands halfway.
    const half = addTicket(state, COL.counter, { kind: 'bug', done: 4 });
    const repro = half.steps[0];
    if (repro) repro.progress = 0;
    expect(bugChance(half)).toBeCloseTo((BUG_CHANCE + BUG_CHANCE_UNTESTED) / 2);
    expect(BUG_CHANCE_UNTESTED).toBeGreaterThan(BUG_CHANCE);
  });
});

describe('scoring', () => {
  const order: Order = { id: 1, kind: 'feature', steps: [], createdTick: 100, expiresTick: 1100 };

  it('pays base points plus a bonus for the share of time left', () => {
    expect(shipPoints(order, 100)).toBe(ORDER_POINTS + ORDER_SPEED_BONUS_MAX);
    expect(shipPoints(order, 600)).toBe(ORDER_POINTS + Math.round(ORDER_SPEED_BONUS_MAX / 2));
    expect(shipPoints(order, 1100)).toBe(ORDER_POINTS);
  });

  it('bug fixes earn BUG_ORDER_POINTS, no speed bonus', () => {
    const bug: Order = { ...order, kind: 'bug' };
    expect(shipPoints(bug, 100)).toBe(BUG_ORDER_POINTS);
    expect(shipPoints(bug, 1100)).toBe(BUG_ORDER_POINTS);
    expect(BUG_ORDER_POINTS).toBe(0);
  });

  it('gives a star per threshold reached', () => {
    expect(starsFor(0, [10, 20, 30])).toBe(0);
    expect(starsFor(10, [10, 20, 30])).toBe(1);
    expect(starsFor(29, [10, 20, 30])).toBe(2);
    expect(starsFor(500, [10, 20, 30])).toBe(3);
  });
});

describe('level end', () => {
  it('ends at durationTicks with the score and stars, then stops', () => {
    const state = createGame(
      { ...GARAGE, durationTicks: 100, starThresholds: [10, 20, 30] },
      1,
      [1],
    );
    state.score = 25;
    idle(state, 99);
    expect(state.result).toBeNull();
    tick(state, []);
    expect(state.result).toEqual({ score: 25, stars: 2 });
    expect(state.events).toContainEqual({ type: 'levelEnded', result: { score: 25, stars: 2 } });
    const frozen = structuredClone(state);
    tick(state, [
      { playerId: 1, tick: 100, move: { x: 1, y: 0 }, interact: true, work: true, dash: false },
    ]);
    expect(state).toEqual({ ...frozen, events: [] });
  });

  it('the garage lasts 3 minutes', () => {
    expect(GARAGE.durationTicks).toBe(180 * 60);
  });
});
