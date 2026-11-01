import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type LevelMap, parseLevelMap } from '../../../sim/level';
import { SCENES } from '.';
import { groundModel } from './ground';
import { openPlanScene } from './openPlan';

const read = (path: string) =>
  parseLevelMap(readFileSync(new URL(`../../../../${path}`, import.meta.url), 'utf8'));

/** The shipped level and the redesign draft: the scene must fit both. */
const MAPS: Record<string, LevelMap> = {
  shipped: read('maps/level-02-open-plan.txt'),
  draft: read('maps/drafts/open-plan.txt'),
};

describe('openPlanScene', () => {
  it("is the open-plan level's scene", () => {
    expect(SCENES['open-plan']).toBe(openPlanScene);
  });

  for (const [name, map] of Object.entries(MAPS)) {
    it(`builds the same scene every time (${name})`, () => {
      // Through the registry, the way `Surroundings` builds it.
      const build = SCENES['open-plan'] ?? openPlanScene;
      const scene = build(map);
      expect(scene).toEqual(build(map));
      groundModel(scene).body.dispose();
    });
  }
});
