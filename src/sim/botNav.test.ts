import { describe, expect, it } from 'vitest';
import { findPath } from './botNav';
import { parseLevelMap } from './level';

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

  it('walks around blocked tiles (a manager) when there is a way around', () => {
    const open = parseLevelMap(['#####', '#1.K#', '#2..#', '#34.#', '#####'].join('\n'));
    const path = findPath(open, { x: 1, y: 2 }, { x: 3, y: 1 }, [], [{ x: 2, y: 2 }]);
    expect(path).not.toBeNull();
    expect(path).not.toContainEqual({ x: 2, y: 2 });
  });

  it('is null when the target cannot be reached', () => {
    const walled = parseLevelMap(['######', '#1#.K#', '#2#.##', '#34###', '######'].join('\n'));
    expect(findPath(walled, { x: 1, y: 1 }, { x: 4, y: 1 })).toBeNull();
  });
});
