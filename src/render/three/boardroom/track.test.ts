import { describe, expect, it } from 'vitest';
import synergyDraft from '../../../../maps/level-11-synergy.txt?raw';
import synergyPhase2 from '../../../../maps/level-11-synergy.phase2.txt?raw';
import { type LevelMap, parseLevelMap, withPhases } from '../../../sim/level';
import { SYNERGY } from '../../../sim/levels';
import { desks, outerAt, pocketTiles, pointAt, solidIn, tallAt, wallRuns } from './track';

/** Synergy with its open layout as the map's own and the closed one as phase 2. */
const FLIPPED: LevelMap = withPhases(parseLevelMap(synergyPhase2), [synergyDraft]);

describe('the boardroom track', () => {
  it('walks Synergy partitions as one U from the left pocket round the front to the right pocket', () => {
    const [run, ...rest] = wallRuns(SYNERGY.map);
    expect(rest).toEqual([]);
    expect(run?.tiles.map((t) => `${t.x},${t.y}`).join(' ')).toBe(
      '7,4 7,5 7,6 7,7 8,7 9,7 10,7 11,7 12,7 12,6 12,5 12,4',
    );
    expect(run?.length).toBe(12);
    expect(run?.split).toBe(6);
    expect(run?.closed).toEqual([true, false]);
    // The wall is cut down along the front (front walls), full height on the sides and at the corners.
    expect(run?.tall).toEqual([
      true,
      true,
      true,
      true,
      false,
      false,
      false,
      false,
      true,
      true,
      true,
      true,
    ]);
  });

  it('puts the pockets on the wall stubs at the partition run ends, on walls that never move', () => {
    const tiles = pocketTiles(SYNERGY.map);
    expect(tiles).toEqual([
      { x: 7, y: 3 },
      { x: 12, y: 3 },
    ]);
    for (const t of tiles) {
      expect(solidIn(SYNERGY.map, 1, t.x, t.y)).toBe(true);
      expect(solidIn(SYNERGY.map, 2, t.x, t.y)).toBe(true);
    }
  });

  it('runs the track through every tile middle, one unit per tile, straight on into the pockets', () => {
    const run = wallRuns(SYNERGY.map)[0];
    if (!run) throw new Error('no run');
    run.tiles.forEach((t, k) => {
      const { p } = pointAt(run, k + 0.5);
      expect(p.x).toBeCloseTo(t.x);
      expect(p.z).toBeCloseTo(t.y);
    });
    expect(pointAt(run, -1).p).toEqual({ x: 7, z: 2.5 });
    expect(pointAt(run, 13).p).toEqual({ x: 12, z: 2.5 });
  });

  it('faces the outer side away from the boardroom all round', () => {
    const run = wallRuns(SYNERGY.map)[0];
    if (!run) throw new Error('no run');
    const outer = (s: number): [number, number] => {
      const o = outerAt(run, s);
      return [o.x + 0, o.z + 0];
    };
    expect(outer(1.5)).toEqual([-1, 0]);
    expect(outer(6)).toEqual([0, 1]);
    expect(outer(10.5)).toEqual([1, 0]);
  });

  it('eases the height across the corner edge only', () => {
    const run = wallRuns(SYNERGY.map)[0];
    if (!run) throw new Error('no run');
    expect(tallAt(run, 3.5)).toBe(1);
    expect(tallAt(run, 4.5)).toBe(0);
    expect(tallAt(run, 4)).toBeCloseTo(0.5);
    expect(tallAt(run, -0.5)).toBe(1);
  });

  it('pairs the table halves as the sim rolls them, each seam toward the other half', () => {
    expect(desks(SYNERGY.map)).toEqual([
      {
        spots: [
          { x: 9, y: 5 },
          { x: 7, y: 5 },
        ],
        seam: { x: 1, y: 0 },
        together: [true, false],
      },
      {
        spots: [
          { x: 10, y: 5 },
          { x: 12, y: 5 },
        ],
        seam: { x: -1, y: 0 },
        together: [true, false],
      },
    ]);
  });

  it('finds the same wall and pockets with the open layout as the map’s own', () => {
    const [run] = wallRuns(FLIPPED);
    expect(run?.tiles).toEqual(wallRuns(SYNERGY.map)[0]?.tiles);
    expect(run?.closed).toEqual([false, true]);
    expect(run?.tall).toEqual(wallRuns(SYNERGY.map)[0]?.tall);
    expect(pocketTiles(FLIPPED)).toEqual(pocketTiles(SYNERGY.map));
  });

  it('has nothing to build on a level without moving partitions', () => {
    expect(wallRuns(parseLevelMap(['######', '#1234#', '######'].join('\n')))).toEqual([]);
  });
});
