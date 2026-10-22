import { describe, expect, it } from 'vitest';
import { CONVEYOR_TICKS, THROW_HOLD_TICKS, THROW_RANGE } from './balance';
import { parseLevelMap } from './level';
import { levelWithMap } from './levels';
import { type GameState, type PlayerId, type Vec, createGame, getPlayer } from './state';
import { cmd, give } from './testing';
import { tick } from './tick';
import { TICKET_STEPS, type Ticket, ticketOnTile } from './tickets';

/**
 * Left room (x 1-4) and right room (x 6-9) split by a gap at x=5; a counter
 * on each side of the gap on row 1. Row 3 has a belt running right from
 * x=2 to x=6, ending on a keyboard at x=7. The level's top right is void.
 */
const MAP = [
  '#######   ',
  '#..C.~C..#',
  '#....~...#',
  '#.>>>>>K.#',
  '#12..~.34#',
  '##########',
].join('\n');

function newGame(): GameState {
  const state = createGame(levelWithMap(parseLevelMap(MAP)), 1, [1, 2]);
  state.nextOrderTick = Number.MAX_SAFE_INTEGER;
  return state;
}

function place(state: GameState, id: PlayerId, pos: Vec, facing: Vec): void {
  const p = getPlayer(state, id);
  if (!p) throw new Error(`No player ${id}`);
  p.pos = { ...pos };
  p.facing = { ...facing };
}

function newTicket(state: GameState, done = 0): Ticket {
  const ticket: Ticket = {
    id: state.nextTicketId++,
    kind: 'feature',
    title: 'Over the gap',
    steps: TICKET_STEPS.feature.map((kind, i) => ({ kind, progress: i < done ? 1 : 0 })),
    location: { kind: 'queue', queue: 'feature' },
  };
  state.tickets.push(ticket);
  return ticket;
}

/** Throws `ticket` from `pos` along `dir` and waits until it's down. */
function throwFrom(state: GameState, ticket: Ticket, pos: Vec, dir: Vec): void {
  place(state, 1, pos, dir);
  give(1, ticket);
  for (let i = 0; i < THROW_HOLD_TICKS; i++) tick(state, [cmd(state, 1, { interact: true })]);
  tick(state, [cmd(state, 1, {})]);
  for (let i = 0; i < 200 && ticket.location.kind === 'flying'; i++) tick(state, []);
}

describe('throwing over gaps', () => {
  it('flies over a gap and lands on the counter across it', () => {
    const state = newGame();
    const ticket = newTicket(state);
    throwFrom(state, ticket, { x: 4, y: 2 }, { x: 1, y: 0 });
    // Along row 2 it crosses the gap at x=5 and comes down on the floor past it.
    expect(ticket.location.kind).toBe('tile');
    if (ticket.location.kind === 'tile') expect(ticket.location.x).toBeGreaterThan(5);
  });

  it('loses a ticket that comes down in a gap: back in its queue with its work undone', () => {
    const state = newGame();
    const ticket = newTicket(state, 1);
    // In flight down the gap's column, just about out of range over the gap.
    ticket.location = {
      kind: 'flying',
      pos: { x: 5, y: 1 },
      from: { x: 5, y: 1 - THROW_RANGE + 0.05 },
      dir: { x: 0, y: 1 },
      thrownBy: 1,
      lastFloor: { x: 4, y: 1 },
    };
    tick(state, []);
    expect(ticket.location).toEqual({ kind: 'queue', queue: 'feature' });
    expect(ticket.steps.every((s) => s.progress === 0)).toBe(true);
    expect(state.events).toContainEqual({ type: 'ticketLost', ticketId: ticket.id, x: 5, y: 1 });
  });

  it('loses a ticket thrown off the edge into the void', () => {
    const state = newGame();
    const ticket = newTicket(state);
    let lost = false;
    place(state, 1, { x: 8, y: 1 }, { x: 0, y: -1 });
    give(1, ticket);
    for (let i = 0; i < THROW_HOLD_TICKS; i++) tick(state, [cmd(state, 1, { interact: true })]);
    for (let i = 0; i < 200 && !lost; i++) {
      tick(state, i === 0 ? [cmd(state, 1, {})] : []);
      lost = state.events.some((e) => e.type === 'ticketLost');
    }
    // Row 0 is void from x=7: the ticket flies out of the office.
    expect(lost).toBe(true);
    expect(ticket.location.kind).toBe('queue');
  });
});

describe('conveyors', () => {
  it('carries a ticket along the belt, a tile every CONVEYOR_TICKS, onto the keyboard at its end', () => {
    const state = newGame();
    const ticket = newTicket(state);
    ticket.location = { kind: 'tile', x: 2, y: 3 };
    tick(state, []);
    expect(ticket.location).toEqual({ kind: 'tile', x: 2, y: 3 });
    for (let i = 0; i < CONVEYOR_TICKS; i++) tick(state, []);
    expect(ticket.location).toEqual({ kind: 'tile', x: 3, y: 3 });
    for (let i = 0; i < CONVEYOR_TICKS * 6; i++) tick(state, []);
    expect(ticket.location).toEqual({ kind: 'tile', x: 7, y: 3 });
  });

  it('waits at the end when the keyboard is taken, and the line behind closes up', () => {
    const state = newGame();
    const onKeyboard = newTicket(state);
    onKeyboard.location = { kind: 'tile', x: 7, y: 3 };
    const a = newTicket(state);
    a.location = { kind: 'tile', x: 5, y: 3 };
    const b = newTicket(state);
    b.location = { kind: 'tile', x: 3, y: 3 };
    for (let i = 0; i < CONVEYOR_TICKS * 10; i++) tick(state, []);
    expect(a.location).toEqual({ kind: 'tile', x: 6, y: 3 });
    expect(b.location).toEqual({ kind: 'tile', x: 5, y: 3 });
    expect(onKeyboard.location).toEqual({ kind: 'tile', x: 7, y: 3 });
  });

  it('moves a full line as one: every ticket a tile on the same tick', () => {
    const state = newGame();
    const tickets = [3, 4, 5].map((x) => {
      const t = newTicket(state);
      t.location = { kind: 'tile', x, y: 3 };
      return t;
    });
    for (let i = 0; i < CONVEYOR_TICKS; i++) tick(state, []);
    expect(tickets.map((t) => (t.location.kind === 'tile' ? t.location.x : -1))).toEqual([4, 5, 6]);
  });

  it('lets players put tickets on a belt and take them off', () => {
    const state = newGame();
    const ticket = newTicket(state);
    place(state, 1, { x: 2, y: 2 }, { x: 0, y: 1 });
    give(1, ticket);
    tick(state, [cmd(state, 1, { interact: true })]);
    expect(ticketOnTile(state, 2, 3)).toBe(ticket);
    tick(state, [cmd(state, 1, {})]);
    tick(state, [cmd(state, 1, { interact: true })]);
    expect(ticket.location).toEqual({ kind: 'player', playerId: 1 });
  });

  it('is deterministic: same start, same ticks, same state', () => {
    const run = () => {
      const state = newGame();
      for (const x of [2, 4, 6]) newTicket(state).location = { kind: 'tile', x, y: 3 };
      for (let i = 0; i < 200; i++) tick(state, []);
      return JSON.stringify(state);
    };
    expect(run()).toEqual(run());
  });
});
