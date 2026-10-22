import { describe, expect, it } from 'vitest';
import { DESIGN_RATE, PAIR_RATE, WORK_RATE } from './balance';
import { canPutDown, interact } from './interact';
import { parseLevelMap } from './level';
import { type LevelSettings, levelWithMap } from './levels';
import { createOrder, shipTicket } from './orders';
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
): Ticket {
  const t: Ticket = {
    id: state.nextTicketId++,
    kind,
    title: 'Checkout',
    steps: steps.map((k, i) => ({ kind: k, progress: i < done ? 1 : 0 })),
    location: { kind: 'queue', queue: 'feature' },
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

  it('keeps the merge when a merged ticket is lost, and loses the work after it', () => {
    const state = newGame();
    const t = ticket(state, 'fullstack', 3);
    loseTicket(state, t, { x: 0, y: 0 });
    expect(t.steps.map((s) => s.progress)).toEqual([1, 1, 0, 0]);
  });
});

describe('pair programming', () => {
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
