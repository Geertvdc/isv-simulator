import { describe, expect, it } from 'vitest';
import garage from '../../maps/level-01-garage.txt?raw';
import {
  MARK_CHARS,
  type Tile,
  conveyorAt,
  getTile,
  isBlock,
  isDrop,
  isSolid,
  isWorkSurface,
  markAt,
  marksOf,
  parseLevelMap,
} from './level';

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

  it('rejects digits that are not spawns', () => {
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
    expect(map.width).toBe(10);
    expect(map.height).toBe(7);
    expect(map.tiles).toHaveLength(10 * 7);
    expect(map.spawns).toEqual([
      { x: 3, y: 2 },
      { x: 7, y: 3 },
      { x: 2, y: 5 },
      { x: 6, y: 5 },
    ]);
    expect(getTile(map, 0, 0)).toBe('wall');
    expect(getTile(map, 2, 0)).toBe('bugQueue');
    expect(getTile(map, 3, 0)).toBe('inbox');
    expect(getTile(map, 9, 1)).toBe('void');
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

describe('level shapes', () => {
  const map = parseLevelMap(['  ####', '  #12#', '###~4#', '#3>vC#', '###C##'].join('\n'));

  it('reads spaces as void, ~ as a gap and arrows as conveyors with their direction', () => {
    expect(getTile(map, 0, 0)).toBe('void');
    expect(getTile(map, 3, 2)).toBe('gap');
    expect(getTile(map, 2, 3)).toBe('conveyor');
    expect(map.conveyors).toEqual([
      { x: 2, y: 3, dir: { x: 1, y: 0 } },
      { x: 3, y: 3, dir: { x: 0, y: 1 } },
    ]);
    expect(conveyorAt(map, 3, 3)?.dir).toEqual({ x: 0, y: 1 });
    expect(conveyorAt(map, 4, 3)).toBeUndefined();
  });

  it('blocks walking on void, gaps and belts; only belts are work surfaces and blocks', () => {
    for (const tile of ['void', 'gap', 'conveyor'] as const) expect(isSolid(tile)).toBe(true);
    expect(isWorkSurface('conveyor')).toBe(true);
    expect(isWorkSurface('gap')).toBe(false);
    expect(isWorkSurface('void')).toBe(false);
    expect(isBlock('conveyor')).toBe(true);
    expect(isBlock('gap')).toBe(false);
    expect(isDrop('void')).toBe(true);
    expect(isDrop('gap')).toBe(true);
    expect(isDrop('floor')).toBe(false);
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

describe('map marks (level redesign mechanics)', () => {
  it('parses every mark char onto its stand-in tile and lists it, row by row', () => {
    const map = parseLevelMap('_%roLlH=Dd+QY*\n1234..........');
    expect(map.tiles.slice(0, 14)).toEqual([
      'floor',
      'floor',
      'floor',
      'counter',
      'floor',
      'floor',
      'counter',
      'wall',
      'counter',
      'floor',
      'floor',
      'floor',
      'floor',
      'floor',
    ]);
    expect(map.marks.map((m) => m.kind)).toEqual([
      'wet',
      'spillZone',
      'mopRoute',
      'tap',
      'lift',
      'expressLift',
      'chute',
      'partition',
      'rollingDesk',
      'meetingDoor',
      'turnstile',
      'travelator',
      'shuttleStop',
      'revolvingDoor',
    ]);
    expect(markAt(map, 7, 0)).toBe('partition');
    expect(markAt(map, 0, 1)).toBeUndefined();
    expect(marksOf(map, 'lift')).toEqual([{ x: 4, y: 0 }]);
  });

  it('gives plain maps no marks', () => {
    expect(parseLevelMap(garage).marks).toEqual([]);
  });

  it('stands every mark on the tile it plays as when its mechanic is idle', () => {
    expect(MARK_CHARS['=']?.tile).toBe('wall');
    expect(MARK_CHARS.D?.tile).toBe('counter');
    expect(MARK_CHARS.o?.tile).toBe('counter');
    expect(MARK_CHARS.H?.tile).toBe('counter');
    for (const char of '_%rLldQY*+') expect(MARK_CHARS[char]?.tile, char).toBe('floor');
  });
});
