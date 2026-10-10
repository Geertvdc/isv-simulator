import { describe, expect, it } from 'vitest';
import garage from '../../maps/level-01-garage.txt?raw';
import { type Tile, getTile, isSolid, isWorkSurface, parseLevelMap } from './level';

/** Wraps rows in a wall border with the four spawns on the bottom row. */
function level(...rows: string[]): string {
  const width = rows[0]?.length ?? 0;
  const spawnRow = '1234'.padEnd(width, '.');
  return ['#' + '#'.repeat(width) + '#', ...[...rows, spawnRow].map((r) => `#${r}#`)].join('\n');
}

describe('parseLevelMap', () => {
  it('parses every tile char into a row-major grid', () => {
    const map = parseLevelMap('#.CIKTRPSXB\n1234.......');
    const expected: Tile[] = [
      'wall',
      'floor',
      'counter',
      'inbox',
      'keyboard',
      'testBench',
      'review',
      'pipeline',
      'ship',
      'bin',
      'bugQueue',
    ];
    expect(map.width).toBe(11);
    expect(map.height).toBe(2);
    expect(map.tiles.slice(0, 11)).toEqual(expected);
  });

  it('turns spawn digits into floor and records them per player', () => {
    const map = parseLevelMap('3..1\n.2.4');
    expect(map.spawns).toEqual([
      { x: 3, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 0 },
      { x: 3, y: 1 },
    ]);
    expect(getTile(map, 3, 0)).toBe('floor');
    expect(getTile(map, 1, 1)).toBe('floor');
  });

  it('accepts CRLF line endings and no trailing newline', () => {
    expect(parseLevelMap('#.\r\n12\r\n34')).toEqual(parseLevelMap('#.\n12\n34\n'));
  });

  it('rejects uneven rows with the line number', () => {
    expect(() => parseLevelMap('###\n##\n###')).toThrow('Map line 2 has length 2, expected 3');
  });

  it('rejects unknown chars with line and column', () => {
    expect(() => parseLevelMap(level('.Z.'))).toThrow("Unknown map char 'Z' at line 2, column 3");
  });

  it('rejects spaces and digits that are not spawns', () => {
    expect(() => parseLevelMap(level('. .'))).toThrow("Unknown map char ' '");
    expect(() => parseLevelMap(level('.5.'))).toThrow("Unknown map char '5'");
    expect(() => parseLevelMap(level('.0.'))).toThrow("Unknown map char '0'");
  });

  it('reads manager spawns (M) and meeting tiles (m) as floor', () => {
    const map = parseLevelMap('1M2\nmm.\n34M');
    expect(map.managerSpawns).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 2 },
    ]);
    expect(map.meetingTiles).toEqual([
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]);
    expect(getTile(map, 1, 0)).toBe('floor');
    expect(getTile(map, 0, 1)).toBe('floor');
    expect(parseLevelMap('12\n34')).toMatchObject({ managerSpawns: [], meetingTiles: [] });
  });

  it('rejects a duplicate spawn with line and column', () => {
    expect(() => parseLevelMap('12.\n341')).toThrow('Duplicate spawn 1 at line 2, column 3');
  });

  it('rejects a level missing a spawn', () => {
    expect(() => parseLevelMap('12\n3.')).toThrow('Map has no spawn 4');
  });

  it('rejects an empty map', () => {
    expect(() => parseLevelMap('')).toThrow('Map is empty');
    expect(() => parseLevelMap('\n')).toThrow('Map is empty');
  });

  it('parses the garage', () => {
    const map = parseLevelMap(garage);
    expect(map.width).toBe(14);
    expect(map.height).toBe(10);
    expect(map.tiles).toHaveLength(14 * 10);
    expect(map.spawns).toEqual([
      { x: 1, y: 5 },
      { x: 12, y: 5 },
      { x: 5, y: 1 },
      { x: 8, y: 1 },
    ]);
    expect(getTile(map, 0, 0)).toBe('wall');
    expect(getTile(map, 6, 0)).toBe('inbox');
    expect(getTile(map, 11, 0)).toBe('bugQueue');
    expect(getTile(map, 1, 1)).toBe('bin');
    expect(getTile(map, 1, 2)).toBe('keyboard');
    expect(getTile(map, 12, 2)).toBe('testBench');
    expect(getTile(map, 5, 3)).toBe('counter');
    expect(getTile(map, 12, 6)).toBe('pipeline');
    expect(getTile(map, 1, 8)).toBe('counter');
    expect(getTile(map, 6, 9)).toBe('ship');
  });
});

describe('getTile', () => {
  const map = parseLevelMap('#.C\n12K\n34.');

  it('returns the tile inside the map', () => {
    expect(getTile(map, 1, 0)).toBe('floor');
    expect(getTile(map, 2, 0)).toBe('counter');
    expect(getTile(map, 2, 1)).toBe('keyboard');
  });

  it('returns null out of bounds on every side', () => {
    expect(getTile(map, -1, 0)).toBeNull();
    expect(getTile(map, 0, -1)).toBeNull();
    expect(getTile(map, 3, 0)).toBeNull();
    expect(getTile(map, 0, 3)).toBeNull();
  });

  it('returns null for non-integer coordinates', () => {
    expect(getTile(map, 0.5, 0)).toBeNull();
  });
});

describe('isSolid', () => {
  it('lets only floor through', () => {
    expect(isSolid('floor')).toBe(false);
    for (const tile of [
      'wall',
      'counter',
      'inbox',
      'keyboard',
      'testBench',
      'review',
      'pipeline',
      'ship',
      'bin',
    ] as const) {
      expect(isSolid(tile)).toBe(true);
    }
  });

  it('treats out of bounds as solid', () => {
    expect(isSolid(null)).toBe(true);
  });
});

describe('isWorkSurface', () => {
  it('is true for counters and stations only', () => {
    expect(isWorkSurface('counter')).toBe(true);
    expect(isWorkSurface('keyboard')).toBe(true);
    expect(isWorkSurface('ship')).toBe(true);
    expect(isWorkSurface('floor')).toBe(false);
    expect(isWorkSurface('wall')).toBe(false);
    expect(isWorkSurface(null)).toBe(false);
  });
});
