import { getTile, type LevelMap } from '../../../sim/level';

/** A walled room on the map, as its floor tiles' bounding box (inclusive) and its doors. */
export interface ManagerOffice {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Open tiles in the room (floor and counters, such as his desk), keyed `x,y`. */
  tiles: string[];
  /** The 1-wide openings in its walls (floor tiles with walls on two opposite sides). */
  doors: { x: number; y: number }[];
}

const isWall = (map: LevelMap, x: number, y: number) => {
  const t = getTile(map, x, y);
  return t === null || t === 'wall' || t === 'void';
};

/** A floor tile in a 1-wide gap in a wall: walls left and right, or above and below. */
function isDoor(map: LevelMap, x: number, y: number): boolean {
  return (
    (isWall(map, x - 1, y) && isWall(map, x + 1, y)) ||
    (isWall(map, x, y - 1) && isWall(map, x, y + 1))
  );
}

/**
 * The manager's own office (Derek's corner office), if the map walls one in
 * round the first manager start (the redesign draft does), else null (the
 * shipped map: he starts on the open floor). The room is the floor reached
 * from the start without going through a door; it counts as an office only
 * if it is closed off by doors and holds less than a third of the floor.
 * Shared by the Room track (which dresses the office inside the map) and
 * the World track (which builds an office outside the room when there is none).
 */
export function managerOffice(map: LevelMap): ManagerOffice | null {
  const start = map.managerSpawns[0];
  if (!start) return null;
  let floor = 0;
  for (let y = 0; y < map.height; y += 1)
    for (let x = 0; x < map.width; x += 1) if (!isWall(map, x, y)) floor += 1;
  const seen = new Set<string>([`${start.x},${start.y}`]);
  const doors = new Map<string, { x: number; y: number }>();
  const queue = [start];
  for (let next = queue.shift(); next; next = queue.shift()) {
    const { x, y } = next;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (seen.has(key) || doors.has(key) || isWall(map, nx, ny)) continue;
      if (isDoor(map, nx, ny)) {
        doors.set(key, { x: nx, y: ny });
        continue;
      }
      seen.add(key);
      queue.push({ x: nx, y: ny });
    }
  }
  const tiles = [...seen];
  if (doors.size === 0 || tiles.length * 3 >= floor) return null;
  const xs = tiles.map((k) => Number(k.split(',')[0]));
  const ys = tiles.map((k) => Number(k.split(',')[1]));
  return {
    x0: Math.min(...xs),
    y0: Math.min(...ys),
    x1: Math.max(...xs),
    y1: Math.max(...ys),
    tiles,
    doors: [...doors.values()],
  };
}
