import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type LevelMap, parseLevelMap } from '../../sim/level';
import { ATMOSPHERES, DEFAULT_ATMOSPHERE, sceneOf } from './atmosphere';
import { ambientAnchors, beaconAngle, beaconFlare, beaconSpot, chaseLevel } from './WorldFx';
import { loftRoom } from './rooms/loftRoom';
import { gridToWorld } from '../projection';
import { SCENES } from './scenes';

const read = (path: string) =>
  parseLevelMap(readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8'));

/** Down the Hall, shipped and the redesign draft: the motion must fit both. */
const MAPS: Record<string, LevelMap> = {
  shipped: read('maps/level-03-scale-up.txt'),
  draft: read('maps/drafts/scale-up.txt'),
};

/** Grid units from the level's outline (0 inside it). */
function outside(p: { x: number; z: number }, map: LevelMap): number {
  const dx = Math.max(-0.5 - p.x, 0, p.x - (map.width - 0.5));
  const dz = Math.max(-0.5 - p.z, 0, p.z - (map.height - 0.5));
  return Math.hypot(dx, dz);
}

describe('sceneOf', () => {
  it('names the scene of a preset, and none for the default', () => {
    for (const [id, a] of Object.entries(ATMOSPHERES)) expect(sceneOf(a)).toBe(id);
    expect(sceneOf(DEFAULT_ATMOSPHERE)).toBeUndefined();
  });
});

describe('ambient motion', () => {
  it('only the canal evening has it', () => {
    expect(ATMOSPHERES['scale-up']?.ambient).toBeDefined();
    expect(ATMOSPHERES.garage?.ambient).toBeUndefined();
    expect(ATMOSPHERES['open-plan']?.ambient).toBeUndefined();
    expect(DEFAULT_ATMOSPHERE.ambient).toBeUndefined();
  });

  for (const [name, map] of Object.entries(MAPS)) {
    const build = SCENES['scale-up'];
    if (!build) throw new Error('no scale-up scene');
    const anchors = ambientAnchors(build(map), map);

    it(`finds steam, a canal and lamp halos round the ${name} map`, () => {
      expect(anchors.steam.length).toBeGreaterThan(0);
      expect(anchors.water.length).toBeGreaterThan(0);
      expect(anchors.halos.length).toBeGreaterThan(0);
    });

    it(`keeps everything that moves a tile clear of the ${name} map`, () => {
      for (const p of [...anchors.steam, ...anchors.smoke])
        expect(outside(p, map)).toBeGreaterThanOrEqual(1);
      for (const w of anchors.water) expect(w.z0).toBeGreaterThanOrEqual(map.height - 0.5 + 1);
    });

    it(`puts the steam up at the van's hatch on the ${name} map`, () => {
      for (const p of anchors.steam) {
        expect(p.y).toBeGreaterThan(0.4);
        expect(p.y).toBeLessThan(1);
      }
    });
  }
});

describe('the incident beacon', () => {
  const maps = {
    shipped: read('maps/level-04-seed-round.txt'),
    draft: read('maps/drafts/seed-round.txt'),
  };
  for (const [name, map] of Object.entries(maps)) {
    it(`sits on the loft's own beacon, right beside the dashboard, on the ${name} map`, () => {
      const lens = beaconSpot(map);
      expect(lens).not.toBeNull();
      if (!lens) return;
      const art = loftRoom(map).wallArt;
      const dash = art.find((a) => a.art === 'dashboard');
      const beacon = art.find((a) => a.art === 'beacon');
      expect(dash && beacon && beacon.y === dash.y).toBe(true);
      expect(Math.abs((beacon?.x ?? 0) - (dash?.x ?? 99))).toBeLessThanOrEqual(2.5);
      // Over the beacon's wall tile, up on the wall and just in front of it.
      const wall = gridToWorld(beacon?.x ?? 0, beacon?.y ?? 0);
      expect(lens.x).toBeCloseTo(wall.x);
      expect(lens.z).toBeGreaterThan(wall.z);
      expect(lens.z).toBeLessThan(wall.z + 1);
      expect(lens.y).toBeGreaterThan(0.8);
    });
  }

  it('turns once a second, the same way every time', () => {
    expect(beaconAngle(0, 1)).toBe(0);
    expect(beaconAngle(250, 1)).toBeCloseTo(Math.PI / 2);
    expect(beaconAngle(1250, 1)).toBeCloseTo(beaconAngle(250, 1));
    expect(beaconAngle(500, 2)).toBeCloseTo(0);
  });

  it('flares only while the beam faces the camera', () => {
    // A beam along +x turned by -pi/2 (3/4 of a turn) points along +z, at the camera.
    expect(beaconFlare(beaconAngle(750, 1))).toBeCloseTo(1);
    expect(beaconFlare(beaconAngle(250, 1))).toBe(0);
    expect(beaconFlare(0)).toBeCloseTo(0);
  });
});

describe("the lamps' chase", () => {
  it('stays in [0, 1] and repeats every period', () => {
    for (let t = 0; t < 12000; t += 370) {
      for (let i = 0; i < 5; i++) {
        const k = chaseLevel(t, 6, i, 5);
        expect(k).toBeGreaterThanOrEqual(0);
        expect(k).toBeLessThanOrEqual(1);
        expect(chaseLevel(t + 6000, 6, i, 5)).toBeCloseTo(k);
      }
    }
  });

  it('runs along the row: the next lamp follows a step behind', () => {
    expect(chaseLevel(1200, 6, 1, 5)).toBeCloseTo(chaseLevel(0, 6, 0, 5));
    expect(chaseLevel(0, 6, 0, 5)).not.toBeCloseTo(chaseLevel(0, 6, 2, 5));
  });
});
