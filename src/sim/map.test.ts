import { describe, expect, it } from 'vitest';
import startupPit from '../../maps/startup-pit.txt?raw';
import { getZone, parseMap } from './map';

describe('parseMap', () => {
  it('parses every zone char into a row-major grid', () => {
    const map = parseMap('#.=\nEL \n');
    expect(map).toEqual({
      width: 3,
      height: 2,
      tiles: ['wall', 'floor', 'corridor', 'entrance', 'locked', 'void'],
    });
  });

  it('accepts CRLF line endings and no trailing newline', () => {
    expect(parseMap('#.\r\n.#')).toEqual(parseMap('#.\n.#\n'));
  });

  it('keeps trailing spaces as void tiles', () => {
    const map = parseMap('#  \n###');
    expect(map.width).toBe(3);
    expect(getZone(map, 2, 0)).toBe('void');
  });

  it('rejects uneven rows with the line number', () => {
    expect(() => parseMap('###\n##\n###')).toThrow('Map line 2 has length 2, expected 3');
  });

  it('rejects unknown chars with line and column', () => {
    expect(() => parseMap('###\n#.#\n#X#')).toThrow("Unknown map char 'X' at line 3, column 2");
  });

  it('rejects an empty map', () => {
    expect(() => parseMap('')).toThrow('Map is empty');
    expect(() => parseMap('\n')).toThrow('Map is empty');
  });

  it('parses the Startup Pit', () => {
    const map = parseMap(startupPit);
    expect(map.width).toBe(14);
    expect(map.height).toBe(8);
    expect(map.tiles).toHaveLength(14 * 8);
    expect(getZone(map, 0, 0)).toBe('wall');
    expect(getZone(map, 1, 1)).toBe('floor');
    expect(getZone(map, 6, 1)).toBe('corridor');
    expect(getZone(map, 6, 7)).toBe('entrance');
  });
});

describe('getZone', () => {
  const map = parseMap('#.\n=E');

  it('returns the zone inside the map', () => {
    expect(getZone(map, 1, 0)).toBe('floor');
    expect(getZone(map, 0, 1)).toBe('corridor');
    expect(getZone(map, 1, 1)).toBe('entrance');
  });

  it('returns void out of bounds on every side', () => {
    expect(getZone(map, -1, 0)).toBe('void');
    expect(getZone(map, 0, -1)).toBe('void');
    expect(getZone(map, 2, 0)).toBe('void');
    expect(getZone(map, 0, 2)).toBe('void');
  });

  it('returns void for non-integer coordinates', () => {
    expect(getZone(map, 0.5, 0)).toBe('void');
  });
});
