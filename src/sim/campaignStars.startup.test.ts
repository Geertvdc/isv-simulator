import { describe, it } from 'vitest';
import { CHAPTERS } from './levels';
import { expectBotsEarnAStar } from './testing';

describe('startup chapter', () => {
  const chapter = CHAPTERS.find((c) => c.id === 'startup');
  for (const level of chapter?.levels ?? []) {
    it(`${level.name}: one and two bots earn at least 1 star on average`, () => {
      expectBotsEarnAStar(level);
    });
  }
});
