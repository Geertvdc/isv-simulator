import { describe, expect, it } from 'vitest';
import { buildWorldMap } from '../../../flow/worldMap';
import { CHAPTERS } from '../../../sim/levels';
import { STREET, streetLoop } from './cityPlan';

const realMap = buildWorldMap(
  CHAPTERS.map((c) => ({ levelIds: c.levels.map((l) => l.id), starGate: c.starGate })),
);

describe('streetLoop', () => {
  it('drives a closed loop along the back street, both lanes, without jumps', () => {
    const loop = streetLoop(realMap.width);
    let last = loop.at(0);
    for (let s = 0.05; s <= loop.length + 0.01; s += 0.05) {
      const here = loop.at(s);
      expect(Math.hypot(here.x - last.x, here.y - last.y)).toBeLessThan(0.06);
      expect(here.y).toBeGreaterThan(STREET.row);
      expect(here.y).toBeLessThan(STREET.row + 1);
      last = here;
    }
    // Right along the near lane, left along the far one.
    expect(loop.at(1).yaw).toBeCloseTo(Math.PI / 2);
    expect(loop.at(loop.length / 2 + 1).yaw).toBeCloseTo(-Math.PI / 2);
    expect(loop.at(1).y).toBeGreaterThan(loop.at(loop.length / 2 + 1).y);
  });
});
