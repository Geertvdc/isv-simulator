import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseLevelMap } from '../../../sim/level';
import { SCENES } from '.';
import { seedRoundScene } from './seedRound';

const map = parseLevelMap(
  readFileSync(new URL('../../../../maps/level-04-seed-round.txt', import.meta.url), 'utf8'),
);

describe('seedRoundScene', () => {
  it('is the seed-round scene and deterministic', () => {
    expect(SCENES['seed-round']).toBe(seedRoundScene);
    expect(SCENES['seed-round']?.(map)).toEqual(seedRoundScene());
  });
});
