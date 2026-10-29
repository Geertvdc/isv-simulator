import { describe, expect, it } from 'vitest';
import {
  DESIGNED_CODE_FACTOR,
  DESIGNED_ORDER_POINTS,
  DESIGNED_TIME_FACTOR,
  DESIGN_RATE,
  ORDER_POINTS,
  PAIR_RATE,
  THROW_HOLD_TICKS,
  WORK_RATE,
} from './balance';
import { canPutDown, interact } from './interact';
import { parseLevelMap } from './level';
import { type LevelSettings, levelWithMap } from './levels';
import { createOrder, expireOrders, shipPoints, shipTicket } from './orders';
import { type GameState, type PlayerId, type Vec, createGame, getPlayer } from './state';
import { cmd } from './testing';
import { tick } from './tick';
import {
  DESIGNED_FEATURE_STEPS,
  TICKET_STEPS,
  type Ticket,
  type TicketKind,
  loseTicket,
  queuedTickets,
  ticketOnTile,
} from './tickets';

/**
 * Row 1: whiteboard at x=2, merge station at x=4, keyboard at x=6, counter
 * at x=8; players stand on row 2 to use them. Row 4 has a keyboard at x=6
 * with floor above and below it, for pairing.
 */
const MAP = [
  '##########',
  '#.W.G.K.C#',
  '#........#',
  '#........#',
  '#.....K..#',
  '#12..4..3#',
  '##########',
].join('\n');

function newGame(settings: Partial<LevelSettings> = {}): GameState {
  const state = createGame(levelWithMap(parseLevelMap(MAP), settings), 1, [1, 2]);
  state.nextOrderTick = Number.MAX_SAFE_INTEGER;
  return state;
}

function place(state: GameState, id: PlayerId, pos: Vec, facing: Vec): void {
  const p = getPlayer(state, id);
  if (!p) throw new Error(`No player ${id}`);
  p.pos = { ...pos };
  p.facing = { ...facing };
}

function ticket(
  state: GameState,
  kind: TicketKind,
  done: number,
  steps = TICKET_STEPS[kind],
  orderId = 0,
): Ticket {
  const t: Ticket = {
    id: state.nextTicketId++,
    kind,
    domain: kind === 'frontend' ? 'frontend' : kind === 'backend' ? 'backend' : 'general',
    title: 'Checkout',
    steps: steps.map((k, i) => ({ kind: k, progress: i < done ? 1 : 0 })),
    location: { kind: 'queue', queue: 'feature' },
    orderId,
    expired: false,
  };
  state.tickets.push(t);
  return t;
}

function workFor(state: GameState, ticks: number, ...ids: PlayerId[]): void {
  for (let i = 0; i < ticks; i++)
    tick(
      state,
      ids.map((id) => cmd(state, id, { work: true })),
    );
}

describe('design at the whiteboard', () => {
  it('is worked by hand at the whiteboard, as the first step of a designed feature', () => {
    const state = newGame();
    const t = ticket(state, 'feature', 0, DESIGNED_FEATURE_STEPS);
    t.location = { kind: 'tile', x: 2, y: 1 };
    place(state, 1, { x: 2, y: 2 }, { x: 0, y: -1 });
    workFor(state, 10, 1);
    expect(t.steps[0]?.progress).toBeCloseTo(DESIGN_RATE * 10);
    expect(t.steps[1]?.progress).toBe(0);
  });

  it('does nothing for a ticket whose design is done or that has none', () => {
    const state = newGame();
    const t = ticket(state, 'feature', 0);
    t.location = { kind: 'tile', x: 2, y: 1 };
    place(state, 1, { x: 2, y: 2 }, { x: 0, y: -1 });
    workFor(state, 10, 1);
    expect(t.steps.every((s) => s.progress === 0)).toBe(true);
  });
});

describe('merging a front end and a back end', () => {
  it('takes a coded part, then merges its other half into one full-stack ticket', () => {
    const state = newGame();
    const front = ticket(state, 'frontend', 1);
    const back = ticket(state, 'backend', 1);
    front.location = { kind: 'tile', x: 4, y: 1 };
    back.location = { kind: 'player', playerId: 1 };
    place(state, 1, { x: 4, y: 2 }, { x: 0, y: -1 });
    tick(state, [cmd(state, 1, { interact: true })]);
    const merged = ticketOnTile(state, 4, 1);
    expect(merged?.kind).toBe('fullstack');
    expect(merged?.steps.map((s) => [s.kind, s.progress])).toEqual([
      ['code', 1],
      ['merge', 1],
      ['test', 0],
      ['pipeline', 0],
    ]);
    expect(state.tickets).not.toContain(front);
    expect(state.tickets).not.toContain(back);
    expect(state.events).toContainEqual(expect.objectContaining({ type: 'merged', x: 4, y: 1 }));
  });

  it('refuses unfinished parts, two of the same part, and other tickets', () => {
    const state = newGame();
    const raw = ticket(state, 'frontend', 0);
    expect(canPutDown(state, raw, 4, 1)).toBe(false);
    const front = ticket(state, 'frontend', 1);
    front.location = { kind: 'tile', x: 4, y: 1 };
    expect(canPutDown(state, ticket(state, 'frontend', 1), 4, 1)).toBe(false);
    expect(canPutDown(state, ticket(state, 'feature', 1), 4, 1)).toBe(false);
    expect(canPutDown(state, ticket(state, 'backend', 0), 4, 1)).toBe(false);
    expect(canPutDown(state, ticket(state, 'backend', 1), 4, 1)).toBe(true);
  });

  it('never ships half a feature', () => {
    const state = newGame();
    createOrder(state, 'fullstack', 'Checkout');
    const part = queuedTickets(state, 'feature')[0];
    if (!part) throw new Error('no part');
    part.steps.forEach((s) => (s.progress = 1));
    expect(shipTicket(state, 1, part)).toBe(false);
  });

  it('opens a full-stack order as its two parts in the inbox, and ships the merged ticket for it', () => {
    const state = newGame();
    const order = createOrder(state, 'fullstack', 'Checkout');
    const kinds = queuedTickets(state, 'feature').map((t) => t.kind);
    expect(kinds.sort()).toEqual(['backend', 'frontend']);
    expect(order.steps).toEqual(TICKET_STEPS.fullstack);
    const [a, b] = queuedTickets(state, 'feature');
    if (!a || !b) throw new Error('no parts');
    for (const t of [a, b]) t.steps.forEach((s) => (s.progress = 1));
    a.location = { kind: 'tile', x: 4, y: 1 };
    b.location = { kind: 'player', playerId: 1 };
    place(state, 1, { x: 4, y: 2 }, { x: 0, y: -1 });
    interact(state, 1);
    const merged = ticketOnTile(state, 4, 1);
    if (!merged) throw new Error('no merge');
    merged.steps.forEach((s) => (s.progress = 1));
    merged.location = { kind: 'player', playerId: 1 };
    expect(shipTicket(state, 1, merged)).toBe(true);
    expect(state.orders).not.toContain(order);
  });

  it('gives the merged ticket the order its parts came in with', () => {
    const state = newGame();
    const front = ticket(state, 'frontend', 1, TICKET_STEPS.frontend, 7);
    const back = ticket(state, 'backend', 1, TICKET_STEPS.backend, 7);
    front.location = { kind: 'tile', x: 4, y: 1 };
    back.location = { kind: 'player', playerId: 1 };
    place(state, 1, { x: 4, y: 2 }, { x: 0, y: -1 });
    interact(state, 1);
    expect(ticketOnTile(state, 4, 1)).toMatchObject({ kind: 'fullstack', orderId: 7 });
  });

  it('refuses to merge an expired part', () => {
    const state = newGame();
    const front = ticket(state, 'frontend', 1);
    front.location = { kind: 'tile', x: 4, y: 1 };
    const back = ticket(state, 'backend', 1);
    back.expired = true;
    expect(canPutDown(state, back, 4, 1)).toBe(false);
    front.location = { kind: 'queue', queue: 'feature' };
    expect(canPutDown(state, back, 4, 1)).toBe(false);
  });

  it('keeps the merge when a merged ticket is lost, and loses the work after it', () => {
    const state = newGame();
    const t = ticket(state, 'fullstack', 3);
    loseTicket(state, t, { x: 0, y: 0 });
    expect(t.steps.map((s) => s.progress)).toEqual([1, 1, 0, 0]);
  });
});

describe('design pays off', () => {
  it('codes a designed feature faster', () => {
    const state = newGame();
    const t = ticket(state, 'feature', 1, DESIGNED_FEATURE_STEPS);
    t.location = { kind: 'tile', x: 6, y: 1 };
    place(state, 1, { x: 6, y: 2 }, { x: 0, y: -1 });
    workFor(state, 10, 1);
    expect(t.steps[1]?.progress).toBeCloseTo(WORK_RATE * DESIGNED_CODE_FACTOR * 10);
  });

  it('pays more and gives more time for an order that starts at the whiteboard', () => {
    const state = newGame();
    const plain = createOrder(state, 'feature', 'Plain');
    const designed = createOrder(state, 'feature', 'Designed', DESIGNED_FEATURE_STEPS);
    const limit = state.settings.orderSchedule.timeLimitTicks;
    expect(plain.expiresTick - plain.createdTick).toBe(limit);
    expect(designed.expiresTick - designed.createdTick).toBe(
      Math.round(limit * DESIGNED_TIME_FACTOR),
    );
    expect(shipPoints(plain, plain.expiresTick)).toBe(ORDER_POINTS);
    expect(shipPoints(designed, designed.expiresTick)).toBe(DESIGNED_ORDER_POINTS);
  });
});

describe('merging on the way', () => {
  it('merges a coded part thrown onto the station holding its other half', () => {
    const state = newGame();
    const front = ticket(state, 'frontend', 1);
    front.location = { kind: 'tile', x: 4, y: 1 };
    const back = ticket(state, 'backend', 1);
    back.location = { kind: 'player', playerId: 1 };
    // Thrown up the column at the merge station from two tiles below.
    place(state, 1, { x: 4, y: 3 }, { x: 0, y: -1 });
    for (let i = 0; i < THROW_HOLD_TICKS + 1; i++) {
      tick(state, [cmd(state, 1, { interact: true })]);
    }
    tick(state, [cmd(state, 1, {})]);
    for (let i = 0; i < 60; i++) tick(state, []);
    expect(ticketOnTile(state, 4, 1)?.kind).toBe('fullstack');
  });

  it('lets an uncoded part fly over the merge station', () => {
    const state = newGame();
    const raw = ticket(state, 'frontend', 0);
    raw.location = {
      kind: 'flying',
      pos: { x: 4, y: 2.4 },
      from: { x: 4, y: 3 },
      dir: { x: 0, y: -1 },
      thrownBy: 1,
      lastFloor: { x: 4, y: 2 },
    };
    for (let i = 0; i < 30; i++) tick(state, []);
    // It hits the wall behind and drops back on the floor in front.
    expect(raw.location).toEqual({ kind: 'tile', x: 4, y: 2 });
  });

  it('merges a part a conveyor brings to the merge station', () => {
    const state = createGame(
      levelWithMap(parseLevelMap(['######', '#>G..#', '#1234#', '######'].join('\n'))),
      1,
      [1],
    );
    state.nextOrderTick = Number.MAX_SAFE_INTEGER;
    const front = ticket(state, 'frontend', 1);
    front.location = { kind: 'tile', x: 2, y: 1 };
    const back = ticket(state, 'backend', 1);
    back.location = { kind: 'tile', x: 1, y: 1 };
    for (let i = 0; i < 60; i++) tick(state, []);
    expect(ticketOnTile(state, 2, 1)?.kind).toBe('fullstack');
  });
});

describe('full-stack orders running out', () => {
  it('take both waiting parts with them', () => {
    const state = newGame();
    const order = createOrder(state, 'fullstack', 'Checkout');
    state.tick = order.expiresTick;
    expireOrders(state);
    expect(queuedTickets(state, 'feature')).toEqual([]);
  });

  it("take a merged ticket of theirs that fell back into the queue, and no one else's", () => {
    const state = newGame();
    const order = createOrder(state, 'fullstack', 'Checkout');
    const other = createOrder(state, 'fullstack', 'Login');
    other.expiresTick = order.expiresTick + 1000;
    // Its parts were merged: only the merged ticket is left, and it fell back into the queue.
    state.tickets = state.tickets.filter((t) => t.orderId !== order.id);
    const merged = ticket(state, 'fullstack', 2, TICKET_STEPS.fullstack, order.id);
    loseTicket(state, merged, { x: 0, y: 0 });
    state.tick = order.expiresTick;
    expireOrders(state);
    expect(state.tickets).not.toContain(merged);
    const left = queuedTickets(state, 'feature');
    expect(left.map((t) => t.kind).sort()).toEqual(['backend', 'frontend']);
    expect(left.every((t) => t.orderId === other.id)).toBe(true);
  });
});

describe('pair programming', () => {
  it('marks the keyboard as pairing while two code there, and stops when one lets go', () => {
    const state = newGame({ pairing: true });
    const t = ticket(state, 'feature', 0);
    t.location = { kind: 'tile', x: 6, y: 4 };
    place(state, 1, { x: 6, y: 3 }, { x: 0, y: 1 });
    place(state, 2, { x: 6, y: 5 }, { x: 0, y: -1 });
    workFor(state, 10, 1, 2);
    expect(t.steps[0]?.progress).toBeCloseTo(PAIR_RATE * 10);
    expect(state.pairing).toEqual([{ x: 6, y: 4 }]);
    workFor(state, 1, 1);
    expect(state.pairing).toEqual([]);
  });

  it('signs nobody up at a keyboard with nothing to code', () => {
    const state = newGame({ pairing: true });
    place(state, 1, { x: 6, y: 3 }, { x: 0, y: 1 });
    place(state, 2, { x: 6, y: 5 }, { x: 0, y: -1 });
    workFor(state, 1, 1, 2);
    expect(state.pairing).toEqual([]);
  });

  it('stops pairing when the level ends', () => {
    const state = newGame({ pairing: true });
    const t = ticket(state, 'feature', 0);
    t.location = { kind: 'tile', x: 6, y: 4 };
    place(state, 1, { x: 6, y: 3 }, { x: 0, y: 1 });
    place(state, 2, { x: 6, y: 5 }, { x: 0, y: -1 });
    state.settings.durationTicks = state.tick + 1;
    workFor(state, 1, 1, 2);
    expect(state.result).not.toBeNull();
    expect(state.pairing).toEqual([]);
  });

  it('codes at PAIR_RATE with two players at one keyboard, on levels with pairing', () => {
    const state = newGame({ pairing: true });
    const t = ticket(state, 'feature', 0);
    t.location = { kind: 'tile', x: 6, y: 4 };
    place(state, 1, { x: 6, y: 3 }, { x: 0, y: 1 });
    place(state, 2, { x: 6, y: 5 }, { x: 0, y: -1 });
    workFor(state, 10, 1, 2);
    expect(t.steps[0]?.progress).toBeCloseTo(PAIR_RATE * 10);
  });

  it('codes at the normal rate alone, and two players never stack without pairing', () => {
    const solo = newGame({ pairing: true });
    const a = ticket(solo, 'feature', 0);
    a.location = { kind: 'tile', x: 6, y: 4 };
    place(solo, 1, { x: 6, y: 3 }, { x: 0, y: 1 });
    workFor(solo, 10, 1);
    expect(a.steps[0]?.progress).toBeCloseTo(WORK_RATE * 10);

    const off = newGame();
    const b = ticket(off, 'feature', 0);
    b.location = { kind: 'tile', x: 6, y: 4 };
    place(off, 1, { x: 6, y: 3 }, { x: 0, y: 1 });
    place(off, 2, { x: 6, y: 5 }, { x: 0, y: -1 });
    workFor(off, 10, 1, 2);
    expect(b.steps[0]?.progress).toBeCloseTo(WORK_RATE * 10);
  });
});
