import { describe, it } from 'vitest';
import { CHAPTERS } from './levels';
import { expectBotsEarnAStar } from './testing';

describe('big-tech chapter', () => {
  const chapter = CHAPTERS.find((c) => c.id === 'big-tech');
  for (const level of chapter?.levels ?? []) {
    it(`${level.name}: one and two bots earn at least 1 star on average`, () => {
      expectBotsEarnAStar(level);
    });
  }
});
