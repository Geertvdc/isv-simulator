import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type LevelMap, parseLevelMap } from '../../../sim/level';
import { SCENES } from '.';
import { groundModel } from './ground';
import { downTheHallScene } from './downTheHall';

const read = (path: string) =>
  parseLevelMap(readFileSync(new URL(`../../../../${path}`, import.meta.url), 'utf8'));

/** The shipped level and the redesign draft: the scene must fit both. */
const MAPS: Record<string, LevelMap> = {
  shipped: read('maps/level-03-scale-up.txt'),
  draft: read('maps/drafts/scale-up.txt'),
};

describe('downTheHallScene', () => {
  it("is the scale-up level's scene", () => {
    expect(SCENES['scale-up']).toBe(downTheHallScene);
  });

  for (const [name, map] of Object.entries(MAPS)) {
    it(`builds the same scene every time (${name})`, () => {
      // Through the registry, the way `Surroundings` builds it.
      const build = SCENES['scale-up'] ?? downTheHallScene;
      const scene = build(map);
      expect(scene).toEqual(build(map));
      groundModel(scene).body.dispose();
    });
  }
});
