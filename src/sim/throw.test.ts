import { describe, expect, it } from 'vitest';
import { THROW_HOLD_TICKS, THROW_RANGE } from './balance';
import { parseLevelMap } from './level';
import { levelWithMap } from './levels';
import { type GameState, type PlayerId, type Vec, createGame, getPlayer } from './state';
import { cmd, give, idle } from './testing';
import { tick } from './tick';
import { TICKET_STEPS, type Ticket, ticketCarriedBy } from './tickets';

/**
 * Row 1: counters at x=3 and x=5, a keyboard at x=7, a pipeline at x=9.
 * Rows 2 and 3 are open floor; the right wall is at x=13.
 */
const MAP = [
  '##############',
  '#..C.C.K.P...#',
  '#............#',
  '#............#',
  '#1234........#',
  '##############',
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
    title: 'Thrown',
    steps: TICKET_STEPS.feature.map((kind, i) => ({ kind, progress: i < done ? 1 : 0 })),
    location: { kind: 'queue', queue: 'feature' },
  };
  state.tickets.push(ticket);
  return ticket;
}

/** Holds interact for `ticks` ticks, then lets go. */
function holdInteract(state: GameState, ticks: number, id: PlayerId = 1): void {
  for (let i = 0; i < ticks; i++) tick(state, [cmd(state, id, { interact: true })]);
  tick(state, [cmd(state, id, {})]);
}

/** Throws `ticket` from `pos` along `dir` and waits until it's down or caught. */
function throwFrom(state: GameState, ticket: Ticket, pos: Vec, dir: Vec): void {
  place(state, 1, pos, dir);
  give(1, ticket);
  holdInteract(state, THROW_HOLD_TICKS);
  for (let i = 0; i < 200 && ticket.location.kind === 'flying'; i++) tick(state, []);
}

const RIGHT = { x: 1, y: 0 };
const UP = { x: 0, y: -1 };

describe('throwing', () => {
  it('throws after holding interact when the press did nothing', () => {
    const state = newGame();
    const ticket = newTicket(state);
    place(state, 1, { x: 2, y: 3 }, RIGHT);
    give(1, ticket);
    tick(state, [cmd(state, 1, { interact: true })]);
    expect(ticket.location.kind).toBe('player');
    for (let i = 1; i < THROW_HOLD_TICKS - 1; i++) tick(state, [cmd(state, 1, { interact: true })]);
    expect(ticket.location.kind).toBe('player');
    tick(state, [cmd(state, 1, { interact: true })]);
    expect(ticket.location.kind).toBe('flying');
    expect(state.events).toContainEqual({ type: 'thrown', playerId: 1, ticketId: ticket.id });
  });

  it('does not throw on a tap', () => {
    const state = newGame();
    const ticket = newTicket(state);
    place(state, 1, { x: 2, y: 3 }, RIGHT);
    give(1, ticket);
    holdInteract(state, 2);
    idle(state, THROW_HOLD_TICKS * 2);
    expect(ticket.location).toEqual({ kind: 'player', playerId: 1 });
  });

  it('puts down instead of throwing when the press found a free counter', () => {
    const state = newGame();
    const ticket = newTicket(state);
    place(state, 1, { x: 3, y: 2 }, UP);
    give(1, ticket);
    holdInteract(state, THROW_HOLD_TICKS * 2);
    expect(ticket.location).toEqual({ kind: 'tile', x: 3, y: 1 });
  });

  it('flies over full counters and lands on the first free one', () => {
    const state = newGame();
    const blocker = newTicket(state);
    blocker.location = { kind: 'tile', x: 3, y: 1 };
    const ticket = newTicket(state);
    throwFrom(state, ticket, { x: 1, y: 1 }, RIGHT);
    expect(ticket.location).toEqual({ kind: 'tile', x: 5, y: 1 });
    expect(state.tickets.filter((t) => t.location.kind === 'tile')).toHaveLength(2);
  });

  it('lands on a station that takes it', () => {
    const state = newGame();
    const blocker = newTicket(state);
    blocker.location = { kind: 'tile', x: 5, y: 1 };
    const ticket = newTicket(state);
    throwFrom(state, ticket, { x: 4, y: 1 }, RIGHT);
    expect(ticket.location).toEqual({ kind: 'tile', x: 7, y: 1 });
  });

  it('flies over a pipeline the ticket is not ready for', () => {
    const state = newGame();
    const ticket = newTicket(state);
    throwFrom(state, ticket, { x: 8, y: 1 }, RIGHT);
    expect(ticket.location).toEqual({ kind: 'tile', x: 12, y: 1 });
  });

  it('lands on a pipeline the ticket is ready for', () => {
    const state = newGame();
    const blocker = newTicket(state);
    blocker.location = { kind: 'tile', x: 7, y: 1 };
    const ticket = newTicket(state, 2);
    throwFrom(state, ticket, { x: 6, y: 1 }, RIGHT);
    expect(ticket.location).toEqual({ kind: 'tile', x: 9, y: 1 });
  });

  it('drops on the floor after its range', () => {
    const state = newGame();
    const ticket = newTicket(state);
    throwFrom(state, ticket, { x: 1, y: 3 }, RIGHT);
    expect(ticket.location).toEqual({ kind: 'tile', x: 1 + THROW_RANGE, y: 3 });
    expect(state.events).toContainEqual({ type: 'landed', ticketId: ticket.id, x: 6, y: 3 });
  });

  it('stops at walls, on the last floor tile', () => {
    const state = newGame();
    const ticket = newTicket(state);
    throwFrom(state, ticket, { x: 10, y: 3 }, RIGHT);
    expect(ticket.location).toEqual({ kind: 'tile', x: 12, y: 3 });
  });

  it('drops at the feet of the thrower when thrown straight at a wall', () => {
    const state = newGame();
    const ticket = newTicket(state);
    throwFrom(state, ticket, { x: 6, y: 4 }, { x: 0, y: 1 });
    expect(ticket.location).toEqual({ kind: 'tile', x: 6, y: 4 });
  });

  it('can be picked up from the floor in front or underfoot', () => {
    const state = newGame();
    const ticket = newTicket(state);
    ticket.location = { kind: 'tile', x: 6, y: 3 };
    place(state, 2, { x: 5, y: 3 }, RIGHT);
    holdInteract(state, 1, 2);
    expect(ticketCarriedBy(state, 2)).toBe(ticket);

    ticket.location = { kind: 'tile', x: 5, y: 3 };
    holdInteract(state, 1, 2);
    expect(ticketCarriedBy(state, 2)).toBe(ticket);
  });
});

describe('catching', () => {
  it('an empty-handed player facing the ticket catches it', () => {
    const state = newGame();
    place(state, 2, { x: 5, y: 3 }, { x: -1, y: 0 });
    const ticket = newTicket(state);
    throwFrom(state, ticket, { x: 1, y: 3 }, RIGHT);
    expect(ticket.location).toEqual({ kind: 'player', playerId: 2 });
    expect(state.events).toContainEqual({ type: 'caught', playerId: 2, ticketId: ticket.id });
  });

  it('a player facing away does not catch it', () => {
    const state = newGame();
    place(state, 2, { x: 4, y: 3 }, RIGHT);
    const ticket = newTicket(state);
    throwFrom(state, ticket, { x: 1, y: 3 }, RIGHT);
    expect(ticket.location.kind).toBe('tile');
  });

  it('a player with full hands does not catch it', () => {
    const state = newGame();
    place(state, 2, { x: 4, y: 3 }, { x: -1, y: 0 });
    give(2, newTicket(state));
    const ticket = newTicket(state);
    throwFrom(state, ticket, { x: 1, y: 3 }, RIGHT);
    expect(ticket.location.kind).toBe('tile');
  });

  it('the thrower cannot catch their own throw', () => {
    const state = newGame();
    const ticket = newTicket(state);
    place(state, 1, { x: 1, y: 3 }, RIGHT);
    give(1, ticket);
    holdInteract(state, THROW_HOLD_TICKS);
    // Teleport ahead of it, facing it.
    place(state, 1, { x: 4, y: 3 }, { x: -1, y: 0 });
    for (let i = 0; i < 60 && ticket.location.kind === 'flying'; i++) tick(state, []);
    expect(ticket.location.kind).toBe('tile');
  });
});
