import { describe, expect, it } from 'vitest';
import { LAB_LEVELS, LEVELS } from '../sim/levels';
import { LEVEL_LOOKS } from './mapLook';

describe('LEVEL_LOOKS', () => {
  it('gives every level a look of its own', () => {
    for (const level of [...LEVELS, ...LAB_LEVELS]) {
      expect(LEVEL_LOOKS[level.id], level.id).toBeDefined();
    }
  });
});
