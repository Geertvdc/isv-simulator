/** Belts on their own: `updateConveyors` called directly, without the rest of a tick. */

import { describe, expect, it } from 'vitest';
import { CONVEYOR_TICKS } from './balance';
import { beltProgress, createBelts, updateConveyors } from './conveyor';
import { parseLevelMap } from './level';
import { levelWithMap } from './levels';
import { createRng, int } from './rng';
import { type GameState, createGame } from './state';
import { addTicket, give } from './testing';
import { type Ticket, ticketOnTile } from './tickets';

/** A strip of belts between walls with the spawns on the bottom row. */
function beltGame(rows: string[]): GameState {
  const width = rows[0]?.length ?? 0;
  const map = ['#'.repeat(width), ...rows, '#1234'.padEnd(width, '.')];
  const state = createGame(levelWithMap(parseLevelMap(map.join('\n'))), 1, [1]);
  state.nextOrderTick = Number.MAX_SAFE_INTEGER;
  return state;
}

function on(state: GameState, x: number, y: number): Ticket {
  const ticket = addTicket(state, x);
  ticket.location = { kind: 'tile', x, y };
  return ticket;
}

function run(state: GameState, n: number): void {
  for (let i = 0; i < n; i++) updateConveyors(state);
}

function where(ticket: Ticket): [number, number] | null {
  return ticket.location.kind === 'tile' ? [ticket.location.x, ticket.location.y] : null;
}

describe('createBelts', () => {
  it('makes one empty belt per conveyor tile, in map order', () => {
    const map = parseLevelMap(['#####', '#>v<#', '##v##', '##C##', '#1234'].join('\n'));
    expect(createBelts(map)).toEqual([
      { x: 1, y: 1, ticketId: null, ticks: 0 },
      { x: 2, y: 1, ticketId: null, ticks: 0 },
      { x: 3, y: 1, ticketId: null, ticks: 0 },
      { x: 2, y: 2, ticketId: null, ticks: 0 },
    ]);
  });

  it('makes none for a map without belts', () => {
    expect(createBelts(parseLevelMap(['#####', '#.C.#', '#1234'].join('\n')))).toEqual([]);
  });
});

describe('updateConveyors', () => {
  it('moves a ticket exactly on its CONVEYOR_TICKS-th tick on the tile, and reports it', () => {
    const state = beltGame(['#>>C#']);
    const ticket = on(state, 1, 1);
    run(state, CONVEYOR_TICKS - 1);
    expect(where(ticket)).toEqual([1, 1]);
    expect(state.events).toEqual([]);
    run(state, 1);
    expect(where(ticket)).toEqual([2, 1]);
    expect(state.events).toEqual([{ type: 'conveyed', ticketId: ticket.id, x: 2, y: 1 }]);
  });

  it('moves a ticket at most one tile per update', () => {
    const state = beltGame(['#>>>C#']);
    const ticket = on(state, 1, 1);
    run(state, CONVEYOR_TICKS);
    expect(where(ticket)).toEqual([2, 1]);
    // The next belt starts counting from scratch.
    run(state, CONVEYOR_TICKS - 1);
    expect(where(ticket)).toEqual([2, 1]);
    run(state, 1);
    expect(where(ticket)).toEqual([3, 1]);
  });

  it('leaves an empty belt alone and resets its count', () => {
    const state = beltGame(['#>C##']);
    run(state, CONVEYOR_TICKS * 2);
    expect(state.belts[0]).toEqual({ x: 1, y: 1, ticketId: null, ticks: 0 });
    expect(state.events).toEqual([]);
  });

  it('waits at a taken counter, keeps counting, and goes as soon as it is free', () => {
    const state = beltGame(['#>C##']);
    const blocker = on(state, 2, 1);
    const ticket = on(state, 1, 1);
    run(state, CONVEYOR_TICKS * 3);
    expect(where(ticket)).toEqual([1, 1]);
    expect(state.belts[0]?.ticks).toBe(CONVEYOR_TICKS * 3);
    state.tickets = state.tickets.filter((t) => t !== blocker);
    run(state, 1);
    expect(where(ticket)).toEqual([2, 1]);
  });

  it('lets a full line move as one, front first', () => {
    const state = beltGame(['#>>>C#']);
    const tickets = [on(state, 1, 1), on(state, 2, 1), on(state, 3, 1)];
    run(state, CONVEYOR_TICKS);
    expect(tickets.map(where)).toEqual([
      [2, 1],
      [3, 1],
      [4, 1],
    ]);
  });

  it('forgets a ticket picked up from a belt; a new one starts from 0', () => {
    const state = beltGame(['#>C##']);
    const first = on(state, 1, 1);
    run(state, CONVEYOR_TICKS - 1);
    give(1, first);
    run(state, 1);
    expect(state.belts[0]).toMatchObject({ ticketId: null, ticks: 0 });
    const second = on(state, 1, 1);
    run(state, CONVEYOR_TICKS - 1);
    expect(where(second)).toEqual([1, 1]);
    run(state, 1);
    expect(where(second)).toEqual([2, 1]);
    expect(first.location).toEqual({ kind: 'player', playerId: 1 });
  });

  it('where belts merge, breaks a tie in map order, then lets the longest waiting go', () => {
    const state = beltGame(['#>v<#', '##v##', '##C##']);
    const left = on(state, 1, 1);
    const right = on(state, 3, 1);
    run(state, CONVEYOR_TICKS);
    // Equal waits: the belt first in the map (top left) goes.
    expect(where(left)).toEqual([2, 1]);
    expect(where(right)).toEqual([3, 1]);
    // A fresh ticket on the left has waited less than the right one.
    const fresh = on(state, 1, 1);
    run(state, CONVEYOR_TICKS);
    expect(where(left)).toEqual([2, 2]);
    expect(where(right)).toEqual([2, 1]);
    expect(where(fresh)).toEqual([1, 1]);
  });

  it('swaps the two tickets of a full two-belt loop', () => {
    const state = beltGame(['#><##']);
    const a = on(state, 1, 1);
    const b = on(state, 2, 1);
    run(state, CONVEYOR_TICKS);
    expect([where(a), where(b)]).toEqual([
      [2, 1],
      [1, 1],
    ]);
    expect(state.events.filter((e) => e.type === 'conveyed')).toHaveLength(2);
  });

  it('bounces a lone ticket round a two-belt loop', () => {
    const state = beltGame(['#><##']);
    const ticket = on(state, 1, 1);
    run(state, CONVEYOR_TICKS);
    expect(where(ticket)).toEqual([2, 1]);
    run(state, CONVEYOR_TICKS);
    expect(where(ticket)).toEqual([1, 1]);
  });

  it('is deterministic for the same placements', () => {
    const play = (): GameState => {
      const state = beltGame(['#>>v#', '#^C<#', '#^<<#']);
      const tiles = state.belts.map((b) => [b.x, b.y] as const);
      let rng = createRng(42);
      for (let i = 0; i < 400; i++) {
        let pick: number;
        [pick, rng] = int(rng, 0, tiles.length * 4);
        const tile = tiles[pick];
        if (tile && !ticketOnTile(state, tile[0], tile[1])) on(state, tile[0], tile[1]);
        updateConveyors(state);
        const tileKeys = state.tickets.map((t) => JSON.stringify(where(t)));
        expect(new Set(tileKeys).size).toBe(tileKeys.length);
      }
      return state;
    };
    expect(play()).toEqual(play());
  });
});

describe('beltProgress', () => {
  it('goes from 0 to 1 across the tile and stays at 1 while waiting', () => {
    const state = beltGame(['#>C##']);
    on(state, 2, 1);
    on(state, 1, 1);
    expect(beltProgress(state, 1, 1)).toBe(0);
    run(state, CONVEYOR_TICKS / 2);
    expect(beltProgress(state, 1, 1)).toBeCloseTo(0.5);
    run(state, CONVEYOR_TICKS * 2);
    expect(beltProgress(state, 1, 1)).toBe(1);
  });

  it('is 0 off the belts', () => {
    const state = beltGame(['#>C##']);
    expect(beltProgress(state, 2, 1)).toBe(0);
    expect(beltProgress(state, -1, 99)).toBe(0);
  });
});
