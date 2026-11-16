import { describe, expect, it } from 'vitest';
import hypergrowthMap from '../../../maps/level-08-hypergrowth.txt?raw';
import { parseLevelMap } from '../../sim/level';
import { createLifts } from '../../sim/lifts';
import { doorways } from './liftCars';

describe('lift car doorways', () => {
  it('gives each Hypergrowth car one doorway across its front', () => {
    const map = parseLevelMap(hypergrowthMap);
    const stops = createLifts(map)[0]?.stops ?? [];
    expect(stops.map((cabin) => doorways(map, cabin))).toEqual([
      [{ from: { x: 5.5, y: 5.5 }, to: { x: 7.5, y: 5.5 }, out: { x: 0, y: 1 } }],
      [{ from: { x: 12.5, y: 5.5 }, to: { x: 14.5, y: 5.5 }, out: { x: 0, y: 1 } }],
    ]);
  });

  it('opens an odd-shaped cabin wherever it borders floor, a run per straight edge', () => {
    const map = parseLevelMap(
      ['#####', '#1.L#', '#.LL#', '#####', '#234#', '#.LL#', '#####'].join('\n'),
    );
    const [top] = createLifts(map)[0]?.stops ?? [];
    const ways = doorways(map, top ?? []);
    expect(ways.map((w) => w.out)).toEqual([
      { x: 0, y: -1 },
      { x: -1, y: 0 },
      { x: -1, y: 0 },
    ]);
  });
});
