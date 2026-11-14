import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDraftMap } from '../../sim/draftMap';
import { parseLevelMap } from '../../sim/level';
import {
  ATMOSPHERES,
  DEFAULT_ATMOSPHERE,
  accentSpots,
  lightWellSpots,
  pagerTile,
  snowSeeds,
} from './atmosphere';
import { lightWellsFor } from './lightWells';
import { pagerBoardTile } from './rooms/basementRoom';
import { onCallLightWells } from './scenes/onCall';

const text = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const MAPS = {
  shipped: parseLevelMap(text('maps/level-06-on-call.txt')),
  draft: parseDraftMap(text('maps/drafts/on-call.txt')),
};
const night = ATMOSPHERES['on-call'] ?? DEFAULT_ATMOSPHERE;

describe('lightWellsFor', () => {
  it("puts on-call's snow, shafts and well lights in the scene's own light wells, on both maps", () => {
    for (const [name, map] of Object.entries(MAPS)) {
      const wells = lightWellsFor(night, map);
      expect(wells, name).toEqual(onCallLightWells(map));
      expect(wells.length, name).toBeGreaterThan(0);
      for (const w of wells) expect(w.at.z, name).toBeLessThan(-0.5);
      const lights = accentSpots(night, map, wells).filter((s) => s.accent.anchor === 'wells');
      expect(
        lights.map((l) => l.at.x),
        name,
      ).toEqual(wells.map((w) => w.at.x));
      // Every flake falls inside its well's opening, between the street and the sill.
      for (const f of snowSeeds(night, map, wells)) {
        const well = wells.find((w) => Math.abs(f.at.x - w.at.x) <= w.w / 2);
        expect(well, name).toBeDefined();
        expect(f.at.y - f.drop, name).toBeCloseTo((well?.at.y ?? 0) - (well?.h ?? 0) / 2);
      }
    }
  });

  it('falls back to the default spots without a scene of its own or without tiles', () => {
    const size = { width: 14, height: 10 };
    expect(lightWellsFor(night, size)).toEqual(lightWellSpots(size));
    expect(lightWellsFor(DEFAULT_ATMOSPHERE, MAPS.shipped)).toEqual(lightWellSpots(MAPS.shipped));
  });
});

describe('pagerTile', () => {
  it("puts the beacon on the room's pager board tile, on both maps", () => {
    for (const [name, map] of Object.entries(MAPS)) {
      const tile = pagerTile(map);
      expect(tile && { x: tile.x, y: tile.y }, name).toEqual(pagerBoardTile(map));
      const beacon = accentSpots(night, map).find((s) => s.accent.anchor === 'pager');
      expect(Math.abs((beacon?.at.x ?? -9) - (tile?.x ?? 0)), name).toBeLessThan(0.2);
      expect(Math.abs((beacon?.at.z ?? -9) - (tile?.y ?? 0)), name).toBeLessThan(0.2);
    }
  });
});
