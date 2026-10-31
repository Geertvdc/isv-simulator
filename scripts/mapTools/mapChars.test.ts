import { describe, expect, it } from 'vitest';
import { parseLevelMap } from '../../src/sim/level';
import { FUTURE_CHARS, countFutureChars, mapRows, parseDraftMap, toStandIns } from './mapChars';

const DRAFT = ['#I##K#', '#1_L2#', '#3=D4#', '#S##T#', ''].join('\n');

describe('future map chars', () => {
  it('are not game chars yet, and stand in for game chars', () => {
    for (const [char, { standIn }] of Object.entries(FUTURE_CHARS)) {
      const spawns = '1234';
      expect(() => parseLevelMap(`#${char}${spawns}#`)).toThrow(/Unknown map char/);
      expect(() => parseLevelMap(`#${standIn}${spawns}#`)).not.toThrow();
    }
  });

  it('are swapped for their stand-ins', () => {
    expect(toStandIns('_L=D.#')).toBe('..#C.#');
  });

  it('let a draft parse: wet floor and lifts as floor, partitions as wall, rolling desks as counters', () => {
    const map = parseDraftMap(DRAFT);
    const at = (x: number, y: number): string | undefined => map.tiles[y * map.width + x];
    expect(at(2, 1)).toBe('floor');
    expect(at(3, 1)).toBe('floor');
    expect(at(2, 2)).toBe('wall');
    expect(at(3, 2)).toBe('counter');
    expect(map.spawns).toHaveLength(4);
  });

  it('let Startup drafts parse: the tap as a counter, spill zone and robot route as floor', () => {
    const map = parseDraftMap(['#Io%r#', '#1234#', '#S##T#', ''].join('\n'));
    const at = (x: number, y: number): string | undefined => map.tiles[y * map.width + x];
    expect(at(2, 0)).toBe('counter');
    expect(at(3, 0)).toBe('floor');
    expect(at(4, 0)).toBe('floor');
  });

  it('are counted', () => {
    expect(countFutureChars(DRAFT)).toEqual({ _: 1, L: 1, '=': 1, D: 1 });
  });

  it('read the Scale-Up express lift as floor and the mail chute hatch as a counter', () => {
    expect(toStandIns('lH')).toBe('.C');
    const map = parseDraftMap(['#I##K#', '#1lH2#', '#3..4#', '#S##T#'].join('\n'));
    expect(map.tiles[1 * map.width + 2]).toBe('floor');
    expect(map.tiles[1 * map.width + 3]).toBe('counter');
  });
});

describe('mapRows', () => {
  it('drops trailing blank lines and keeps uneven rows', () => {
    expect(mapRows('##\r\n#\n\n')).toEqual(['##', '#']);
  });
});
