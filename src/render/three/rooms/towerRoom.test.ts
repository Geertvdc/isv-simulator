import { describe, expect, it } from 'vitest';
import { type LevelMap, getTile, marksOf } from '../../../sim/level';
import { BACK_TO_BACK } from '../../../sim/levels';
import { wallPiece } from '../../mapShape';
import { atmosphereFor, lampSpots } from '../atmosphere';
import {
  OFFICE_NAMES,
  TOWER_SWAPS,
  TOWER_TOPS_MAX,
  TOWER_WEAR,
  lobbyVoid,
  thresholdWear,
  towerPendantFit,
  towerRoom,
} from './towerRoom';

const map = BACK_TO_BACK.map;
const plan = towerRoom(map);
const key = (x: number, y: number) => `${x},${y}`;
const spawns = [...map.spawns, ...map.managerSpawns].map((p) => key(p.x, p.y));
const open = (m: LevelMap, x: number, y: number) => {
  const t = getTile(m, x, y);
  return t !== null && t !== 'wall' && t !== 'void';
};

describe('Back to Back room plan', () => {
  it('is deterministic', () => {
    expect(towerRoom(map)).toEqual(plan);
  });

  it('splits the floor into two offices, two meeting rooms and the corridor', () => {
    const zones = plan.rooms.map((r) => r.zone).sort();
    expect(zones).toEqual(['corridor', 'meeting', 'meeting', 'office', 'office']);
    expect(plan.rooms.filter((r) => r.zone === 'office').map((r) => r.name)).toEqual(OFFICE_NAMES);
    // The meeting rooms named as the HUD names them, in the sim's order.
    expect(plan.rooms.filter((r) => r.zone === 'meeting').map((r) => r.name)).toEqual([
      'THE GARAGE',
      'MOM',
    ]);
    // Every meeting tile is in a meeting room; the ship opens off the corridor.
    for (const t of map.meetingTiles) expect(plan.zones[key(t.x, t.y)]).toBe('meeting');
  });

  it('finds every meeting door among the doorways, with a room either side', () => {
    const doors = marksOf(map, 'meetingDoor');
    for (const d of doors)
      expect(plan.doorways.find((w) => w.x === d.x && w.y === d.y)?.meeting).toBe(true);
    for (const w of plan.doorways) {
      expect(w.neg).toBeGreaterThanOrEqual(0);
      expect(w.pos).toBeGreaterThanOrEqual(0);
      expect(w.neg).not.toBe(w.pos);
    }
  });

  it('lays each room its own floor, a threshold in every doorway, and no wear on a spawn', () => {
    for (const r of plan.rooms)
      for (const t of r.tiles) {
        const w = plan.floorWear[key(t.x, t.y)] ?? -1;
        if (r.zone === 'office') expect(w).toBeLessThan(TOWER_WEAR.meeting);
        else if (r.zone === 'meeting') expect(w).toBe(TOWER_WEAR.meeting + r.index);
        else {
          expect(w).toBeGreaterThanOrEqual(TOWER_WEAR.terrazzo);
          expect(w).toBeLessThan(TOWER_WEAR.threshold);
        }
      }
    for (const d of plan.doorways)
      expect(plan.floorWear[key(d.x, d.y)]).toBeGreaterThanOrEqual(TOWER_WEAR.threshold);
    expect(thresholdWear('x', 'terrazzo', 'terrazzo')).toBeLessThan(TOWER_WEAR.threshold + 32);
    for (const s of spawns) expect(plan.floorWear[s]).toBe(TOWER_WEAR.carpet);
  });

  it('marks castors in front of the keyboards and a walk line in from a door', () => {
    const wear = Object.values(plan.floorWear);
    expect(wear).toContain(TOWER_WEAR.castor);
    expect(wear).toContain(TOWER_WEAR.walk);
    expect(wear.some((w) => w === TOWER_WEAR.walkFront || w === TOWER_WEAR.walkBoth)).toBe(true);
  });

  it('builds the curtain wall where the outside is, partitions on the lobby notch', () => {
    const lobby = lobbyVoid(map);
    expect(lobby.size).toBeGreaterThan(0);
    for (const k of lobby) expect(k.endsWith(',0')).toBe(true);
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++) {
        if (getTile(map, x, y) !== 'wall') continue;
        const swap = plan.swaps[key(x, y)];
        expect(swap && TOWER_SWAPS.includes(swap)).toBe(true);
        const edge = x === 0 || x === map.width - 1 || y === 0 || y === map.height - 1;
        if (edge) expect(plan.outer[key(x, y)]).toBeDefined();
        // The low walls on the lobby notch are glass screens.
        if (y === 1 && lobby.has(key(x, 0))) expect(swap).toMatch(/^screen:/);
      }
  });

  it('hangs art on faces the camera sees, never on a doorway or cabin', () => {
    const arts = plan.art.map((a) => a.art);
    for (const art of ['plan', 'directory', 'thermostat', 'clock', 'bookingHigh'] as const)
      expect(arts).toContain(art);
    for (const a of plan.art) {
      expect(getTile(map, a.x, a.y)).toBe('wall');
      if (a.art.startsWith('bookingLow')) expect(wallPiece(map, a.x, a.y)).toBe('wall-front');
      else {
        expect(wallPiece(map, a.x, a.y)).toBe('wall');
        expect(open(map, a.x, a.y + 1)).toBe(true);
      }
    }
    // A booking screen beside every meeting door.
    for (const d of marksOf(map, 'meetingDoor'))
      expect(
        plan.art.some(
          (a) => a.art.startsWith('booking') && Math.abs(a.x - d.x) + Math.abs(a.y - d.y) === 1,
        ),
      ).toBe(true);
  });

  it('puts nothing on a doorway: the portals frame the meeting doors only', () => {
    const doors = new Set(plan.doorways.map((d) => key(d.x, d.y)));
    for (const p of [...plan.tops, ...plan.vinyl, ...plan.meetingPieces, ...plan.art])
      expect(doors.has(key(Math.round(p.x), p.y))).toBe(false);
    const meeting = marksOf(map, 'meetingDoor').map((d) => key(d.x, d.y));
    expect(plan.portals.map((p) => key(p.x, p.y)).sort()).toEqual([...meeting].sort());
  });

  it('names the rooms in vinyl on their glass, and dresses each meeting room', () => {
    const names = plan.vinyl.map((v) => v.text).sort();
    expect(names).toEqual(['MOM', 'THE BISCUIT', 'THE GARAGE', 'UNIT 4']);
    for (const v of plan.vinyl) {
      const xs = [Math.floor(v.x - v.width / 2 + 0.5), Math.ceil(v.x + v.width / 2 - 0.5)];
      for (const x of xs) expect(plan.swaps[key(x, v.y)]).toMatch(/^screen:/);
    }
    const pieces = plan.meetingPieces.map((p) => p.piece);
    for (const p of ['garagePhoto', 'mowerCase', 'rollUp', 'momPortrait', 'waterTray'] as const)
      expect(pieces).toContain(p);
  });

  it('finds the request portal at the inbox and the release hatch at the ship', () => {
    expect(plan.portal?.tiles.every((t) => getTile(map, t.x, t.y) === 'inbox')).toBe(true);
    expect(plan.release?.tiles.every((t) => getTile(map, t.x, t.y) === 'ship')).toBe(true);
    expect(plan.release?.side).toBe('front');
    expect(plan.tables).toHaveLength(2);
    expect(plan.hatches).toHaveLength(2);
  });

  it('clusters the heatwave kit on full walls, clear of stations, meeting rooms and the front', () => {
    expect(plan.tops.length).toBeGreaterThan(4);
    expect(plan.tops.length).toBeLessThanOrEqual(TOWER_TOPS_MAX);
    expect(plan.tops.some((t) => t.kind === 'portableAc')).toBe(true);
    expect(plan.tops.some((t) => t.kind === 'acNote')).toBe(true);
    for (const t of plan.tops) {
      expect(getTile(map, t.x, t.y)).toBe('wall');
      expect(wallPiece(map, t.x, t.y)).not.toBe('wall-front');
      // Nothing open behind it, nothing outside in front of it.
      expect(open(map, t.x, t.y - 1)).toBe(false);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const n = getTile(map, t.x + dx, t.y + dy);
          expect(['inbox', 'keyboard', 'bugQueue', 'counter', 'bin', 'ship']).not.toContain(n);
          expect(plan.zones[key(t.x + dx, t.y + dy)]).not.toBe('meeting');
        }
    }
  });

  it('hangs pendants only at the back of the offices and over a meeting table, clear of the back stations', () => {
    const spots = lampSpots(atmosphereFor('back-to-back'), map);
    const fits = spots.map((s) => towerPendantFit(s, map)).filter((f) => f !== null);
    for (const f of fits) {
      // Never by the front: the corridor and Mom get none.
      expect(f.z).toBeLessThan(4);
      const backRow = Math.floor(f.z);
      for (let x = Math.floor(f.x - 0.42); x <= Math.ceil(f.x + 0.42); x++) {
        const t = getTile(map, x, backRow);
        if (Math.abs(x - f.x) < 0.5 + 0.42 - 0.2)
          expect(['inbox', 'keyboard', 'bugQueue', 'testBench']).not.toContain(t);
      }
    }
  });
});
