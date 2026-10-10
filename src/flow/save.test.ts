import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_SFX_VOLUME,
  SFX_VOLUME_MAX,
  STARS_TO_UNLOCK,
} from '../sim/balance';
import {
  OLD_BEST_STARS_KEY,
  SAVE_KEY,
  type StorageLike,
  chapterIndexOf,
  createSave,
  isChapterOpen,
  isUnlocked,
  loadSave,
  parseSave,
  recordResult,
  totalStars,
  writeSave,
} from './save';

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

const throwing: StorageLike = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

const IDS = ['garage', 'open-plan', 'scale-up'];

describe('loadSave and writeSave', () => {
  it('starts fresh with default settings', () => {
    expect(loadSave(memoryStorage())).toEqual({
      version: 1,
      levels: {},
      settings: {
        sfxVolume: DEFAULT_SFX_VOLUME,
        musicVolume: DEFAULT_MUSIC_VOLUME,
        screenShake: true,
      },
      tutorialDone: false,
    });
  });

  it('round-trips', () => {
    const storage = memoryStorage();
    const save = createSave();
    recordResult(save, 'garage', { score: 140, stars: 2 });
    save.settings = { sfxVolume: 3, musicVolume: 0, screenShake: false };
    save.tutorialDone = true;
    writeSave(storage, save);
    expect(loadSave(storage)).toEqual(save);
  });

  it('falls back to defaults field by field', () => {
    const save = parseSave({
      version: 'one',
      levels: {
        garage: { bestStars: 2, bestScore: 'lots', plays: -4 },
        'open-plan': { bestStars: 'three' },
        'scale-up': { bestStars: 9, bestScore: 12.4 },
        broken: 7,
      },
      settings: { sfxVolume: 99, musicVolume: -3, screenShake: 'yes' },
      tutorialDone: 'sure',
    });
    expect(save).toEqual({
      version: 1,
      levels: {
        garage: { bestStars: 2, bestScore: 0, plays: 0 },
        'scale-up': { bestStars: 3, bestScore: 12, plays: 1 },
      },
      settings: { sfxVolume: SFX_VOLUME_MAX, musicVolume: 0, screenShake: true },
      tutorialDone: false,
    });
  });

  it('gives a save from before music and hints the defaults, without a version bump', () => {
    const storage = memoryStorage();
    storage.data.set(
      SAVE_KEY,
      JSON.stringify({
        version: 1,
        levels: { garage: { bestStars: 1, bestScore: 70, plays: 2 } },
        settings: { sfxVolume: 4, screenShake: false },
      }),
    );
    const save = loadSave(storage);
    expect(save.version).toBe(1);
    expect(save.settings).toEqual({
      sfxVolume: 4,
      musicVolume: DEFAULT_MUSIC_VOLUME,
      screenShake: false,
    });
    expect(save.tutorialDone).toBe(false);
    save.settings.musicVolume = 2;
    save.tutorialDone = true;
    writeSave(storage, save);
    expect(JSON.parse(storage.data.get(SAVE_KEY) ?? '')).toMatchObject({
      version: 1,
      settings: { sfxVolume: 4, musicVolume: 2, screenShake: false },
      tutorialDone: true,
    });
  });

  it('shrugs off junk', () => {
    const storage = memoryStorage();
    for (const junk of ['not json', 'null', '[1]', '"save"', '{"levels":[1],"settings":null}']) {
      storage.data.set(SAVE_KEY, junk);
      expect(loadSave(storage)).toEqual(createSave());
    }
  });

  it('works without storage, or with storage that throws', () => {
    for (const storage of [null, throwing]) {
      expect(loadSave(storage)).toEqual(createSave());
      expect(() => {
        writeSave(storage, createSave());
      }).not.toThrow();
    }
  });

  it('moves the old best stars over once', () => {
    const storage = memoryStorage();
    storage.data.set(OLD_BEST_STARS_KEY, JSON.stringify({ garage: 3, 'open-plan': 'x' }));
    const save = loadSave(storage);
    expect(save.levels).toEqual({ garage: { bestStars: 3, bestScore: 0, plays: 1 } });
    expect(storage.data.has(SAVE_KEY)).toBe(true);
    // From now on the new save wins, even if the old key changes.
    storage.data.set(OLD_BEST_STARS_KEY, JSON.stringify({ garage: 0 }));
    expect(loadSave(storage).levels.garage?.bestStars).toBe(3);
  });

  it('migrates nothing from a broken old key', () => {
    const storage = memoryStorage();
    storage.data.set(OLD_BEST_STARS_KEY, 'garbage');
    expect(loadSave(storage)).toEqual(createSave());
  });

  it('reads a newer save as far as it can and keeps what it does not know', () => {
    const storage = memoryStorage();
    const newer = {
      version: 3,
      levels: { garage: { bestStars: 2, bestScore: 150, plays: 4, bestTime: 99 } },
      settings: { sfxVolume: 4, screenShake: false, musicVolume: 7, voiceVolume: 2 },
      tutorialDone: true,
      achievements: ['shipped'],
    };
    storage.data.set(SAVE_KEY, JSON.stringify(newer));
    const save = loadSave(storage);
    expect(save.version).toBe(3);
    expect(save.levels.garage).toEqual({ bestStars: 2, bestScore: 150, plays: 4 });
    expect(save.settings).toEqual({ sfxVolume: 4, musicVolume: 7, screenShake: false });
    expect(save.tutorialDone).toBe(true);

    recordResult(save, 'garage', { score: 200, stars: 3 });
    save.settings.sfxVolume = 5;
    writeSave(storage, save);
    expect(JSON.parse(storage.data.get(SAVE_KEY) ?? '')).toEqual({
      version: 3,
      levels: { garage: { bestStars: 3, bestScore: 200, plays: 5, bestTime: 99 } },
      settings: { sfxVolume: 5, screenShake: false, musicVolume: 7, voiceVolume: 2 },
      tutorialDone: true,
      achievements: ['shipped'],
    });
  });
});

describe('recordResult', () => {
  it('keeps the best per level and counts plays', () => {
    const save = createSave();
    expect(recordResult(save, 'garage', { score: 90, stars: 1 })).toEqual({ newBest: true });
    expect(recordResult(save, 'garage', { score: 150, stars: 2 })).toEqual({ newBest: true });
    expect(recordResult(save, 'garage', { score: 40, stars: 0 })).toEqual({ newBest: false });
    expect(recordResult(save, 'garage', { score: 150, stars: 2 })).toEqual({ newBest: false });
    expect(save.levels.garage).toEqual({ bestStars: 2, bestScore: 150, plays: 4 });
  });

  it('counts a first round as a best, even a bad one', () => {
    const save = createSave();
    expect(recordResult(save, 'garage', { score: -20, stars: 0 }).newBest).toBe(true);
    expect(save.levels.garage).toEqual({ bestStars: 0, bestScore: -20, plays: 1 });
  });
});

describe('unlocking', () => {
  it('always opens the first level and nothing outside the list', () => {
    const save = createSave();
    expect(isUnlocked(save, IDS, 0)).toBe(true);
    expect(isUnlocked(save, IDS, 1)).toBe(false);
    expect(isUnlocked(save, IDS, -1)).toBe(false);
    expect(isUnlocked(save, IDS, 3)).toBe(false);
  });

  it('opens the next level at STARS_TO_UNLOCK and never locks it again', () => {
    const save = createSave();
    recordResult(save, 'garage', { score: 10, stars: STARS_TO_UNLOCK - 1 });
    expect(isUnlocked(save, IDS, 1)).toBe(false);
    recordResult(save, 'garage', { score: 80, stars: STARS_TO_UNLOCK });
    expect(isUnlocked(save, IDS, 1)).toBe(true);
    recordResult(save, 'garage', { score: 0, stars: 0 });
    expect(isUnlocked(save, IDS, 1)).toBe(true);
    expect(isUnlocked(save, IDS, 2)).toBe(false);
  });

  it('opens everything with unlockAll', () => {
    expect(IDS.every((_, i) => isUnlocked(createSave(), IDS, i, true))).toBe(true);
  });

  it('adds up the best stars', () => {
    const save = createSave();
    recordResult(save, 'garage', { score: 0, stars: 2 });
    recordResult(save, 'scale-up', { score: 0, stars: 3 });
    recordResult(save, 'removed-level', { score: 0, stars: 3 });
    expect(totalStars(save, IDS)).toBe(5);
  });
});

describe('chapter gates', () => {
  const IDS = ['a1', 'a2', 'b1', 'b2', 'c1'];
  const CHAPTERS = [
    { levelIds: ['a1', 'a2'], starGate: 0 },
    { levelIds: ['b1', 'b2'], starGate: 3 },
    { levelIds: ['c1'], starGate: 5 },
  ];
  const record = (bestStars: number) => ({ bestStars, bestScore: 0, plays: 1 });

  it('finds the chapter of a level', () => {
    expect(chapterIndexOf(CHAPTERS, 'b2')).toBe(1);
    expect(chapterIndexOf(CHAPTERS, 'nope')).toBe(-1);
  });

  it('open a chapter once the total of best stars meets its gate', () => {
    const save = createSave();
    expect(isChapterOpen(save, IDS, CHAPTERS, 0)).toBe(true);
    expect(isChapterOpen(save, IDS, CHAPTERS, 1)).toBe(false);
    save.levels.a1 = record(1);
    save.levels.a2 = record(2);
    expect(isChapterOpen(save, IDS, CHAPTERS, 1)).toBe(true);
    expect(isChapterOpen(save, IDS, CHAPTERS, 2)).toBe(false);
    expect(isChapterOpen(save, IDS, CHAPTERS, 2, true)).toBe(true);
    expect(isChapterOpen(save, IDS, CHAPTERS, 3, true)).toBe(false);
  });

  it('keep the first level of a locked chapter shut even with the level before it starred', () => {
    const save = createSave();
    save.levels.a1 = record(1);
    save.levels.a2 = record(1);
    expect(isUnlocked(save, IDS, 2, false, CHAPTERS)).toBe(false);
    save.levels.a1 = record(2);
    expect(isUnlocked(save, IDS, 2, false, CHAPTERS)).toBe(true);
    // The per-level rule still holds inside an open chapter.
    expect(isUnlocked(save, IDS, 3, false, CHAPTERS)).toBe(false);
    expect(isUnlocked(save, IDS, 2, true, CHAPTERS)).toBe(true);
  });

  it('a chapter open by stars still needs the level before', () => {
    const save = createSave();
    save.levels.a1 = record(3);
    expect(isChapterOpen(save, IDS, CHAPTERS, 1)).toBe(true);
    expect(isUnlocked(save, IDS, 2, false, CHAPTERS)).toBe(false);
  });
});
