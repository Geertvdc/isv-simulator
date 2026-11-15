import { describe, expect, it } from 'vitest';
import atriumDraft from '../../maps/drafts/the-atrium.txt?raw';
import designSprintDraft from '../../maps/drafts/design-sprint.txt?raw';
import monorepoDraft from '../../maps/drafts/monorepo.txt?raw';
import { SHUTTLE_SPEED, SHUTTLE_WAIT_TICKS, TICKS_PER_SECOND } from './balance';
import { botInput, createBot } from './bot';
import { beltsStopped } from './campus';
import { parseLevelMap } from './level';
import { DESIGN_SPRINT, MONOREPO, THE_ATRIUM, levelWithMap } from './levels';
import { createLifts } from './lifts';
import { type GameState, createGame } from './state';
import { addTicket, cmd, give, idle } from './testing';
import { tick } from './tick';

const SECOND = TICKS_PER_SECOND;

/** A travelator along row 1, running east. */
const TRAVELATOR = parseLevelMap(
  ['############', '#QQQQQQQQ..#', '#1234......#', '############'].join('\n'),
);

function travelatorGame(): GameState {
  const state = createGame(levelWithMap(TRAVELATOR, { travelators: [{ x: 1, y: 0 }] }), 7, [1]);
  state.nextOrderTick = Number.MAX_SAFE_INTEGER;
  return state;
}

function put(state: GameState, id: number, x: number, y: number): void {
  const p = state.players.find((pl) => pl.id === id);
  if (!p) throw new Error(`no player ${id}`);
  p.pos = { x, y };
  p.vel = { x: 0, y: 0 };
}

describe('travelator', () => {
  it('carries whoever stands on it', () => {
    const state = travelatorGame();
    put(state, 1, 2, 1);
    idle(state, SECOND);
    expect(state.players[0]?.pos.x).toBeGreaterThan(4.5);
  });

  it('is fast with it and slow against it', () => {
    const run = (dx: number): number => {
      const state = travelatorGame();
      put(state, 1, 5, 1);
      for (let i = 0; i < SECOND / 2; i++) tick(state, [cmd(state, 1, { move: { x: dx, y: 0 } })]);
      return Math.abs((state.players[0]?.pos.x ?? 5) - 5);
    };
    expect(run(1)).toBeGreaterThan(run(-1) * 2);
  });

  it('takes a ticket left on it to its end', () => {
    const state = travelatorGame();
    const ticket = addTicket(state, 2);
    idle(state, 5 * SECOND);
    expect(ticket.location).toEqual({ kind: 'tile', x: 8, y: 1 });
  });

  it('does nothing without a direction', () => {
    const state = createGame(levelWithMap(TRAVELATOR), 7, [1]);
    put(state, 1, 2, 1);
    idle(state, SECOND);
    expect(state.players[0]?.pos.x).toBeCloseTo(2, 5);
  });
});

describe('revolving door', () => {
  /** A wall across the middle with a revolving door at (3,2). */
  const DOOR = parseLevelMap(['#######', '#.....#', '###*###', '#1234.#', '#######'].join('\n'));

  it('lets one person through at a time', () => {
    const state = createGame(levelWithMap(DOOR), 7, [1, 2]);
    put(state, 1, 3, 2);
    put(state, 2, 3, 1);
    for (let i = 0; i < SECOND / 2; i++) {
      tick(state, [cmd(state, 1, {}), cmd(state, 2, { move: { x: 0, y: 1 } })]);
    }
    expect(state.players[1]?.pos.y).toBeLessThan(1.5);
  });

  it('bounces a thrown ticket off the glass', () => {
    const state = createGame(levelWithMap(DOOR), 7, [1]);
    put(state, 1, 3, 3);
    const p = state.players[0];
    if (!p) throw new Error('no player');
    p.facing = { x: 0, y: -1 };
    const ticket = addTicket(state, 1);
    give(1, ticket);
    for (let i = 0; i < 40; i++) tick(state, [cmd(state, 1, { interact: true })]);
    for (let i = 0; i < SECOND; i++) tick(state, [cmd(state, 1, {})]);
    expect(ticket.location.kind === 'tile' && ticket.location.y >= 3).toBe(true);
  });
});

describe('campus shuttle', () => {
  it('is a two-stop lift over the courtyard on Monorepo, as quick as its track', () => {
    const map = parseLevelMap(monorepoDraft);
    const [shuttle] = createLifts(map).filter((l) => l.kind === 'shuttle');
    expect(shuttle?.stops).toEqual([[{ x: 6, y: 2 }], [{ x: 15, y: 2 }]]);
    const state = createGame({ ...MONOREPO, map }, 7, [1]);
    state.nextOrderTick = Number.MAX_SAFE_INTEGER;
    put(state, 1, 6, 2);
    idle(state, SHUTTLE_WAIT_TICKS + 1);
    expect(state.players[0]?.pos).toEqual({ x: 15, y: 2 });
    const ride = Math.ceil((9 / SHUTTLE_SPEED) * SECOND);
    idle(state, ride);
    expect(state.events).toContainEqual({ type: 'liftArrived', lift: 'shuttle', floor: 1 });
  });
});

describe('belt outage', () => {
  it('makes every other incident stop the belts until it ships', () => {
    const state = createGame(levelWithMap(parseLevelMap(atriumDraft)), 7, [1]);
    state.settings = {
      ...state.settings,
      incidents: {
        firstTick: 1,
        intervalTicks: 1,
        jitterTicks: 0,
        timeLimitTicks: 10 * SECOND,
        beltOutageEvery: 2,
      },
    };
    state.nextIncidentTick = 1;
    idle(state, 3);
    expect(state.incidentsOpened).toBe(1);
    expect(beltsStopped(state)).toBe(false);
    state.orders = state.orders.filter((o) => o.kind !== 'incident');
    idle(state, 2);
    expect(state.incidentsOpened).toBe(2);
    expect(beltsStopped(state)).toBe(true);
    const belt = state.level.conveyors[0];
    if (!belt) throw new Error('no belt');
    const ticket = addTicket(state, belt.x);
    ticket.location = { kind: 'tile', x: belt.x, y: belt.y };
    idle(state, 3 * SECOND);
    expect(ticket.location).toEqual({ kind: 'tile', x: belt.x, y: belt.y });
    state.orders = state.orders.filter((o) => o.kind !== 'incident');
    state.nextIncidentTick = null;
    idle(state, 3 * SECOND);
    expect(ticket.location).not.toEqual({ kind: 'tile', x: belt.x, y: belt.y });
  });
});

describe('the Big Tech drafts with bots', () => {
  for (const [name, level, text] of [
    ['The Atrium', THE_ATRIUM, atriumDraft],
    ['Design Sprint', DESIGN_SPRINT, designSprintDraft],
    ['Monorepo', MONOREPO, monorepoDraft],
  ] as const) {
    it(`ships on ${name}, solo and as a team`, () => {
      for (const players of [[1], [1, 2, 3, 4]]) {
        const state = createGame({ ...level, map: parseLevelMap(text) }, 3, players);
        const bots = players.map((id) => createBot(id));
        let shipped = 0;
        for (let i = 0; i < 120 * SECOND; i++) {
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
});
