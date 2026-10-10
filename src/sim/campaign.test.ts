import { describe, expect, it } from 'vitest';
import { CHAPTER_STAR_GATES, TICKS_PER_SECOND } from './balance';
import { type Bot, botInput, createBot, runBots } from './bot';
import { CHAPTER_BLURBS, CHAPTER_NAMES, LEVEL_BLURBS, LEVEL_NAMES } from './content';
import { CHAPTERS, LEVELS, type Level } from './levels';
import { type GameState, createGame } from './state';
import { tick } from './tick';

/** Which of the chapter mechanics a level uses. */
function mechanics(level: Level): { incidents: boolean; manager: boolean; meetings: boolean } {
  return {
    incidents: level.incidents !== null,
    manager: level.map.managerSpawns.length > 0,
    meetings: level.meetings !== null,
  };
}

describe('chapters', () => {
  it('are Garage, Startup, Scale-Up and Enterprise, three levels each, about 12 in all', () => {
    expect(CHAPTERS.map((c) => c.id)).toEqual(['garage', 'startup', 'scale-up', 'enterprise']);
    for (const chapter of CHAPTERS) expect(chapter.levels).toHaveLength(3);
    expect(LEVELS).toHaveLength(12);
    expect(LEVELS).toEqual(CHAPTERS.flatMap((c) => c.levels));
  });

  it('open at rising star gates, the first one right away', () => {
    expect(CHAPTERS.map((c) => c.starGate)).toEqual(CHAPTER_STAR_GATES);
    expect(CHAPTERS[0]?.starGate).toBe(0);
    CHAPTERS.forEach((c, i) => {
      // Reachable with 1 to 2 stars on every level before it.
      expect(c.starGate).toBeLessThanOrEqual(i * 3 * 2);
      if (i > 0) expect(c.starGate).toBeGreaterThan(CHAPTERS[i - 1]?.starGate ?? 0);
    });
  });

  it('have names and blurbs, and so does every level', () => {
    for (const c of CHAPTERS) {
      expect(CHAPTER_NAMES[c.id]).toBe(c.name);
      expect(CHAPTER_BLURBS[c.id]).toBeTruthy();
    }
    for (const l of LEVELS) {
      expect(LEVEL_NAMES[l.id]).toBe(l.name);
      expect(LEVEL_BLURBS[l.id]).toBeTruthy();
    }
  });

  it('each bring in one mechanic: the first level teaches it alone, the others mix in earlier ones', () => {
    const [garage, startup, scaleUp, enterprise] = CHAPTERS;
    for (const l of garage?.levels ?? []) {
      expect(mechanics(l)).toEqual({ incidents: false, manager: false, meetings: false });
    }
    const teaches = [
      [startup, 'incidents'],
      [scaleUp, 'manager'],
      [enterprise, 'meetings'],
    ] as const;
    for (const [chapter, mechanic] of teaches) {
      const [first, ...rest] = chapter?.levels ?? [];
      if (!first) throw new Error('empty chapter');
      const m = mechanics(first);
      expect(m[mechanic]).toBe(true);
      expect(Object.values(m).filter(Boolean)).toHaveLength(1);
      expect(first.reviewShare).toBe(0);
      for (const level of rest) {
        expect(mechanics(level)[mechanic]).toBe(true);
        // Plus something from before: reviews or an earlier chapter's mechanic.
        const others = Object.values(mechanics(level)).filter(Boolean).length - 1;
        expect(others + (level.reviewShare > 0 ? 1 : 0)).toBeGreaterThan(0);
      }
    }
  });

  it('levels with meetings have a meeting room; meeting rooms only where there are meetings', () => {
    for (const level of LEVELS) {
      expect(level.map.meetingTiles.length > 0).toBe(level.meetings !== null);
    }
  });
});

/** Bots play `seconds` of a level; returns the state. */
function play(level: Level, seed: number, players: number, seconds: number): GameState {
  const ids = Array.from({ length: players }, (_, i) => i + 1);
  const state = createGame(level, seed, ids);
  const bots = ids.map((id) => createBot(id));
  advance(state, bots, seconds);
  return state;
}

function advance(state: GameState, bots: Bot[], seconds: number): void {
  for (let i = 0; i < seconds * TICKS_PER_SECOND && !state.result; i++) {
    tick(
      state,
      bots.map((b) => botInput(state, b, bots)),
    );
  }
}

describe('every level', () => {
  for (const level of LEVELS) {
    it(`${level.name}: one and two bots earn at least 1 star`, () => {
      expect(runBots(level, 1, 1).result.stars).toBeGreaterThanOrEqual(1);
      expect(runBots(level, 2, 2).result.stars).toBeGreaterThanOrEqual(1);
    });

    it(`${level.name}: same seed and inputs give the same state, which survives JSON`, () => {
      const a = play(level, 4, 3, 70);
      const b = play(level, 4, 3, 70);
      expect(a).toEqual(b);
      const copy = JSON.parse(JSON.stringify(a)) as GameState;
      expect(copy).toEqual(a);
      // The copy plays on exactly like the original.
      const botsA = [1, 2, 3].map((id) => createBot(id));
      const botsCopy = [1, 2, 3].map((id) => createBot(id));
      advance(a, botsA, 20);
      advance(copy, botsCopy, 20);
      expect(copy).toEqual(a);
    });
  }
});
