import { describe, expect, it } from 'vitest';
import { type LevelMap, getTile, parseLevelMap } from '../../../sim/level';
import { createLifts } from '../../../sim/lifts';
import { HOT_DESKING } from '../../../sim/levels';
import { wallPiece } from '../../mapShape';
import {
  COFFEE_RINGS,
  FLOOR_WEAR,
  LOW_WALL_CLUSTERS,
  UPPER_CAP_CLUSTERS,
  type Zone,
  upperFloorsRoom,
  upperPendantFit,
} from './upperFloorsRoom';

const map = HOT_DESKING.map;
const plan = upperFloorsRoom(map);
const key = (x: number, y: number) => `${x},${y}`;
const spawns = [...map.spawns, ...map.managerSpawns].map((p) => key(p.x, p.y));
const cabins = (m: LevelMap) => (createLifts(m)[0]?.stops ?? []).flat().map((t) => key(t.x, t.y));

describe('Hot Desking room plan', () => {
  it('is deterministic', () => {
    expect(upperFloorsRoom(map)).toEqual(plan);
  });

  it('gives each island the floor of the lift stop on it, the street floor last', () => {
    const stops = createLifts(map)[0]?.stops ?? [];
    const want: Zone[] = ['meeting', 'lab', 'hotDesk'].slice(3 - stops.length) as Zone[];
    stops.forEach((cabin, i) => {
      for (const t of cabin) expect(plan.zones[key(t.x, t.y)]).toBe(want[i]);
    });
    expect(plan.lifts.map((l) => l.floor)).toEqual(stops.map((_, i) => stops.length - 1 - i));
  });

  it('lays vinyl in the lab, carpet elsewhere, and wear only on the hot-desk floor', () => {
    for (const [k, zone] of Object.entries(plan.zones)) {
      const w = plan.floorWear[k];
      if (zone === 'lab') expect([FLOOR_WEAR.vinyl, FLOOR_WEAR.vinylScuff]).toContain(w);
      else if (zone === 'meeting') {
        const plain = [FLOOR_WEAR.meeting, FLOOR_WEAR.meetingWorn, FLOOR_WEAR.meetingBare];
        const edge = (w ?? 0) >= FLOOR_WEAR.meetingEdge && (w ?? 0) < FLOOR_WEAR.meetingEdge + 16;
        expect(plain.includes(w as never) || edge).toBe(true);
      } else expect(w).toBeLessThan(FLOOR_WEAR.vinyl);
    }
  });

  it('runs the walkway from the lift to the revolving door, never over a spawn or a cabin', () => {
    expect(plan.walkway.length).toBeGreaterThan(3);
    for (let i = 1; i < plan.walkway.length; i++) {
      const a = plan.walkway[i - 1];
      const b = plan.walkway[i];
      if (!a || !b) continue;
      expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1);
    }
    for (const p of plan.walkway) {
      expect(spawns).not.toContain(key(p.x, p.y));
      expect(cabins(map)).not.toContain(key(p.x, p.y));
    }
    const last = plan.walkway[plan.walkway.length - 1];
    expect(plan.frontDoor?.tiles.some((t) => last && t.x === last.x && t.y === last.y + 1)).toBe(
      true,
    );
  });

  it('puts a few faint coffee rings by the hot desks, never on a spawn', () => {
    const rings = Object.entries(plan.floorWear).filter(
      ([, w]) => w >= FLOOR_WEAR.coffee && w < FLOOR_WEAR.coffee + 4,
    );
    expect(rings.length).toBeGreaterThan(0);
    expect(rings.length).toBeLessThanOrEqual(COFFEE_RINGS);
    for (const [k] of rings) expect(spawns).not.toContain(k);
  });

  it('hangs the story on the walls: stairs, directories on every floor, plan, kiosk, BOOKED', () => {
    const arts = plan.wallArt.map((a) => a.art);
    for (const art of [
      'stairsClosed',
      'directory0',
      'directory1',
      'directory2',
      'plan',
      'kiosk',
      'clock',
      'booked',
      'meetingScreen',
      'reproBoard',
    ] as const)
      expect(arts).toContain(art);
    // Art hangs on wall tiles, never on a cabin.
    for (const a of plan.wallArt) {
      expect(getTile(map, a.x, a.y)).toBe('wall');
      expect(cabins(map)).not.toContain(key(a.x, a.y));
    }
  });

  it('builds the hot-desk lift core full height, either side of its cabin', () => {
    const stop = plan.lifts.find((l) => l.zone === 'hotDesk');
    if (!stop) throw new Error('no hot-desk lift');
    const y = stop.tiles[0]?.y ?? 0;
    const xs = stop.tiles.map((t) => t.x);
    for (const x of [Math.min(...xs) - 1, Math.max(...xs) + 1]) {
      expect(plan.core).toContainEqual({ x, y });
      expect(plan.swaps[key(x, y)]).toMatch(/^core:/);
    }
    const stairs = plan.wallArt.find((a) => a.art === 'stairsClosed');
    expect(stairs && plan.core.some((p) => p.x === stairs.x && p.y === stairs.y)).toBe(true);
  });

  it('stacks the wall tops in clusters per floor, never by a lift, with one open locker for Segfault', () => {
    for (const zone of ['hotDesk', 'lab', 'meeting'] as const) {
      const n = plan.tops.filter((t) => {
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++)
            if (plan.zones[key(t.x + dx, t.y + dy)] === zone) return true;
        return false;
      }).length;
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(UPPER_CAP_CLUSTERS[zone] * 3);
    }
    const cab = (createLifts(map)[0]?.stops ?? []).flat();
    for (const t of plan.tops) {
      expect(getTile(map, t.x, t.y)).toBe('wall');
      for (const c of cab)
        expect(Math.max(Math.abs(c.x - t.x), Math.abs(c.y - t.y))).toBeGreaterThan(1);
    }
    expect(plan.tops.filter((t) => t.kind === 'lockersOpen')).toHaveLength(1);
    expect(plan.segfault?.kind).toBe('lockersOpen');
    // The cat sleeps on the hot-desk floor's low back wall, facing the camera, between the
    // front desk and the lift.
    const cat = plan.segfault;
    if (!cat) throw new Error('no Segfault');
    expect(wallPiece(map, cat.x, cat.y)).toBe('wall-front');
    expect(plan.zones[key(cat.x, cat.y + 1)]).toBe('hotDesk');
    expect(Math.abs(cat.yaw)).toBeLessThan(0.15);
    const lift = plan.lifts.find((l) => l.zone === 'hotDesk')?.tiles.map((t) => t.x) ?? [];
    expect(cat.x).toBeGreaterThan(plan.frontDesk?.mid.x ?? 0);
    expect(cat.x).toBeLessThan(Math.min(...lift));
    // Every locker bank shows its doors to the camera.
    for (const t of plan.tops)
      if (t.kind.startsWith('lockers')) expect(Math.abs(t.yaw)).toBeLessThan(0.15);
  });

  it('piles the low walls in clusters: up to three per wall, front and back', () => {
    const lines = new Map<number, number[]>();
    for (const f of plan.fronts) lines.set(f.y, [...(lines.get(f.y) ?? []), f.x]);
    expect(lines.size).toBe(2);
    for (const xs of lines.values()) {
      const runs = [...xs]
        .sort((a, b) => a - b)
        .filter((x, i, all) => i === 0 || x - (all[i - 1] ?? 0) > 1).length;
      expect(runs).toBeGreaterThanOrEqual(2);
      expect(runs).toBeLessThanOrEqual(LOW_WALL_CLUSTERS);
      // Clusters, not singles: more props than runs.
      expect(xs.length).toBeGreaterThan(runs);
    }
    // Nothing on a tile something else uses.
    const used = new Set([
      ...plan.tops.map((t) => key(t.x, t.y)),
      ...plan.wallArt.map((a) => key(a.x, a.y)),
      ...plan.core.map((p) => key(p.x, p.y)),
    ]);
    for (const f of plan.fronts) expect(used.has(key(f.x, f.y))).toBe(false);
  });

  it('scuffs the lab vinyl in front of its stations and borders the meeting carpet', () => {
    expect(Object.values(plan.floorWear)).toContain(FLOOR_WEAR.vinylScuff);
    const edges = Object.values(plan.floorWear).filter(
      (w) => w >= FLOOR_WEAR.meetingEdge && w < FLOOR_WEAR.meetingEdge + 16,
    );
    expect(edges.length).toBeGreaterThan(4);
  });

  it('keeps the low-wall props on low walls, clear of the doors', () => {
    expect(plan.fronts.length).toBeGreaterThan(0);
    for (const f of plan.fronts) {
      expect(wallPiece(map, f.x, f.y)).toBe('wall-front');
      for (const t of plan.frontDoor?.tiles ?? [])
        expect(Math.max(Math.abs(t.x - f.x), Math.abs(t.y - f.y))).toBeGreaterThan(1);
    }
  });

  it('hangs pendants along each room back, never in front of a cabin or a station', () => {
    for (const z of [1, 7])
      for (let x = 1; x < map.width - 1; x += 0.5) {
        const at = upperPendantFit({ x, y: 2, z }, map);
        if (!at) continue;
        const back = Math.round(at.z - 0.62);
        for (const k of cabins(map)) {
          const [cx = 0, cy = 0] = k.split(',').map(Number);
          if (cy === back) expect(Math.abs(cx - at.x)).toBeGreaterThan(0.5);
        }
      }
  });

  it('places everything from the map: a moved map moves the pieces', () => {
    // The same three floors, the lab drawn one tile to the right.
    const moved = parseLevelMap(
      [
        '####LLL#    #LLL##TT##',
        '#mmmmmm#    #........B',
        '#mRRmmm#    #...M....B',
        '#mmmmmm#    #........#',
        '########    ###CC#####',
        '                      ',
        '#II#####LLL#######PP##',
        '#.1................3.#',
        '#....KK......KK......#',
        'X..2.............4...#',
        '#.........M..........#',
        '######CC########SS####',
      ].join('\n'),
    );
    const p = upperFloorsRoom(moved);
    const lab = p.lifts.find((l) => l.zone === 'lab');
    expect(lab?.tiles.map((t) => t.x)).toEqual([13, 14, 15]);
    expect(p.wallArt.find((a) => a.art === 'directory1')?.x).toBe(16);
  });
});
