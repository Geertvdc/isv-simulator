import { describe, expect, it } from 'vitest';
import hotDeskingDraft from '../../maps/level-09-hot-desking.txt?raw';
import hypergrowthDraft from '../../maps/level-08-hypergrowth.txt?raw';
import {
  CHUTE_TICKS,
  EXPRESS_OPEN_TICKS,
  LIFT_OPEN_TICKS,
  LIFT_RIDE_TICKS,
  TICKS_PER_SECOND,
} from './balance';
import { botInput, createBot } from './bot';
import { parseLevelMap } from './level';
import { HOT_DESKING, HYPERGROWTH, levelWithMap } from './levels';
import { createChutes, createLifts, isRiding, liftChimes, liftLinks } from './lifts';
import { pathTo } from './path';
import { type GameState, createGame } from './state';
import { addTicket, cmd, give, idle } from './testing';
import { tick } from './tick';

const SECOND = TICKS_PER_SECOND;

/**
 * Two floors side by side: a 2-tile cabin on each (top floor on the right,
 * higher up), and a hatch pair (top hatch first in reading order).
 */
const TWO_FLOORS = parseLevelMap(
  [
    '         #####',
    '#####    H.LL#',
    '#.LL#    #...#',
    '#...H    #...#',
    '#1234    #####',
    '#####         ',
  ].join('\n'),
);

function game(players = [1], map = TWO_FLOORS, settings = {}): GameState {
  const state = createGame(levelWithMap(map, settings), 7, players);
  state.nextOrderTick = Number.MAX_SAFE_INTEGER;
  return state;
}

function standIn(state: GameState, id: number, x: number, y: number): void {
  const p = state.players.find((pl) => pl.id === id);
  if (!p) throw new Error(`no player ${id}`);
  p.pos = { x, y };
}

describe('lift layout', () => {
  it('finds one lift with a cabin per floor, in reading order', () => {
    const [lift, ...more] = createLifts(TWO_FLOORS);
    expect(more).toEqual([]);
    expect(lift?.kind).toBe('local');
    expect(lift?.stops).toEqual([
      [
        { x: 11, y: 1 },
        { x: 12, y: 1 },
      ],
      [
        { x: 2, y: 2 },
        { x: 3, y: 2 },
      ],
    ]);
  });

  it('pairs chute hatches top first', () => {
    expect(createChutes(TWO_FLOORS)).toEqual([
      { from: { x: 9, y: 1 }, to: { x: 4, y: 3 }, since: null },
    ]);
  });

  it('links cabins for paths, so the walk crosses by lift', () => {
    expect(liftLinks(TWO_FLOORS).get(2 * TWO_FLOORS.width + 2)).toEqual([{ x: 11, y: 1 }]);
    const path = pathTo(TWO_FLOORS, { x: 1, y: 3 }, { x: 12, y: 3 });
    expect(path).not.toBeNull();
    expect(path?.some((p) => p.y === 1 && p.x >= 11)).toBe(true);
  });

  it('reads the Scale-Up drafts: one lift on Hypergrowth, local and express on Hot Desking', () => {
    expect(createLifts(parseLevelMap(hypergrowthDraft)).map((l) => l.stops.length)).toEqual([2]);
    const hot = createLifts(parseLevelMap(hotDeskingDraft));
    expect(hot.map((l) => [l.kind, l.stops.length])).toEqual([
      ['local', 3],
      ['express', 2],
    ]);
    expect(createChutes(parseLevelMap(hotDeskingDraft))).toHaveLength(1);
  });
});

describe('lift rides', () => {
  it('takes whoever stands in the cabin to the same place on the next floor, with their ticket', () => {
    const state = game();
    standIn(state, 1, 12, 1);
    const ticket = addTicket(state, 1);
    give(1, ticket);
    idle(state, LIFT_OPEN_TICKS + 1);
    expect(state.events).toContainEqual({ type: 'liftDeparted', lift: 'local', floor: 1 });
    expect(state.players[0]?.pos).toEqual({ x: 3, y: 2 });
    expect(ticket.location).toEqual({ kind: 'player', playerId: 1 });
    expect(isRiding(state, 1)).toBe(true);
  });

  it("holds riders still until it arrives, then opens and goes back after it's stood open", () => {
    const state = game();
    standIn(state, 1, 11, 1);
    idle(state, LIFT_OPEN_TICKS + 1);
    for (let i = 0; i < LIFT_RIDE_TICKS - 1; i++) {
      tick(state, [cmd(state, 1, { move: { x: 0, y: 1 } })]);
    }
    expect(state.players[0]?.pos).toEqual({ x: 2, y: 2 });
    idle(state, 1);
    expect(state.events).toContainEqual({ type: 'liftArrived', lift: 'local', floor: 1 });
    expect(isRiding(state, 1)).toBe(false);
    expect(state.lifts[0]?.dir).toBe(1);
    idle(state, LIFT_OPEN_TICKS + 1);
    expect(state.players[0]?.pos).toEqual({ x: 11, y: 1 });
  });

  it('chimes a second before leaving', () => {
    const state = game();
    const lift = state.lifts[0];
    if (!lift) throw new Error('no lift');
    expect(liftChimes(state, lift)).toBe(false);
    idle(state, LIFT_OPEN_TICKS - SECOND);
    expect(liftChimes(state, lift)).toBe(true);
  });

  it('takes one person per place; the rest wait', () => {
    const state = game([1, 2, 3]);
    standIn(state, 1, 11, 1);
    standIn(state, 2, 11, 1);
    standIn(state, 3, 12, 1);
    state.players.forEach((p) => (p.vel = { x: 0, y: 0 }));
    const lift = state.lifts[0];
    if (!lift) throw new Error('no lift');
    lift.until = 0;
    tick(state, []);
    expect(lift.riders).toHaveLength(2);
  });

  it('carries managers too', () => {
    const map = parseLevelMap(
      [
        '         #####',
        '#####    #.LL#',
        '#.LL#    #.M.#',
        '#...#    #...#',
        '#1234    #####',
        '#####         ',
      ].join('\n'),
    );
    const state = game([1], map);
    const manager = state.managers[0];
    if (!manager) throw new Error('no manager');
    manager.pos = { x: 12, y: 1 };
    manager.waitTicks = 10 * SECOND;
    idle(state, LIFT_OPEN_TICKS + 1);
    expect(manager.pos).toEqual({ x: 3, y: 2 });
  });

  it('stays open where it is while broken down, and leaves again after', () => {
    const state = game([1], TWO_FLOORS, {
      liftBreakdowns: [{ lift: 'local', atTick: 10, ticks: 10 * SECOND }],
    });
    standIn(state, 1, 11, 1);
    idle(state, 9 * SECOND);
    expect(state.players[0]?.pos).toEqual({ x: 11, y: 1 });
    idle(state, 2 * SECOND + LIFT_OPEN_TICKS);
    expect(state.players[0]?.pos).toEqual({ x: 2, y: 2 });
  });

  it('runs the express with its own timing', () => {
    const map = parseLevelMap(
      ['#####    #####', '#.ll#    #ll.#', '#1234    #...#', '#####    #####'].join('\n'),
    );
    const state = game([1], map);
    expect(state.lifts[0]?.kind).toBe('express');
    standIn(state, 1, 2, 1);
    idle(state, EXPRESS_OPEN_TICKS + 1);
    expect(state.players[0]?.pos).toEqual({ x: 10, y: 1 });
  });
});

describe('mail chute', () => {
  it('slides a ticket from the top hatch to the bottom one', () => {
    const state = game();
    const ticket = addTicket(state, 9);
    idle(state, CHUTE_TICKS);
    expect(ticket.location).toEqual({ kind: 'tile', x: 9, y: 1 });
    idle(state, 1);
    expect(ticket.location).toEqual({ kind: 'tile', x: 4, y: 3 });
    expect(state.events).toContainEqual({ type: 'chuteDropped', ticketId: ticket.id });
  });

  it('holds the next ticket while the bottom hatch is full', () => {
    const state = game();
    const below = addTicket(state, 4);
    below.location = { kind: 'tile', x: 4, y: 3 };
    const ticket = addTicket(state, 9);
    idle(state, CHUTE_TICKS + 10);
    expect(ticket.location).toEqual({ kind: 'tile', x: 9, y: 1 });
  });
});

describe('bots on the Scale-Up drafts', () => {
  for (const [name, text, level] of [
    ['Hypergrowth', hypergrowthDraft, HYPERGROWTH],
    ['Hot Desking', hotDeskingDraft, HOT_DESKING],
  ] as const) {
    it(`ship on ${name} by lift, solo and as a team`, () => {
      for (const players of [[1], [1, 2, 3, 4]]) {
        const state = createGame({ ...level, map: parseLevelMap(text) }, 2, players);
        const bots = players.map((id) => createBot(id));
        let shipped = 0;
        for (let i = 0; i < 150 * SECOND; i++) {
          tick(
            state,
            bots.map((b) => botInput(state, b, bots)),
          );
          shipped += state.events.filter((e) => e.type === 'orderShipped').length;
        }
        expect(shipped, `${name} with ${players.length}`).toBeGreaterThan(0);
      }
    });
  }

  it('plays the same twice', () => {
    const play = (): GameState => {
      const state = createGame(
        { ...HOT_DESKING, map: parseLevelMap(hotDeskingDraft) },
        5,
        [1, 2, 3],
      );
      const bots = [1, 2, 3].map((id) => createBot(id));
      for (let i = 0; i < 40 * SECOND; i++) {
        tick(
          state,
          bots.map((b) => botInput(state, b, bots)),
        );
      }
      return state;
    };
    expect(play()).toEqual(play());
  });
});
