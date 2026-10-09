import { describe, expect, it } from 'vitest';
import { GARAGE } from './levels';
import { type GameState, type InputCommand, type Vec, createGame, targetTile } from './state';
import { tick } from './tick';

function newGame(): GameState {
  return createGame(GARAGE, 42, [1]);
}

function input(state: GameState, move: Vec, playerId = 1): InputCommand {
  return { playerId, tick: state.tick, move, interact: false, work: false };
}

describe('createGame', () => {
  it('puts player 1 on spawn 1, standing still', () => {
    const state = newGame();
    expect(state.tick).toBe(0);
    expect(state.players).toHaveLength(1);
    const [p] = state.players;
    expect(p?.id).toBe(1);
    expect(p?.pos).toEqual(state.level.spawns[0]);
    expect(p?.vel).toEqual({ x: 0, y: 0 });
  });

  it('spawns each player on their own spawn point', () => {
    const state = createGame(GARAGE, 42, [1, 3, 4, 2]);
    expect(state.players.map((p) => p.id)).toEqual([1, 3, 4, 2]);
    for (const p of state.players) expect(p.pos).toEqual(state.level.spawns[p.id - 1]);
  });

  it('rejects no players, duplicates and ids without a spawn', () => {
    const level = GARAGE;
    expect(() => createGame(level, 1, [])).toThrow();
    expect(() => createGame(level, 1, [1, 1])).toThrow(/Duplicate/);
    expect(() => createGame(level, 1, [5])).toThrow(/no spawn for player 5/);
    expect(() => createGame(level, 1, [0])).toThrow(/no spawn for player 0/);
  });

  it('survives a JSON round trip', () => {
    const state = newGame();
    for (let i = 0; i < 30; i++) tick(state, [input(state, { x: 1, y: 0.3 })]);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});

describe('tick', () => {
  it('advances the tick counter and moves the player along its input', () => {
    const state = newGame();
    const startX = state.players[0]?.pos.x ?? 0;
    tick(state, [input(state, { x: 1, y: 0 })]);
    tick(state, [input(state, { x: 1, y: 0 })]);
    expect(state.tick).toBe(2);
    expect(state.players[0]?.pos.x).toBeGreaterThan(startX);
  });

  it('keeps a player without input still and ignores unknown players', () => {
    const state = newGame();
    const before = structuredClone(state.players);
    tick(state, [input(state, { x: 1, y: 0 }, 7)]);
    expect(state.players).toEqual(before);
  });

  it('is deterministic for the same inputs', () => {
    const a = newGame();
    const b = newGame();
    for (let i = 0; i < 200; i++) {
      const move = { x: Math.cos(i / 20), y: Math.sin(i / 13) };
      tick(a, [input(a, move)]);
      tick(b, [input(b, move)]);
    }
    expect(a).toEqual(b);
  });
});

describe('targetTile', () => {
  it.each([
    ['right', { x: 1, y: 0 }, { x: 6, y: 5 }],
    ['left', { x: -1, y: 0 }, { x: 4, y: 5 }],
    ['back', { x: 0, y: -1 }, { x: 5, y: 4 }],
    ['front', { x: 0, y: 1 }, { x: 5, y: 6 }],
  ])('picks the neighbour on the %s', (_, facing, expected) => {
    const state = newGame();
    const p = state.players[0];
    if (!p) throw new Error('no player');
    p.pos = { x: 5, y: 5 };
    p.facing = facing;
    expect(targetTile(state, 1)).toEqual(expected);
  });

  it('picks the counter a player is pressed against', () => {
    const state = newGame();
    // Spawn 1 is at (1, 5) with a counter right behind it at (1, 4).
    for (let i = 0; i < 60; i++) tick(state, [input(state, { x: 0, y: -1 })]);
    expect(targetTile(state, 1)).toEqual({ x: 1, y: 4 });
    expect(state.level.tiles[4 * state.level.width + 1]).toBe('counter');
  });
});
