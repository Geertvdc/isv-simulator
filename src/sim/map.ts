/**
 * Building maps: parsed from ASCII text in `maps/`.
 *
 * Tiles are stored row-major (`tiles[y * width + x]`) as plain strings so the
 * map stays JSON-serializable.
 */

export type Zone = 'wall' | 'floor' | 'corridor' | 'entrance' | 'locked' | 'void';

export interface BuildingMap {
  width: number;
  height: number;
  tiles: Zone[];
}

const CHAR_TO_ZONE: Readonly<Record<string, Zone>> = {
  '#': 'wall',
  '.': 'floor',
  '=': 'corridor',
  E: 'entrance',
  L: 'locked',
  ' ': 'void',
};

/**
 * Parses an ASCII map. Rows are not trimmed, since a space is a void tile.
 * Throws with line and column info for unknown chars and uneven rows.
 */
export function parseMap(text: string): BuildingMap {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  // A file ending in a newline yields one empty trailing line; drop it.
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  const firstLine = lines[0];
  if (firstLine === undefined || firstLine.length === 0) {
    throw new Error('Map is empty');
  }

  const width = firstLine.length;
  const tiles: Zone[] = [];
  lines.forEach((line, y) => {
    if (line.length !== width) {
      throw new Error(`Map line ${y + 1} has length ${line.length}, expected ${width}`);
    }
    for (let x = 0; x < width; x++) {
      const char = line.charAt(x);
      const zone = CHAR_TO_ZONE[char];
      if (zone === undefined) {
        throw new Error(`Unknown map char '${char}' at line ${y + 1}, column ${x + 1}`);
      }
      tiles.push(zone);
    }
  });

  return { width, height: lines.length, tiles };
}

/** Returns the zone at (x, y), or `'void'` when out of bounds. */
export function getZone(map: BuildingMap, x: number, y: number): Zone {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return 'void';
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return 'void';
  return map.tiles[y * map.width + x] ?? 'void';
}
