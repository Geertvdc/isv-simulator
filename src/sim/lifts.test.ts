import { describe, expect, it } from 'vitest';
import hotDeskingDraft from '../../maps/level-09-hot-desking.txt?raw';
import hypergrowthDraft from '../../maps/level-08-hypergrowth.txt?raw';
import labLiftsMap from '../../maps/lab-lifts.txt?raw';
import {
  CHUTE_TICKS,
  EXPRESS_OPEN_TICKS,
  EXPRESS_RIDE_TICKS,
  LIFT_OPEN_TICKS,
  LIFT_RIDE_TICKS,
  TICKS_PER_SECOND,
} from './balance';
import { botInput, createBot, liftGate } from './bot';
import { parseLevelMap } from './level';
import { HOT_DESKING, HYPERGROWTH, levelWithMap } from './levels';
import {
  cabinOpen,
  createChutes,
  createLifts,
  doorShare,
  inShutCar,
  isRiding,
  liftChimes,
  liftLinks,
} from './lifts';
import { pathTo } from './path';
import { type GameState, createGame } from './state';
import { addTicket, cmd, give, idle } from './testing';
import { tick } from './tick';

const SECOND = TICKS_PER_SECOND;
/** From the lift's first departure to its doors opening at the next floor. */
const FIRST_RIDE = LIFT_OPEN_TICKS + LIFT_RIDE_TICKS + 1;

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

  it('reads the Scale-Up maps: one lift on Hypergrowth, one lift with three stops on Hot Desking', () => {
    expect(createLifts(parseLevelMap(hypergrowthDraft)).map((l) => l.stops.length)).toEqual([2]);
    const hot = createLifts(parseLevelMap(hotDeskingDraft));
    expect(hot.map((l) => [l.kind, l.stops.length])).toEqual([['local', 3]]);
    expect(hot[0]?.stops.map((cabin) => cabin.length)).toEqual([3, 3, 3]);
    expect(createChutes(parseLevelMap(hotDeskingDraft))).toEqual([]);
  });

  it('reads the lifts lab: local, express and a mail chute', () => {
    const lab = parseLevelMap(labLiftsMap);
    expect(createLifts(lab).map((l) => [l.kind, l.stops.length])).toEqual([
      ['local', 3],
      ['express', 2],
    ]);
    expect(createChutes(lab)).toHaveLength(1);
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
    // Doors shut: still in the cabin upstairs, riding.
    expect(state.players[0]?.pos).toEqual({ x: 12, y: 1 });
    expect(isRiding(state, 1)).toBe(true);
    idle(state, LIFT_RIDE_TICKS);
    expect(state.players[0]?.pos).toEqual({ x: 3, y: 2 });
    expect(ticket.location).toEqual({ kind: 'player', playerId: 1 });
    expect(isRiding(state, 1)).toBe(false);
  });

  it("holds riders still until it arrives, then opens and goes back after it's stood open", () => {
    const state = game();
    standIn(state, 1, 11, 1);
    idle(state, LIFT_OPEN_TICKS + 1);
    for (let i = 0; i < LIFT_RIDE_TICKS - 1; i++) {
      tick(state, [cmd(state, 1, { move: { x: 0, y: 1 } })]);
    }
    expect(state.players[0]?.pos).toEqual({ x: 11, y: 1 });
    idle(state, 1);
    expect(state.players[0]?.pos).toEqual({ x: 2, y: 2 });
    expect(state.events).toContainEqual({ type: 'liftArrived', lift: 'local', floor: 1 });
    expect(isRiding(state, 1)).toBe(false);
    expect(state.lifts[0]?.dir).toBe(1);
    idle(state, LIFT_OPEN_TICKS + LIFT_RIDE_TICKS + 1);
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
    idle(state, FIRST_RIDE);
    expect(manager.pos).toEqual({ x: 3, y: 2 });
  });

  it('stays open where it is while broken down, and leaves again after', () => {
    const state = game([1], TWO_FLOORS, {
      liftBreakdowns: [{ lift: 'local', atTick: 10, ticks: 10 * SECOND }],
    });
    standIn(state, 1, 11, 1);
    idle(state, 9 * SECOND);
    expect(state.players[0]?.pos).toEqual({ x: 11, y: 1 });
    idle(state, 2 * SECOND + LIFT_OPEN_TICKS + LIFT_RIDE_TICKS);
    expect(state.players[0]?.pos).toEqual({ x: 2, y: 2 });
  });

  it('runs the express with its own timing', () => {
    const map = parseLevelMap(
      ['#####    #####', '#.ll#    #ll.#', '#1234    #...#', '#####    #####'].join('\n'),
    );
    const state = game([1], map);
    expect(state.lifts[0]?.kind).toBe('express');
    standIn(state, 1, 2, 1);
    idle(state, EXPRESS_OPEN_TICKS + EXPRESS_RIDE_TICKS + 1);
    expect(state.players[0]?.pos).toEqual({ x: 10, y: 1 });
  });
});

describe('lift doors', () => {
  /** Walks player 1 for `ticks` ticks. */
  function walk(state: GameState, move: { x: number; y: number }, ticks: number): void {
    for (let i = 0; i < ticks; i++) tick(state, [cmd(state, 1, { move })]);
  }

  it('keeps a cabin shut while the lift is on another floor', () => {
    const state = game();
    // The lift stands open upstairs: downstairs the doors are shut.
    standIn(state, 1, 2, 3);
    walk(state, { x: 0, y: -1 }, SECOND);
    expect(Math.round(state.players[0]?.pos.y ?? 0)).toBe(3);
  });

  it('lets people in while it stands open, and not in the last second', () => {
    const state = game();
    const lift = state.lifts[0];
    if (!lift) throw new Error('no lift');
    expect(cabinOpen(state, lift, 0)).toBe(true);
    expect(cabinOpen(state, lift, 1)).toBe(false);
    standIn(state, 1, 11, 2);
    walk(state, { x: 0, y: -1 }, SECOND / 2);
    expect(Math.round(state.players[0]?.pos.y ?? 0)).toBe(1);
    idle(state, LIFT_OPEN_TICKS - SECOND);
    expect(cabinOpen(state, lift, 0)).toBe(false);
    expect(doorShare(state, lift, 0)).toBeLessThanOrEqual(1);
  });

  it('closes the doors over the chime second', () => {
    const state = game();
    const lift = state.lifts[0];
    if (!lift) throw new Error('no lift');
    expect(doorShare(state, lift, 0)).toBe(1);
    idle(state, LIFT_OPEN_TICKS - SECOND / 2);
    expect(doorShare(state, lift, 0)).toBeCloseTo(0.5, 1);
    idle(state, SECOND);
    expect(doorShare(state, lift, 0)).toBe(0);
    expect(doorShare(state, lift, 1)).toBe(0);
  });

  it('lets whoever is inside walk out while the doors close', () => {
    const state = game();
    standIn(state, 1, 11, 1);
    idle(state, LIFT_OPEN_TICKS - SECOND / 2);
    walk(state, { x: 0, y: 1 }, SECOND / 3);
    expect(state.players[0]?.pos.y).toBeGreaterThan(1.5);
  });

  it('hides riders in the shut car until it opens on the next floor', () => {
    const state = game();
    standIn(state, 1, 11, 1);
    expect(inShutCar(state, 'player', 1)).toBe(false);
    idle(state, LIFT_OPEN_TICKS + 1);
    expect(inShutCar(state, 'player', 1)).toBe(true);
    idle(state, LIFT_RIDE_TICKS);
    expect(inShutCar(state, 'player', 1)).toBe(false);
  });

  it('walks round a cabin, not through it', () => {
    const map = parseLevelMap(
      ['#######', '#1.LL.#', '#.....#', '#######', '#.LL..#', '#234..#', '#######'].join('\n'),
    );
    const path = pathTo(map, { x: 2, y: 1 }, { x: 5, y: 1 });
    expect(path?.some((p) => p.y === 1 && (p.x === 3 || p.x === 4))).toBe(false);
  });
});

describe('lift cars on Hypergrowth and Hot Desking', () => {
  it.each([
    ['Hypergrowth', hypergrowthDraft],
    ['Hot Desking', hotDeskingDraft],
  ])('%s: one door side each, facing the camera: the cabins are dead ends', (_, text) => {
    const map = parseLevelMap(text);
    const lift = createLifts(map)[0];
    if (!lift) throw new Error('no lift');
    for (const cabin of lift.stops) {
      const sides = new Set<string>();
      for (const t of cabin) {
        for (const [name, dx, dy] of [
          ['up', 0, -1],
          ['right', 1, 0],
          ['down', 0, 1],
          ['left', -1, 0],
        ] as const) {
          const x = t.x + dx;
          const y = t.y + dy;
          if (cabin.some((c) => c.x === x && c.y === y)) continue;
          const tile = map.tiles[y * map.width + x];
          if (tile === 'floor') sides.add(name);
        }
      }
      expect([...sides]).toEqual(['down']);
    }
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

describe('bots take the lift the right way', () => {
  /** Three floors, one car each, doors facing down; the middle floor has player 1. */
  const THREE_FLOORS = parseLevelMap(
    [
      '#######',
      '#.LLL.#',
      '#.....#',
      '#######',
      '#.LLL.#',
      '#.1...#',
      '#######',
      '#.LLL.#',
      '#.234.#',
      '#######',
    ].join('\n'),
  );

  /** The lift standing open at the middle floor, next going `dir` (+1 down, -1 up). */
  function openAtMiddle(dir: 1 | -1): GameState {
    const state = game([1], THREE_FLOORS);
    const lift = state.lifts[0];
    if (!lift) throw new Error('no lift');
    Object.assign(lift, { at: 1, dir, phase: 'open', until: state.tick + LIFT_OPEN_TICKS });
    return state;
  }

  const down = (from: { x: number; y: number }) => pathTo(THREE_FLOORS, from, { x: 3, y: 8 }) ?? [];
  const up = (from: { x: number; y: number }) => pathTo(THREE_FLOORS, from, { x: 3, y: 2 }) ?? [];

  it('gets in when the next stop is the floor its walk needs', () => {
    const state = openAtMiddle(1);
    expect(liftGate(state, { x: 3, y: 5 }, down({ x: 3, y: 5 }))).toBeNull();
    expect(liftGate(state, { x: 3, y: 4 }, down({ x: 3, y: 4 }))).toBeNull();
  });

  it('waits outside a car that goes the other way, and gets out of one', () => {
    const state = openAtMiddle(-1);
    expect(liftGate(state, { x: 3, y: 5 }, down({ x: 3, y: 5 }))).toEqual({ x: 0, y: 0 });
    expect(liftGate(state, { x: 3, y: 4 }, down({ x: 3, y: 4 }))).toEqual({ x: 0, y: 1 });
    // Going up is fine.
    expect(liftGate(state, { x: 3, y: 5 }, up({ x: 3, y: 5 }))).toBeNull();
  });

  it('turns round at the end floors', () => {
    const state = game([1], THREE_FLOORS);
    const lift = state.lifts[0];
    if (!lift) throw new Error('no lift');
    Object.assign(lift, { at: 2, dir: 1, phase: 'open' });
    // From the bottom floor the car only goes up, whatever way it came.
    const from = { x: 3, y: 8 };
    expect(liftGate(state, from, up(from))).toBeNull();
  });

  it('on Hot Desking a bot in the test lab lets the car go up and rides the next one down', () => {
    const state = createGame({ ...HOT_DESKING, map: parseLevelMap(hotDeskingDraft) }, 3, [1]);
    state.nextOrderTick = Number.MAX_SAFE_INTEGER;
    const lift = state.lifts[0];
    if (!lift) throw new Error('no lift');
    // Open at the test lab (floor 1), next going up to the meeting room.
    Object.assign(lift, { at: 1, dir: -1, phase: 'open', until: LIFT_OPEN_TICKS });
    standIn(state, 1, 13, 1);
    const ticket = addTicket(state, 1);
    give(1, ticket);
    const bots = [createBot(1)];
    let wentUp = false;
    let reachedDesks = false;
    for (let i = 0; i < 30 * SECOND && !reachedDesks; i++) {
      tick(state, [botInput(state, bots[0] ?? createBot(1), bots)]);
      const pos = state.players[0]?.pos ?? { x: 0, y: 0 };
      if (pos.x < 8 && pos.y < 5) wentUp = true;
      if (pos.y >= 7) reachedDesks = true;
    }
    expect(wentUp).toBe(false);
    expect(reachedDesks).toBe(true);
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
