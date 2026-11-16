import { describe, it } from 'vitest';
import { CHAPTERS } from './levels';
import { BOT_STAR_TIMEOUT_MS, expectBotsEarnAStar } from './testing';

describe('scale-up chapter', () => {
  const chapter = CHAPTERS.find((c) => c.id === 'scale-up');
  for (const level of chapter?.levels ?? []) {
    it(
      `${level.name}: one and two bots earn at least 1 star on average`,
      () => {
        expectBotsEarnAStar(level);
      },
      BOT_STAR_TIMEOUT_MS,
    );
  }
});
