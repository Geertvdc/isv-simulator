import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type LevelMap, parseLevelMap } from '../../sim/level';
import { ATMOSPHERES, DEFAULT_ATMOSPHERE, sceneOf } from './atmosphere';
import { ambientAnchors } from './WorldFx';
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
