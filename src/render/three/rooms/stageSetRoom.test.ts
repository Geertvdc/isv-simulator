import { describe, expect, it } from 'vitest';
import { getTile } from '../../../sim/level';
import { parseDraftMap } from '../../../sim/draftMap';
import { DEMO_DAY } from '../../../sim/levels';
import draftText from '../../../../maps/drafts/demo-day.txt?raw';
import { wallPiece } from '../../mapShape';
import { WALL_HEIGHT } from '../layout';
import {
  DECK_WEAR,
  STAGE_ART_HALF,
  STAGE_ART_SPAN,
  STAGE_CAP_CLUSTERS,
  findDoorways,
  stageSetRoom,
} from './stageSetRoom';

/** Half the box truss's size across (`roomModels/stageSet`). */
const TRUSS_HALF = 0.065;

describe('stageSetRoom', () => {
  const shipped = DEMO_DAY.map;
  const draft = parseDraftMap(draftText);
  const maps = [shipped, draft];
  const isOpen = (t: ReturnType<typeof getTile>) => t !== null && t !== 'wall' && t !== 'void';

  it('frames the inbox as the stage door: on the back edge shipped, on the left in the draft', () => {
    expect(stageSetRoom(shipped).stageDoor).toEqual({
      side: 'back',
      tiles: [
        { x: 2, y: 0 },
        { x: 3, y: 0 },
      ],
      mid: { x: 2.5, y: 0 },
    });
    const door = stageSetRoom(draft).stageDoor;
    expect(door?.side).toBe('left');
    expect(door?.tiles).toHaveLength(2);
  });

  it('frames every ship hatch as a live console: two on the front shipped with desks beside, one on the back in the draft', () => {
    const shippedConsoles = stageSetRoom(shipped).consoles;
    expect(shippedConsoles.map((c) => [c.door.side, c.door.tiles.map((t) => t.x)])).toEqual([
      ['front', [4, 5]],
      ['front', [10, 11]],
    ]);
    // The desks on the low wall beside each hatch, on the side away from the middle.
    expect(shippedConsoles.map((c) => c.desk)).toEqual([
      { x: 3, y: 9 },
      { x: 12, y: 9 },
    ]);
    for (const c of shippedConsoles)
      if (c.desk) expect(wallPiece(shipped, c.desk.x, c.desk.y)).toBe('wall-front');
    const draftConsoles = stageSetRoom(draft).consoles;
    expect(draftConsoles).toHaveLength(1);
    expect(draftConsoles[0]?.door.side).toBe('back');
    expect(draftConsoles[0]?.desk).toBeNull();
  });

  it('finds each run of a door tile once', () => {
    for (const m of maps) {
      const runs = findDoorways(m, 'ship');
      const tiles = runs.flatMap((r) => r.tiles.map((t) => `${t.x},${t.y}`));
      expect(new Set(tiles).size).toBe(tiles.length);
    }
  });

  it('hangs each piece once, on back walls with floor in front, clear of the doors and each other', () => {
    for (const m of maps) {
      const { wallArt, stageDoor, consoles } = stageSetRoom(m);
      const names = wallArt.map((a) => a.art);
      expect(new Set(names).size).toBe(names.length);
      expect(names).toContain('ledPanel');
      expect(names).toContain('confidence');
      const doors = [stageDoor, ...consoles.map((c) => c.door)];
      for (const a of wallArt) {
        const span = STAGE_ART_SPAN[a.art];
        for (let i = 0; i < span; i++) {
          const x = a.x - (span - 1) / 2 + i;
          expect(wallPiece(m, x, a.y)).toBe('wall');
          expect(isOpen(getTile(m, x, a.y - 1))).toBe(false);
          expect(getTile(m, x, a.y + 1)).toBe('floor');
          for (const d of doors)
            for (const t of d?.tiles ?? [])
              expect(Math.max(Math.abs(t.x - x), Math.abs(t.y - a.y))).toBeGreaterThan(1);
        }
      }
      for (const a of wallArt)
        for (const b of wallArt)
          if (a !== b && a.y === b.y)
            expect(Math.abs(a.x - b.x)).toBeGreaterThan(
              STAGE_ART_HALF[a.art] + STAGE_ART_HALF[b.art],
            );
    }
    // The draft's long back wall has room for all four.
    expect(stageSetRoom(draft).wallArt).toHaveLength(4);
  });

  it('puts wear only on floor and never on or (spike marks) beside a spawn', () => {
    for (const m of maps) {
      const { floorWear } = stageSetRoom(m);
      const spawns = new Set(m.spawns.map((s) => `${s.x},${s.y}`));
      for (const [k, w] of Object.entries(floorWear)) {
        const [x = 0, y = 0] = k.split(',').map(Number);
        expect(getTile(m, x, y)).toBe('floor');
        expect(spawns.has(k)).toBe(false);
        if (w >= DECK_WEAR.spikeWhite && w <= DECK_WEAR.spikePink)
          for (const s of m.spawns)
            expect(Math.max(Math.abs(s.x - x), Math.abs(s.y - y))).toBeGreaterThan(1);
      }
      const kinds = Object.values(floorWear);
      expect(kinds.some((w) => w >= DECK_WEAR.spikeWhite && w <= DECK_WEAR.spikePink)).toBe(true);
      expect(kinds.some((w) => w >= DECK_WEAR.cableEndBack && w <= DECK_WEAR.cableEndRight)).toBe(
        true,
      );
    }
    // Glow tape along the shipped stage's lip, in front of the low front wall.
    const lip = Object.entries(stageSetRoom(shipped).floorWear).filter(
      ([, w]) => w === DECK_WEAR.glowFront,
    );
    expect(lip.length).toBeGreaterThan(2);
    for (const [k] of lip) expect(k.endsWith(',8')).toBe(true);
  });

  it('runs a cable in from the stage door to a stage box', () => {
    const { floorWear } = stageSetRoom(shipped);
    const cable = Object.entries(floorWear).filter(
      ([k, w]) =>
        (w === DECK_WEAR.cableZ || w === DECK_WEAR.cableEndBack) &&
        ['2', '3'].includes(k.split(',')[0] ?? ''),
    );
    expect(cable.length).toBeGreaterThanOrEqual(2);
    expect(cable.filter(([, w]) => w === DECK_WEAR.cableEndBack)).toHaveLength(1);
  });

  it('puts wall-top clusters only where nothing open is behind, low clusters on the outer front wall', () => {
    for (const m of maps) {
      const { capProps, frontProps, trusses, consoles } = stageSetRoom(m);
      expect(capProps.length).toBeGreaterThan(0);
      expect(capProps.length).toBeLessThanOrEqual(
        STAGE_CAP_CLUSTERS.back + 2 * STAGE_CAP_CLUSTERS.side,
      );
      const towers = trusses.flatMap((t) => t.towers.map((p) => `${p.x},${p.y}`));
      for (const p of capProps) {
        expect(getTile(m, p.x, p.y)).toBe('wall');
        expect(wallPiece(m, p.x, p.y)).not.toBe('wall-front');
        expect(isOpen(getTile(m, p.x, p.y - 1))).toBe(false);
        expect(towers).not.toContain(`${p.x},${p.y}`);
      }
      expect(frontProps.length).toBeGreaterThan(0);
      expect(frontProps.length).toBeLessThanOrEqual(STAGE_CAP_CLUSTERS.front);
      const desks = consoles.flatMap((c) => (c.desk ? [`${c.desk.x},${c.desk.y}`] : []));
      for (const p of frontProps) {
        expect(wallPiece(m, p.x, p.y)).toBe('wall-front');
        expect(isOpen(getTile(m, p.x, p.y + 1))).toBe(false);
        expect(desks).not.toContain(`${p.x},${p.y}`);
      }
    }
  });

  it('strings the truss low over the back wall from corner to corner, the mirror ball once', () => {
    for (const m of maps) {
      const { trusses, mirrorBall, capProps } = stageSetRoom(m);
      expect(trusses.length).toBeGreaterThan(0);
      for (const t of trusses) {
        expect(t.x1).toBeGreaterThan(t.x0);
        // Just over the back wall's cap, on its row: under the big screen behind.
        expect(t.y).toBeLessThan(WALL_HEIGHT + 0.3);
        expect(t.y - TRUSS_HALF).toBeGreaterThan(WALL_HEIGHT);
        for (const p of t.towers) {
          expect(getTile(m, p.x, p.y)).toBe('wall');
          expect(Math.abs(t.z - p.y)).toBeLessThan(0.5);
        }
        for (const x of t.lamps) {
          expect(x).toBeGreaterThan(t.x0);
          expect(x).toBeLessThan(t.x1);
        }
      }
      // On a wall top of its own, not under a cluster.
      expect(mirrorBall).not.toBeNull();
      if (mirrorBall) {
        expect(getTile(m, mirrorBall.x, mirrorBall.y)).toBe('wall');
        expect(capProps.some((p) => p.x === mirrorBall.x && p.y === mirrorBall.y)).toBe(false);
      }
    }
  });

  it('is deterministic', () => {
    for (const m of maps) expect(stageSetRoom(m)).toEqual(stageSetRoom(m));
  });
});
