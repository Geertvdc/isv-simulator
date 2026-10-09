import { describe, expect, it } from 'vitest';
import { findPath, runBots } from './bot';
import { parseLevelMap } from './level';
import { GARAGE } from './levels';

describe('findPath', () => {
  const map = parseLevelMap(['#####', '#1.K#', '#2#.#', '#34.#', '#####'].join('\n'));

  it('finds the shortest walk to a tile next to the target', () => {
    expect(findPath(map, { x: 1, y: 3 }, { x: 3, y: 1 })).toEqual([
      { x: 2, y: 3 },
      { x: 3, y: 3 },
      { x: 3, y: 2 },
    ]);
  });

  it('is empty when already standing next to the target', () => {
    expect(findPath(map, { x: 2, y: 1 }, { x: 3, y: 1 })).toEqual([]);
  });

  it('is null when the target cannot be reached', () => {
    const walled = parseLevelMap(['######', '#1#.K#', '#2#.##', '#34###', '######'].join('\n'));
    expect(findPath(walled, { x: 1, y: 1 }, { x: 4, y: 1 })).toBeNull();
  });
});

describe('bot run on the garage', () => {
  it('two bots with a fixed seed earn at least 1 star', () => {
    const run = runBots(GARAGE, 1, 2);
    expect(run.shipped).toBeGreaterThan(5);
    expect(run.result.stars).toBeGreaterThanOrEqual(1);
  });

  it('is deterministic per seed', () => {
    expect(runBots(GARAGE, 3, 2)).toEqual(runBots(GARAGE, 3, 2));
  });
});
