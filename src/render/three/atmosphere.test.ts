import { describe, expect, it } from 'vitest';
import { getTile, isSolid } from '../../sim/level';
import { parseDraftMap } from '../../sim/draftMap';
import { GARAGE, LEVELS } from '../../sim/levels';
import draftText from '../../../maps/drafts/garage.txt?raw';
import { LEVEL_LOOKS } from '../mapLook';
import { fitCamera3d, gridToWorld, projectPoint } from '../projection';
import {
  ATMOSPHERES,
  DEFAULT_ATMOSPHERE,
  atmosphereFor,
  cssRgba,
  fogRange,
  lampSpots,
  moteSeeds,
  sunPlacement,
} from './atmosphere';

const SHIPPED = { width: 14, height: 10 };
const DRAFT = { width: 10, height: 7 };

describe('atmosphereFor', () => {
  it('gives the garage its golden hour', () => {
    expect(atmosphereFor('garage')).toBe(ATMOSPHERES.garage);
    expect(atmosphereFor('garage')).not.toBe(DEFAULT_ATMOSPHERE);
  });

  it('falls back to the default for no scene or an unknown one', () => {
    expect(atmosphereFor(undefined)).toBe(DEFAULT_ATMOSPHERE);
    expect(atmosphereFor('nope')).toBe(DEFAULT_ATMOSPHERE);
    // Not a prototype key either.
    expect(atmosphereFor('toString')).toBe(DEFAULT_ATMOSPHERE);
  });

  it('leaves every other level on the default', () => {
    for (const level of LEVELS) {
      if (level.id === GARAGE.id) continue;
      expect(atmosphereFor(LEVEL_LOOKS[level.id]?.scene)).toBe(DEFAULT_ATMOSPHERE);
    }
  });

  it('keeps the default free of fog, vignette and lamps', () => {
    expect(DEFAULT_ATMOSPHERE.fog).toBeUndefined();
    expect(DEFAULT_ATMOSPHERE.vignette).toBeUndefined();
    expect(DEFAULT_ATMOSPHERE.lamps).toBeUndefined();
    expect(DEFAULT_ATMOSPHERE.backdrop).toBeUndefined();
  });
});

describe('sunPlacement', () => {
  it('puts the default sun where it always was', () => {
    const p = sunPlacement(DEFAULT_ATMOSPHERE, SHIPPED);
    expect(p.position).toEqual(gridToWorld(6.5 - 14 * 0.3, 4.5 - 10 * 0.45, 12));
    expect(p.target).toEqual(gridToWorld(6.5, 4.5));
    expect(p.reach).toBeCloseTo(14 * 0.72);
  });

  it('keeps the golden-hour sun low and behind-left on both garage maps', () => {
    for (const map of [SHIPPED, DRAFT]) {
      const { position: s, target: t } = sunPlacement(atmosphereFor('garage'), map);
      expect(s.x).toBeLessThan(t.x);
      expect(s.z).toBeLessThan(t.z);
      const elevation = Math.atan2(s.y, Math.hypot(s.x - t.x, s.z - t.z)) * (180 / Math.PI);
      // Low enough for long shadows, high enough not to swallow the floor by the back wall.
      expect(elevation).toBeGreaterThan(30);
      expect(elevation).toBeLessThan(50);
    }
  });
});

describe('lampSpots', () => {
  it('has none without lamps', () => {
    expect(lampSpots(DEFAULT_ATMOSPHERE, SHIPPED)).toEqual([]);
  });

  const garage = atmosphereFor('garage');
  const maps = { shipped: GARAGE.map, draft: parseDraftMap(draftText) };

  it('hangs a row just inside the back wall, about 1.7 up, on both garage maps', () => {
    for (const map of Object.values(maps)) {
      const back = lampSpots(garage, map).filter((p) => p.z < map.height / 2);
      expect(back.length).toBeGreaterThanOrEqual(2);
      for (const p of back) {
        expect(p.z).toBeCloseTo(0.5 + 0.55);
        expect(p.y).toBeCloseTo(1.7);
      }
    }
  });

  it('adds a front row only in a deep room', () => {
    const front = (map: { width: number; height: number }) =>
      lampSpots(garage, map).filter((p) => p.z > map.height / 2);
    // Both garage maps are shallow enough to light from the back alone.
    expect(front(maps.shipped)).toEqual([]);
    expect(front(maps.draft)).toEqual([]);
    const deep = { width: 14, height: 13 };
    const spots = front(deep);
    expect(spots.length).toBeGreaterThan(0);
    for (const p of spots) {
      expect(p.z).toBeCloseTo(deep.height - 1.5 - 0.55);
      expect(p.y).toBeCloseTo(1.7);
    }
  });

  it('never hangs a lamp over the open middle of the floor', () => {
    for (const map of Object.values(maps)) {
      for (const p of lampSpots(garage, map)) {
        const x = Math.round(p.x);
        const y = Math.round(p.z);
        // Over a tile inside the room...
        const tile = getTile(map, x, y);
        expect(tile).not.toBeNull();
        expect(tile).not.toBe('wall');
        expect(tile).not.toBe('void');
        // ...in the row next to the back or front wall.
        const byWall = [y - 1, y + 1].some((ny) => {
          const next = getTile(map, x, ny);
          return next !== null && isSolid(next) && (ny === 0 || ny === map.height - 1);
        });
        expect(byWall).toBe(true);
      }
    }
  });

  it('spreads the lamps along the wall without bunching', () => {
    for (const map of Object.values(maps)) {
      const back = lampSpots(garage, map)
        .filter((p) => p.z < map.height / 2)
        .map((p) => p.x);
      for (let i = 1; i < back.length; i++) {
        expect((back[i] ?? 0) - (back[i - 1] ?? 0)).toBeGreaterThan(2.5);
      }
    }
  });

  it('still places lamps from a size alone', () => {
    const spots = lampSpots(garage, DRAFT);
    expect(spots.length).toBeGreaterThan(0);
    for (const p of spots) {
      expect(p.x).toBeGreaterThan(0.5);
      expect(p.x).toBeLessThan(DRAFT.width - 1.5);
    }
  });
});

describe('fogRange', () => {
  const viewport = { width: 1440, height: 810 };
  const insets = { top: 100, right: 20, bottom: 80, left: 20 };

  it('has no fog without one', () => {
    const map = SHIPPED;
    const box = { min: { x: -0.5, y: -0.45, z: -0.5 }, max: { x: 13.5, y: 1.4, z: 9.5 } };
    expect(fogRange(DEFAULT_ATMOSPHERE, map, fitCamera3d(box, viewport, insets))).toBeNull();
  });

  it('starts behind the whole floor on both garage maps', () => {
    for (const map of [SHIPPED, DRAFT]) {
      const box = {
        min: { x: -0.5, y: -0.45, z: -0.5 },
        max: { x: map.width - 0.5, y: 1.4, z: map.height - 0.5 },
      };
      const pose = fitCamera3d(box, viewport, insets);
      const range = fogRange(atmosphereFor('garage'), map, pose);
      expect(range).not.toBeNull();
      if (!range) continue;
      const backCorner = projectPoint(pose, gridToWorld(-0.5, -0.5)).depth;
      expect(range.near).toBeGreaterThan(backCorner);
      expect(range.far).toBeGreaterThan(range.near);
    }
  });
});

describe('moteSeeds', () => {
  it('has none without motes', () => {
    expect(moteSeeds(DEFAULT_ATMOSPHERE, SHIPPED)).toEqual([]);
  });

  it('hangs the same motes inside the room every time', () => {
    for (const map of [SHIPPED, DRAFT]) {
      const seeds = moteSeeds(atmosphereFor('garage'), map);
      expect(seeds.length).toBeGreaterThan(10);
      expect(moteSeeds(atmosphereFor('garage'), map)).toEqual(seeds);
      for (const { at, phase } of seeds) {
        expect(at.x).toBeGreaterThanOrEqual(0.5);
        expect(at.x).toBeLessThanOrEqual(map.width - 1.5);
        expect(at.z).toBeGreaterThanOrEqual(0.5);
        expect(at.z).toBeLessThanOrEqual(map.height - 1.5);
        expect(phase).toBeGreaterThanOrEqual(0);
        expect(phase).toBeLessThan(1);
      }
    }
  });
});

describe('cssRgba', () => {
  it('splits a hex color', () => {
    expect(cssRgba(0x102030, 0.5)).toBe('rgba(16, 32, 48, 0.5)');
  });
});
