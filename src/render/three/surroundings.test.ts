import { describe, expect, it } from 'vitest';
import { placeSetPieces } from './surroundings';
import { SETTINGS } from './setDressing';

describe('placeSetPieces', () => {
  for (const setting of Object.keys(SETTINGS)) {
    it(`keeps every ${setting} prop off the level's slab`, () => {
      const width = 14;
      const height = 10;
      for (const p of placeSetPieces(setting, width, height)) {
        // A quarter turn swaps the prop's width and depth.
        const turned = Math.abs(Math.sin(p.yaw)) > 0.5;
        const [sx, sz] = p.piece.size;
        const halfX = (turned ? sz : sx) / 2;
        const halfZ = (turned ? sx : sz) / 2;
        const overlapsX = p.at.x + halfX > -0.5 && p.at.x - halfX < width - 0.5;
        const overlapsZ = p.at.z + halfZ > -0.5 && p.at.z - halfZ < height - 0.5;
        expect(overlapsX && overlapsZ).toBe(false);
      }
    });
  }

  it('places the same props in the same places every time', () => {
    expect(placeSetPieces('garage', 14, 10)).toEqual(placeSetPieces('garage', 14, 10));
  });

  it('fills both sides and the back', () => {
    const at = placeSetPieces('enterprise', 14, 10).map((p) => p.at);
    expect(at.some((p) => p.x < -0.5)).toBe(true);
    expect(at.some((p) => p.x > 13.5)).toBe(true);
    expect(at.some((p) => p.z < -0.5 && p.x > 0 && p.x < 13)).toBe(true);
  });

  it('places nothing for a level without a setting', () => {
    expect(placeSetPieces('nowhere', 14, 10)).toEqual([]);
  });
});
