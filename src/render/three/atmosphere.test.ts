import { describe, expect, it } from 'vitest';
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
      expect(elevation).toBeGreaterThan(30);
      expect(elevation).toBeLessThan(45);
    }
  });
});

describe('lampSpots', () => {
  it('has none without lamps', () => {
    expect(lampSpots(DEFAULT_ATMOSPHERE, SHIPPED)).toEqual([]);
  });

  it('hangs lamps inside the room on both garage maps', () => {
    for (const map of [SHIPPED, DRAFT]) {
      const spots = lampSpots(atmosphereFor('garage'), map);
      expect(spots.length).toBeGreaterThan(0);
      for (const p of spots) {
        expect(p.x).toBeGreaterThan(0.5);
        expect(p.x).toBeLessThan(map.width - 1.5);
        expect(p.z).toBeCloseTo((map.height - 1) / 2);
      }
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
