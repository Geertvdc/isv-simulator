import { describe, expect, it } from 'vitest';
import { encodeSnapshot, decodeSnapshot } from '../net/snapshot';
import { getTile } from './level';
import { GARAGE } from './levels';
import { applyLiveTiles, setLiveTile } from './liveTiles';
import { createGame } from './state';
import { tick } from './tick';

/** Spawn 1 of the garage and the floor tile to its right. */
function setup() {
  const state = createGame(GARAGE, 1, [1]);
  const spawn = GARAGE.map.spawns[0];
  if (!spawn) throw new Error('no spawn');
  return { state, spawn };
}

describe('live tiles', () => {
  it("changes the round's map, never the level's own", () => {
    const { state, spawn } = setup();
    setLiveTile(state, spawn.x + 1, spawn.y, 'wall');
    expect(getTile(state.level, spawn.x + 1, spawn.y)).toBe('wall');
    expect(getTile(GARAGE.map, spawn.x + 1, spawn.y)).toBe('floor');
    expect(createGame(GARAGE, 1, [1]).level).toEqual(GARAGE.map);
  });

  it('keeps every change, also one back to the start value', () => {
    const { state, spawn } = setup();
    const index = String(spawn.y * state.level.width + spawn.x + 1);
    setLiveTile(state, spawn.x + 1, spawn.y, 'wall');
    setLiveTile(state, spawn.x + 1, spawn.y, 'floor');
    expect(state.liveTiles).toEqual({ [index]: 'floor' });
  });

  it('refuses a tile off the map', () => {
    const { state } = setup();
    expect(() => {
      setLiveTile(state, -1, 0, 'wall');
    }).toThrow();
    expect(() => {
      setLiveTile(state, state.level.width, 0, 'wall');
    }).toThrow();
  });

  it('blocks movement where a tile turned solid', () => {
    const { state, spawn } = setup();
    setLiveTile(state, spawn.x + 1, spawn.y, 'wall');
    const right = {
      playerId: 1,
      tick: 0,
      move: { x: 1, y: 0 },
      interact: false,
      work: false,
      dash: false,
    };
    for (let i = 0; i < 60; i++) tick(state, [{ ...right, tick: state.tick }]);
    expect(state.players[0]?.pos.x).toBeLessThan(spawn.x + 0.5);
  });

  it('comes back from a snapshot on the start map, and on a live map too', () => {
    const { state, spawn } = setup();
    setLiveTile(state, spawn.x + 1, spawn.y, 'wall');
    const snapshot = encodeSnapshot(state, 10, []);
    expect(decodeSnapshot(snapshot, GARAGE.map).level).toEqual(state.level);
    expect(decodeSnapshot(snapshot, state.level).level).toEqual(state.level);
  });

  it('applies idempotently', () => {
    const { state, spawn } = setup();
    setLiveTile(state, spawn.x + 1, spawn.y, 'counter');
    const map = structuredClone(GARAGE.map);
    applyLiveTiles(map, state.liveTiles);
    applyLiveTiles(map, state.liveTiles);
    expect(map).toEqual(state.level);
  });
});
