import { describe, expect, it } from 'vitest';
import { type GridPoint, type LevelMap, getTile, parseLevelMap } from './level';
import { NEIGHBOURS, pathTo, searchPath } from './path';

/** An open room with a wall sticking down from the top, and a closed-off pocket at the right. */
const MAP = parseLevelMap(
  ['##########', '#...#..#.#', '#...#..#.#', '#......#C#', '#1234..###', '##########'].join('\n'),
);

const at = (x: number, y: number): GridPoint => ({ x, y });

/** Every step is one tile from the last and on the floor. */
function expectWalkable(map: LevelMap, from: GridPoint, path: readonly GridPoint[]): void {
  let prev = from;
  for (const p of path) {
    expect(Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y)).toBe(1);
    expect(getTile(map, p.x, p.y)).toBe('floor');
    prev = p;
  }
}

describe('NEIGHBOURS', () => {
  it('are the four unit steps', () => {
    expect(NEIGHBOURS).toHaveLength(4);
    for (const d of NEIGHBOURS) expect(Math.abs(d.x) + Math.abs(d.y)).toBe(1);
    expect(new Set(NEIGHBOURS.map((d) => `${d.x},${d.y}`)).size).toBe(4);
  });
});

describe('pathTo', () => {
  it('is empty when already there', () => {
    expect(pathTo(MAP, at(2, 2), at(2, 2))).toEqual([]);
  });

  it('walks a straight line, without the start and ending on the goal', () => {
    expect(pathTo(MAP, at(1, 1), at(1, 3))).toEqual([at(1, 2), at(1, 3)]);
  });

  it('takes a shortest way round a wall', () => {
    const path = pathTo(MAP, at(3, 1), at(5, 1));
    expect(path).not.toBeNull();
    if (!path) return;
    expectWalkable(MAP, at(3, 1), path);
    expect(path.at(-1)).toEqual(at(5, 1));
    // Down to row 3, across and back up: 2 + 2 + 2.
    expect(path).toHaveLength(6);
  });

  it('is the Manhattan distance in the open', () => {
    const path = pathTo(MAP, at(1, 1), at(6, 4));
    expect(path).toHaveLength(5 + 3);
  });

  it('is null for a closed-off tile, a solid tile or one off the map', () => {
    expect(pathTo(MAP, at(1, 1), at(8, 1))).toBeNull();
    expect(pathTo(MAP, at(1, 1), at(8, 3))).toBeNull();
    expect(pathTo(MAP, at(1, 1), at(4, 1))).toBeNull();
    expect(pathTo(MAP, at(1, 1), at(-1, 0))).toBeNull();
  });

  it('walks round blocked tiles, or gives up when they shut the way', () => {
    const open = pathTo(MAP, at(1, 1), at(3, 1), [at(2, 1)]);
    expect(open).not.toBeNull();
    expect(open?.some((p) => p.x === 2 && p.y === 1)).toBe(false);
    expect(open).toHaveLength(4);
    // Rows 1 to 4 of column 4 closed: the wall above and the blocked tiles below.
    expect(pathTo(MAP, at(1, 1), at(5, 1), [at(4, 3), at(4, 4)])).toBeNull();
    expect(pathTo(MAP, at(1, 1), at(3, 1), [at(3, 1)])).toBeNull();
  });

  it('may start on a blocked tile', () => {
    expect(pathTo(MAP, at(1, 1), at(2, 1), [at(1, 1)])).toEqual([at(2, 1)]);
  });

  it('is deterministic: the same path every time, preferring steps in NEIGHBOURS order', () => {
    const a = pathTo(MAP, at(1, 1), at(3, 3));
    expect(pathTo(MAP, at(1, 1), at(3, 3))).toEqual(a);
    // Right comes before down, so it goes right first.
    expect(a?.[0]).toEqual(at(2, 1));
  });
});

describe('searchPath', () => {
  it('finds the nearest of several goals', () => {
    const goals = [at(1, 3), at(6, 1)];
    const path = searchPath(MAP, at(1, 1), (p) => goals.some((g) => g.x === p.x && g.y === p.y));
    expect(path).toEqual([at(1, 2), at(1, 3)]);
  });

  it('checks the start first and asks nothing else when it is a goal', () => {
    const asked: GridPoint[] = [];
    const path = searchPath(MAP, at(2, 2), (p) => {
      asked.push(p);
      return true;
    });
    expect(path).toEqual([]);
    expect(asked).toEqual([at(2, 2)]);
  });

  it('never offers a solid tile as a goal', () => {
    const asked: GridPoint[] = [];
    expect(
      searchPath(MAP, at(1, 1), (p) => {
        asked.push(p);
        return false;
      }),
    ).toBeNull();
    for (const p of asked) expect(getTile(MAP, p.x, p.y)).toBe('floor');
    // Every reachable floor tile was looked at once.
    const keys = asked.map((p) => `${p.x},${p.y}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain('8,1');
  });
});
