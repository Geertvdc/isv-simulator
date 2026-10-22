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

  for (const setting of Object.keys(SETTINGS)) {
    it(`never stands two ${setting} props in each other`, () => {
      const placed = placeSetPieces(setting, 14, 10);
      const rect = (p: (typeof placed)[number]) => {
        const turned = Math.abs(Math.sin(p.yaw)) > 0.5;
        const [sx, sz] = p.piece.size;
        // Slightly inset: props may touch, and loose ones turn a little.
        const hx = (turned ? sz : sx) / 2 - 0.15;
        const hz = (turned ? sx : sz) / 2 - 0.15;
        return { x0: p.at.x - hx, x1: p.at.x + hx, z0: p.at.z - hz, z1: p.at.z + hz };
      };
      for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) {
          const a = placed[i];
          const b = placed[j];
          if (!a || !b) continue;
          const ra = rect(a);
          const rb = rect(b);
          const overlap = ra.x0 < rb.x1 && rb.x0 < ra.x1 && ra.z0 < rb.z1 && rb.z0 < ra.z1;
          expect(overlap, `${i} and ${j} overlap`).toBe(false);
        }
      }
    });
  }

  it('shows each rare prop once', () => {
    const rare = SETTINGS.garage?.rare ?? [];
    const placed = placeSetPieces('garage', 14, 10);
    for (const piece of rare) expect(placed.filter((p) => p.piece === piece)).toHaveLength(1);
  });

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
