import { describe, expect, it } from 'vitest';
import demoDayDraft from '../../maps/drafts/demo-day.txt?raw';
import onCallDraft from '../../maps/drafts/on-call.txt?raw';
import {
  MANAGER_BUMP_COOLDOWN_TICKS,
  MOP_TRAIL_TICKS,
  TAP_DRY_TICKS,
  TAP_FIX_TICKS,
  TAP_FLOOD_RING_TICKS,
  TICKS_PER_SECOND,
} from './balance';
import { botInput, createBot } from './bot';
import { canPutDown } from './interact';
import { type LevelMap, parseLevelMap } from './level';
import { levelWithMap } from './levels';
import { createManagers } from './manager';
import { movePlayer } from './movement';
import { createTaps, isWet, mopLoop, tapWarns, wetCheck } from './spills';
import { type GameState, type Player, createGame, newPlayer } from './state';
import { addTicket, cmd, idle } from './testing';
import { tick } from './tick';

const SECOND = TICKS_PER_SECOND;

/** A tap on the back wall, its zone below it, the players at the front. */
const TAP_ROOM = parseLevelMap(
  ['#######', '#..o..#', '#.%%%.#', '#.%%%.#', '#1234.#', '#######'].join('\n'),
);

/** A mop loop round a block, clockwise from its top-left corner (1,1). */
const MOP_RING = parseLevelMap(
  ['#######', '#rrrrr#', '#r###r#', '#rrrrr#', '#1234.#', '#######'].join('\n'),
);

function tapGame(): GameState {
  const state = createGame(
    levelWithMap(TAP_ROOM, { spills: { firstLeakTick: 10, everyTicks: 5 * SECOND } }),
    7,
    [1],
  );
  state.nextOrderTick = Number.MAX_SAFE_INTEGER;
  return state;
}

function wetAt(state: GameState, x: number, y: number): boolean {
  return isWet(state.level, state.wet, state.tick, x, y);
}

/** Player 1 standing left of the tap, facing it. */
function atTap(state: GameState): Player {
  const p = state.players[0];
  if (!p) throw new Error('no player');
  p.pos = { x: 2, y: 1 };
  p.facing = { x: 1, y: 0 };
  return p;
}

describe('wet floor', () => {
  const run = (map: LevelMap, ticks: number): Player => {
    const p = newPlayer(1, { x: 1, y: 1 });
    const state = { level: map, wet: {}, tick: 0 };
    for (let i = 0; i < ticks; i++) movePlayer(map, p, { x: 1, y: 0 }, false, wetCheck(state));
    return p;
  };
  const dry = parseLevelMap(['##########', '#........#', '#1234....#', '##########'].join('\n'));
  const wet = parseLevelMap(['##########', '#________#', '#1234....#', '##########'].join('\n'));

  it('speeds up slower on wet tiles', () => {
    expect(run(wet, 6).vel.x).toBeLessThan(run(dry, 6).vel.x * 0.5);
  });

  it('slides on after letting go', () => {
    const slide = (map: LevelMap): number => {
      const p = run(map, 30);
      const state = { level: map, wet: {}, tick: 0 };
      const from = p.pos.x;
      for (let i = 0; i < 6; i++) movePlayer(map, p, { x: 0, y: 0 }, false, wetCheck(state));
      return p.pos.x - from;
    };
    expect(slide(wet)).toBeGreaterThan(slide(dry) * 2);
  });
});

describe('leaky tap', () => {
  it('splits the zone into rings by steps from the tap', () => {
    const [tap] = createTaps(TAP_ROOM, undefined);
    const ring = (x: number, y: number): number | undefined =>
      tap?.zone.find((z) => z.index === y * TAP_ROOM.width + x)?.ring;
    expect(ring(3, 2)).toBe(0);
    expect(ring(2, 2)).toBe(1);
    expect(ring(3, 3)).toBe(1);
    expect(ring(2, 3)).toBe(2);
    expect(tap?.zone).toHaveLength(6);
  });

  it('never leaks without a schedule', () => {
    const state = createGame(levelWithMap(TAP_ROOM), 7, [1]);
    idle(state, 120 * SECOND);
    expect(state.taps[0]?.phase).toBe('dry');
    expect(state.wet).toEqual({});
  });

  it('warns, leaks on time and floods ring by ring', () => {
    const state = tapGame();
    const tap = state.taps[0];
    if (!tap) throw new Error('no tap');
    expect(tapWarns(tap, state.tick)).toBe(true);
    idle(state, 11);
    expect(tap.phase).toBe('leaking');
    expect(wetAt(state, 3, 2)).toBe(true);
    expect(wetAt(state, 2, 2)).toBe(false);
    idle(state, TAP_FLOOD_RING_TICKS);
    expect(wetAt(state, 2, 2)).toBe(true);
    expect(wetAt(state, 2, 3)).toBe(false);
    idle(state, 10 * SECOND);
    expect([2, 3, 4].every((x) => wetAt(state, x, 3))).toBe(true);
    expect(wetAt(state, 1, 2)).toBe(false);
  });

  it('is fixed by holding work at it; the zone dries outer ring first, then it leaks again', () => {
    const state = tapGame();
    const tap = state.taps[0];
    if (!tap) throw new Error('no tap');
    idle(state, 10 * SECOND);
    atTap(state);
    for (let i = 0; i < TAP_FIX_TICKS; i++) tick(state, [cmd(state, 1, { work: true })]);
    expect(tap.phase).toBe('drying');
    expect(state.events).toContainEqual({ type: 'tapFixed', x: 3, y: 1 });
    idle(state, TAP_DRY_TICKS / 2);
    expect(wetAt(state, 2, 3)).toBe(false);
    expect(wetAt(state, 3, 2)).toBe(true);
    idle(state, TAP_DRY_TICKS / 2 + 1);
    expect(state.wet).toEqual({});
    expect(tap.phase).toBe('dry');
    idle(state, 5 * SECOND + 1);
    expect(tap.phase).toBe('leaking');
  });

  it('counts one tick of fixing per tick, however many work at it', () => {
    const state = createGame(
      levelWithMap(TAP_ROOM, { spills: { firstLeakTick: 1, everyTicks: SECOND } }),
      7,
      [1, 2],
    );
    idle(state, 2);
    atTap(state);
    const p2 = state.players[1];
    if (!p2) throw new Error('no player 2');
    p2.pos = { x: 4, y: 1 };
    p2.facing = { x: -1, y: 0 };
    for (let i = 0; i < 10; i++) {
      tick(state, [cmd(state, 1, { work: true }), cmd(state, 2, { work: true })]);
    }
    expect(state.taps[0]?.fixTicks).toBe(10);
  });

  it('takes no tickets', () => {
    const state = tapGame();
    const ticket = addTicket(state, 1);
    expect(canPutDown(state, ticket, 3, 1)).toBe(false);
    expect(canPutDown(state, ticket, 0, 1)).toBe(false);
  });

  it('gets fixed by a bot', () => {
    const state = tapGame();
    const bot = createBot(1);
    for (let i = 0; i < 30 * SECOND; i++) tick(state, [botInput(state, bot, [bot])]);
    expect(state.taps[0]?.phase).not.toBe('leaking');
  });
});

describe('mop robot', () => {
  it('reads the loop clockwise or the other way round', () => {
    const clockwise = mopLoop(MOP_RING, true);
    expect(clockwise).toHaveLength(12);
    expect(clockwise.slice(0, 3)).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
    ]);
    const other = mopLoop(MOP_RING, false);
    expect(other.slice(0, 3)).toEqual([
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 1, y: 3 },
    ]);
  });

  it('has no loop without a closed route', () => {
    const open = parseLevelMap(['#######', '#rrrrr#', '#1234.#', '#######'].join('\n'));
    expect(mopLoop(open, true)).toEqual([]);
    expect(createManagers(open, { clockwise: true })).toEqual([]);
  });

  it('drives the loop without stopping and leaves a trail that dries', () => {
    const state = createGame(levelWithMap(MOP_RING, { mopRobot: { clockwise: true } }), 7, [1]);
    state.nextOrderTick = Number.MAX_SAFE_INTEGER;
    const robot = state.managers.find((m) => m.kind === 'mopRobot');
    if (!robot) throw new Error('no robot');
    idle(state, 2 * SECOND);
    expect(robot.pos.y).toBe(1);
    expect(robot.pos.x).toBeGreaterThan(4);
    expect(wetAt(state, 1, 1)).toBe(true);
    expect(wetAt(state, 1, 3)).toBe(false);
    idle(state, 20 * SECOND);
    expect(robot.waitTicks).toBe(0);
    // Parked, its trail dries behind it.
    robot.waitTicks = Number.MAX_SAFE_INTEGER;
    const parked = { x: Math.round(robot.pos.x), y: Math.round(robot.pos.y) };
    idle(state, MOP_TRAIL_TICKS + 1);
    const wetNow = state.level.marks
      .filter((m) => m.kind === 'mopRoute' && wetAt(state, m.x, m.y))
      .map(({ x, y }) => ({ x, y }));
    expect(wetNow).toEqual([parked]);
  });

  it('shoves a player in its way', () => {
    const state = createGame(levelWithMap(MOP_RING, { mopRobot: { clockwise: true } }), 7, [1]);
    const p = state.players[0];
    if (!p) throw new Error('no player');
    p.pos = { x: 3, y: 1 };
    let bumped = false;
    for (let i = 0; i < MANAGER_BUMP_COOLDOWN_TICKS * 2 && !bumped; i++) {
      tick(state, [cmd(state, 1, {})]);
      bumped = state.events.some((e) => e.type === 'managerBumped');
    }
    expect(bumped).toBe(true);
  });
});

describe('the Startup drafts', () => {
  it('give Demo Day a tap with its spill zone', () => {
    const map = parseLevelMap(demoDayDraft);
    const [tap, ...more] = createTaps(map, undefined);
    expect(more).toEqual([]);
    expect(tap?.zone.length).toBeGreaterThan(10);
  });

  it('give On Call a closed loop for the mop robot', () => {
    const map = parseLevelMap(onCallDraft);
    expect(mopLoop(map, true).length).toBe(map.marks.filter((m) => m.kind === 'mopRoute').length);
  });
});

describe('determinism', () => {
  it('plays the same twice with leaks, the mop and bots', () => {
    const play = (): GameState => {
      const state = createGame(
        levelWithMap(parseLevelMap(onCallDraft), {
          mopRobot: { clockwise: true },
          spills: { firstLeakTick: SECOND, everyTicks: SECOND },
        }),
        3,
        [1, 2],
      );
      const bots = [createBot(1), createBot(2)];
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
