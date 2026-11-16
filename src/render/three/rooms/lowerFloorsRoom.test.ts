import { describe, expect, it } from 'vitest';
import { getTile } from '../../../sim/level';
import { createLifts } from '../../../sim/lifts';
import { HYPERGROWTH, MIDDLE_MANAGEMENT } from '../../../sim/levels';
import { atmosphereFor, lampSpots } from '../atmosphere';
import { PENDANT_HALF } from './midRiseRoom';
import {
  FLOOR_WEAR,
  STANDING_ART,
  findZones,
  liftDoors,
  lowerFloorsRoom,
  lowerPendantFit,
} from './lowerFloorsRoom';

const map = HYPERGROWTH.map;
const key = (x: number, y: number) => `${x},${y}`;
const spawns = new Set([...map.spawns, ...map.managerSpawns].map((p) => key(p.x, p.y)));
const cabins = new Set(createLifts(map).flatMap((l) => l.stops.flat().map((t) => key(t.x, t.y))));

describe('lowerFloorsRoom', () => {
  const plan = lowerFloorsRoom(map);

  it('is deterministic', () => {
    expect(lowerFloorsRoom(map)).toEqual(plan);
  });

  it('splits the map into the ground floor, the first floor and the stairwell from its own tiles', () => {
    const zones = findZones(map);
    const stops = createLifts(map)[0]?.stops ?? [];
    for (const t of stops[0] ?? []) expect(zones[key(t.x, t.y)]).toBe('ground');
    for (const t of stops[1] ?? []) expect(zones[key(t.x, t.y)]).toBe('first');
    for (const [k, z] of Object.entries(zones))
      if (z === 'stairs') {
        const [x = 0, y = 0] = k.split(',').map(Number);
        expect(getTile(map, x, y)).toBe('floor');
      }
    // The stairwell is one long flight, and every open tile has a zone.
    expect(Object.values(zones).filter((z) => z === 'stairs').length).toBeGreaterThanOrEqual(8);
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++) {
        const t = getTile(map, x, y);
        if (t !== 'wall' && t !== 'void') expect(zones[key(x, y)], key(x, y)).toBeDefined();
      }
    // Without lifts (3-1's floor), everything is one ground floor or stairs.
    expect(Object.values(findZones(MIDDLE_MANAGEMENT.map))).not.toContain('first');
  });

  it('gives each floor its own floor and keeps the tracks off spawns and cabins', () => {
    const zones = plan.zones;
    for (const [k, wear] of Object.entries(plan.floorWear)) {
      const z = zones[k];
      if (z === 'stairs') expect(wear).toBeGreaterThanOrEqual(FLOOR_WEAR.stairX);
      else if (z === 'first') {
        expect(wear).toBeGreaterThanOrEqual(FLOOR_WEAR.carpet);
        expect(wear).toBeLessThan(FLOOR_WEAR.stairX);
      } else expect(wear).toBeLessThan(FLOOR_WEAR.carpet);
    }
    expect(plan.tracks.length).toBeGreaterThan(3);
    for (const p of plan.tracks) {
      expect(spawns.has(key(p.x, p.y))).toBe(false);
      expect(cabins.has(key(p.x, p.y))).toBe(false);
    }
    // The tracks start on the walk-off mat inside the loading bay and end beside the ground cabin.
    const first = plan.tracks[0];
    const last = plan.tracks[plan.tracks.length - 1];
    expect(first && plan.floorWear[key(first.x, first.y)]).toBeGreaterThanOrEqual(FLOOR_WEAR.mat);
    expect(
      last &&
        [...cabins].some((k) => {
          const [x = 0, y = 0] = k.split(',').map(Number);
          return Math.abs(x - last.x) + Math.abs(y - last.y) === 1;
        }),
    ).toBe(true);
    // The wet patch and the odd carpet tile are never on a spawn.
    for (const [k, wear] of Object.entries(plan.floorWear))
      if (wear === FLOOR_WEAR.wet || wear === FLOOR_WEAR.carpet + 11)
        expect(spawns.has(k)).toBe(false);
  });

  it('frames the lift doors in the walls beside the cabins, facing across the shaft', () => {
    const doors = liftDoors(map);
    expect(doors.map((d) => d.floor)).toEqual([0, 1]);
    for (const d of doors) {
      expect(d.tiles.length).toBe(2);
      for (const t of d.tiles) {
        expect(getTile(map, t.x, t.y)).toBe('wall');
        expect(plan.swaps[key(t.x, t.y)]).toMatch(/^lift:/);
      }
    }
    expect(doors[0]?.side).toBe('right');
    expect(doors[1]?.side).toBe('left');
    // The banner strings between them over the shaft, behind the cabins.
    const b = plan.banner;
    expect(b).not.toBeNull();
    if (!b) return;
    const minCabinY = Math.min(...[...cabins].map((k) => Number(k.split(',')[1])));
    expect(b.z).toBeLessThan(minCabinY - 0.25);
    expect(b.x0).toBeGreaterThan(Math.max(...(doors[0]?.tiles.map((t) => t.x) ?? [])));
    expect(b.x1).toBeLessThan(Math.min(...(doors[1]?.tiles.map((t) => t.x) ?? [])));
  });

  it('builds the stairwell walls as block, the rest as partitions, and rails along the flight', () => {
    for (const [k, s] of Object.entries(plan.swaps)) {
      if (!s.startsWith('block')) continue;
      const [x = 0, y = 0] = k.split(',').map(Number);
      for (const [dx, dy] of [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ] as const) {
        const z = plan.zones[key(x + dx, y + dy)];
        if (z) expect(z).toBe('stairs');
      }
    }
    expect(Object.values(plan.swaps).filter((s) => s.startsWith('block')).length).toBeGreaterThan(
      10,
    );
    expect(plan.rails.filter((r) => r.low).length).toBeGreaterThan(5);
    expect(plan.rails.filter((r) => !r.low).length).toBeGreaterThan(3);
    // A post on every second tile, the rail continuous.
    const posts = plan.rails.filter((r) => r.post).length;
    expect(posts).toBeGreaterThan(plan.rails.length / 3);
    expect(posts).toBeLessThan(plan.rails.length);
    // The first floor's front wall over the stairs is a glass balustrade, without a head track.
    const bal = Object.entries(plan.swaps).filter(([, s]) => s.startsWith('balustrade'));
    expect(bal.length).toBeGreaterThanOrEqual(4);
    for (const [k] of bal) {
      const [x = 0, y = 0] = k.split(',').map(Number);
      expect(plan.zones[key(x, y - 1)]).toBe('first');
      expect(plan.headTracks.some((h) => h.x === x && h.y === y)).toBe(false);
    }
    // The floor numbers: 0 at the stairs' foot, 1 at the top, on stairs.
    expect(plan.floorNumbers.map((f) => f.n)).toEqual([0, 1]);
    for (const f of plan.floorNumbers) expect(plan.zones[key(f.x, f.y)]).toBe('stairs');
    // The flight ramps: the foot's step below the top's.
    const [foot, top] = plan.floorNumbers;
    if (foot && top)
      expect(plan.floorWear[key(foot.x, foot.y)] ?? 0).toBeLessThan(
        plan.floorWear[key(top.x, top.y)] ?? 0,
      );
    expect(plan.slabEdges.length).toBeGreaterThan(8);
  });

  it('hangs the story on the walls: the checklist, NEW STARTERS, the note, the directories', () => {
    const arts = plan.wallArt.map((a) => a.art);
    for (const a of [
      'checklist',
      'newStarters',
      'desksTuesday',
      'clock',
      'fireExit',
      'stencil1',
      'directory0',
      'directory1',
    ] as const)
      expect(arts).toContain(a);
    for (const a of plan.wallArt) {
      expect(getTile(map, a.x, a.y), a.art).toBe('wall');
      // Standing art stands on the ground floor's low back wall, with the floor in front.
      if (STANDING_ART.has(a.art)) expect(plan.zones[key(a.x, a.y + 1)]).toBe('ground');
    }
    expect(plan.postHatch?.tiles.every((t) => getTile(map, t.x, t.y) === 'inbox')).toBe(true);
    expect(plan.loadingBay?.tiles.every((t) => getTile(map, t.x, t.y) === 'ship')).toBe(true);
  });

  it('stacks the desk boxes on the ground floor and the kit upstairs, only on walls with nothing open behind', () => {
    const ground = plan.tops.filter((t) =>
      ['boxTower', 'boxPair', 'boxBalloon', 'welcomePacks', 'wrappedChairs'].includes(t.kind),
    );
    expect(ground.length).toBeGreaterThanOrEqual(4);
    expect(plan.tops.some((t) => t.kind === 'boxedMonitors')).toBe(true);
    for (const t of plan.tops) {
      expect(getTile(map, t.x, t.y)).toBe('wall');
      const behind = getTile(map, t.x, t.y - 1);
      expect(behind === null || behind === 'wall' || behind === 'void').toBe(true);
      // Only the kit at the top of the stairs stands on block: in front of the glass balustrade.
      if (t.kind === 'kitLow' || t.kind === 'laptopsLow')
        expect(plan.swaps[key(t.x, t.y - 1)]).toMatch(/^balustrade/);
      else expect(plan.swaps[key(t.x, t.y)] ?? '').not.toMatch(/^(lift|block)/);
    }
    expect(
      plan.tops.filter((t) => t.kind === 'kitLow' || t.kind === 'laptopsLow').length,
    ).toBeGreaterThanOrEqual(2);
    // The ground floor's low walls: three clusters on the front wall, one with a balloon on the left.
    expect(plan.fronts.filter((f) => f.y === map.height - 1).length).toBeGreaterThanOrEqual(3);
    expect(plan.fronts.some((f) => f.x === 0 && f.kind === 'lowBalloon')).toBe(true);
    expect(plan.tops.filter((t) => t.x === 0).length + 1).toBeGreaterThanOrEqual(2);
    for (const f of plan.fronts) expect(getTile(map, f.x, f.y)).toBe('wall');
  });

  it('hangs the pendants along each floor’s back, clear of the stations behind them', () => {
    const fits = lampSpots(atmosphereFor('hypergrowth'), map).map((s) => lowerPendantFit(s, map));
    const got = fits.filter((f) => f !== null);
    expect(got.length).toBeGreaterThanOrEqual(2);
    for (const f of got) {
      const back = Math.round(f.z - 0.62);
      for (let x = 0; x < map.width; x++) {
        const t = getTile(map, x, back);
        if (t && t !== 'wall' && t !== 'void' && t !== 'floor')
          expect(Math.abs(x - f.x)).toBeGreaterThanOrEqual(0.5 + PENDANT_HALF - 0.15 - 1e-9);
      }
    }
    // Both floors get theirs.
    expect(new Set(got.map((f) => f.z)).size).toBe(2);
  });
});
