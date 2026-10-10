import { describe, expect, it } from 'vitest';
import {
  MANAGER_BUMP_COOLDOWN_TICKS,
  MANAGER_PAUSE_MAX_TICKS,
  MANAGER_PAUSE_MIN_TICKS,
  MANAGER_RADIUS,
  MANAGER_SPEED,
  MANAGER_STUCK_TICKS,
  PLAYER_RADIUS,
  TICKS_PER_SECOND,
} from './balance';
import { getTile, parseLevelMap } from './level';
import { levelWithMap } from './levels';
import { type Manager, createManagers, managerTiles } from './manager';
import { type GameState, createGame, getPlayer } from './state';
import { cmd, idle } from './testing';
import { tick } from './tick';

/** A corridor on row 1 with the manager at its left end; players wait below. */
const CORRIDOR = parseLevelMap(
  ['#########', '#M......#', '####.####', '#1234...#', '#########'].join('\n'),
);

function game(map = CORRIDOR, players = [1, 2]): GameState {
  const state = createGame(levelWithMap(map), 7, players);
  state.nextOrderTick = Number.MAX_SAFE_INTEGER;
  return state;
}

function manager(state: GameState): Manager {
  const m = state.managers[0];
  if (!m) throw new Error('No manager');
  return m;
}

/** Sends the manager along row 1 to column `x`, starting now. */
function walkTo(state: GameState, x: number): void {
  const m = manager(state);
  m.waitTicks = 0;
  m.path = [];
  for (let i = Math.round(m.pos.x) + 1; i <= x; i++) m.path.push({ x: i, y: 1 });
}

describe('createManagers', () => {
  it('puts one manager on each M, standing still for a moment', () => {
    const map = parseLevelMap('M1M\n234');
    expect(createManagers(map)).toMatchObject([
      { id: 1, pos: { x: 0, y: 0 }, path: [], waitTicks: MANAGER_PAUSE_MIN_TICKS },
      { id: 2, pos: { x: 2, y: 0 } },
    ]);
  });

  it('levels without an M have none, and never roll the RNG for them', () => {
    const state = createGame(levelWithMap(parseLevelMap('12\n34')), 3, [1]);
    state.nextOrderTick = Number.MAX_SAFE_INTEGER;
    const rngBefore = state.rngState;
    idle(state, 1000);
    expect(state.managers).toEqual([]);
    expect(state.rngState).toBe(rngBefore);
  });
});

describe('walking', () => {
  it('walks its path at MANAGER_SPEED, then stands still for a random pause', () => {
    const state = game();
    walkTo(state, 4);
    const ticksFor3Tiles = Math.ceil((3 / MANAGER_SPEED) * TICKS_PER_SECOND);
    idle(state, ticksFor3Tiles - 5);
    expect(manager(state).pos.x).toBeGreaterThan(3);
    expect(manager(state).pos.x).toBeLessThan(4);
    // Each tile center it reaches eats the rest of that tick's step: a tick per tile at most.
    idle(state, 5 + 3);
    expect(manager(state).pos).toEqual({ x: 4, y: 1 });
    expect(manager(state).path).toEqual([]);
    expect(manager(state).waitTicks).toBeGreaterThanOrEqual(MANAGER_PAUSE_MIN_TICKS - 1);
    expect(manager(state).waitTicks).toBeLessThanOrEqual(MANAGER_PAUSE_MAX_TICKS);
  });

  it('wanders the floor by itself, never into walls, the same way every run', () => {
    const run = (): GameState => {
      const state = game();
      const seen = new Set<string>();
      for (let i = 0; i < 60 * TICKS_PER_SECOND; i++) {
        tick(state, []);
        const m = manager(state);
        expect(getTile(state.level, Math.round(m.pos.x), Math.round(m.pos.y))).toBe('floor');
        seen.add(`${Math.round(m.pos.x)},${Math.round(m.pos.y)}`);
      }
      expect(seen.size).toBeGreaterThan(4);
      return state;
    };
    expect(run()).toEqual(run());
  });

  it('reports the tiles it stands on and walks into for bots', () => {
    const state = game();
    walkTo(state, 3);
    expect(managerTiles(state)).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]);
  });
});

describe('players and the manager', () => {
  it('a walking manager shoves a player in its way, once per cooldown', () => {
    const state = game();
    const p1 = getPlayer(state, 1);
    if (!p1) throw new Error('no p1');
    p1.pos = { x: 3, y: 1 };
    walkTo(state, 7);
    const bumps: number[] = [];
    for (let i = 0; i < 2 * TICKS_PER_SECOND; i++) {
      tick(state, []);
      for (const e of state.events) {
        if (e.type === 'managerBumped') {
          expect(e.target).toBe(1);
          bumps.push(state.tick);
          expect(p1.vel.x).toBeGreaterThan(0);
        }
      }
    }
    expect(bumps.length).toBeGreaterThanOrEqual(1);
    const gaps = bumps.slice(1).map((t, i) => t - (bumps[i] ?? 0));
    for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(MANAGER_BUMP_COOLDOWN_TICKS);
    expect(p1.pos.x).toBeGreaterThan(manager(state).pos.x);
  });

  it('cannot be pushed: a player walking into a standing manager stays outside it', () => {
    const state = game();
    const m = manager(state);
    m.waitTicks = 10_000;
    const p1 = getPlayer(state, 1);
    if (!p1) throw new Error('no p1');
    p1.pos = { x: 3, y: 1 };
    for (let i = 0; i < TICKS_PER_SECOND; i++) {
      tick(state, [cmd(state, 1, { move: { x: -1, y: 0 } })]);
    }
    expect(m.pos).toEqual({ x: 1, y: 1 });
    expect(p1.pos.x - m.pos.x).toBeGreaterThanOrEqual(PLAYER_RADIUS + MANAGER_RADIUS - 1e-6);
    expect(state.events.some((e) => e.type === 'managerBumped')).toBe(false);
  });

  it('a dash into a manager stops dead', () => {
    const state = game();
    manager(state).waitTicks = 10_000;
    const p1 = getPlayer(state, 1);
    if (!p1) throw new Error('no p1');
    p1.pos = { x: 3, y: 1 };
    p1.facing = { x: -1, y: 0 };
    tick(state, [cmd(state, 1, { dash: true })]);
    idle(state, 6);
    expect(p1.dashTicks).toBe(0);
    expect(p1.pos.x).toBeGreaterThan(1.5);
  });

  it('a player pinned against a wall stops it; it gives up and walks elsewhere', () => {
    const state = game();
    const p1 = getPlayer(state, 1);
    if (!p1) throw new Error('no p1');
    p1.pos = { x: 7, y: 1 };
    walkTo(state, 7);
    // ~2.5 s to walk there, then MANAGER_STUCK_TICKS blocked.
    idle(state, 3 * TICKS_PER_SECOND + MANAGER_STUCK_TICKS);
    const m = manager(state);
    // The player is squashed into the far corner, the manager right up against them.
    const wallSide = 7.5 - PLAYER_RADIUS;
    expect(p1.pos.x).toBeCloseTo(wallSide);
    expect(m.pos.x).toBeLessThan(wallSide - PLAYER_RADIUS - MANAGER_RADIUS + 0.05);
    // It stood blocked for MANAGER_STUCK_TICKS, then dropped the walk.
    expect(m.path.some((p) => p.x === 7)).toBe(false);
  });

  it('the state stays plain JSON', () => {
    const state = game();
    idle(state, 10 * TICKS_PER_SECOND);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});
