import { describe, expect, it } from 'vitest';
import { type Flow, type Screen, createFlow } from '../flow/flow';
import { createSave } from '../flow/save';
import { STARS_TO_UNLOCK } from '../sim/balance';
import { drawsMap, menuViewOf, showsMap } from './menuView';

const MAP_SCREENS: Screen[] = [
  'title',
  'lobby',
  'levelSelect',
  'settings',
  'profile',
  'credits',
  'joinCode',
  'online',
];
const ROUND_SCREENS: Screen[] = ['intro', 'countdown', 'playing', 'paused', 'results', 'demo'];

function flowOn(screen: Screen): Flow {
  return { ...createFlow(), screen };
}

describe('showsMap', () => {
  it('shows the map on the menus and the level around a round', () => {
    for (const screen of MAP_SCREENS) expect(showsMap(screen)).toBe(true);
    for (const screen of ROUND_SCREENS) expect(showsMap(screen)).toBe(false);
    expect(showsMap(null)).toBe(true);
  });
});

describe('drawsMap', () => {
  it('draws the map outside rounds and the level during them', () => {
    for (const screen of MAP_SCREENS) expect(drawsMap(flowOn(screen), null, false)).toBe(true);
    for (const screen of ROUND_SCREENS) expect(drawsMap(flowOn(screen), null, false)).toBe(false);
  });

  it('follows the online room: the map while connecting and on its menus, the level in its rounds', () => {
    const local = flowOn('online');
    expect(drawsMap(local, null, false)).toBe(true);
    expect(drawsMap(local, flowOn('levelSelect'), false)).toBe(true);
    expect(drawsMap(local, flowOn('lobby'), false)).toBe(true);
    expect(drawsMap(local, flowOn('playing'), false)).toBe(false);
    expect(drawsMap(local, flowOn('results'), false)).toBe(false);
  });

  it('always draws the level for a picture (?scene=)', () => {
    expect(drawsMap(flowOn('title'), null, true)).toBe(false);
  });
});

describe('menuViewOf', () => {
  const levelIds = ['a', 'b', 'c'];
  const chapters = [
    { levelIds: ['a', 'b'], starGate: 0 },
    { levelIds: ['c'], starGate: 5 },
  ];

  it('reads what is open and the stars from the save', () => {
    const save = createSave();
    save.levels.a = { bestScore: 100, bestStars: STARS_TO_UNLOCK, plays: 1 };
    const flow = { ...flowOn('levelSelect'), levelIndex: 1 };
    const view = menuViewOf({ flow, save, levelIds, chapters, unlockAll: false });
    expect(view.screen).toBe('levelSelect');
    expect(view.levelIndex).toBe(1);
    expect(view.levels).toEqual([
      { open: true, stars: STARS_TO_UNLOCK },
      { open: true, stars: null },
      { open: false, stars: null },
    ]);
    expect(view.chapterOpen).toEqual([true, false]);
    expect(view.totalStars).toBe(STARS_TO_UNLOCK);
  });

  it('opens everything with unlockAll', () => {
    const view = menuViewOf({
      flow: flowOn('levelSelect'),
      save: createSave(),
      levelIds,
      chapters,
      unlockAll: true,
    });
    expect(view.levels.every((l) => l.open)).toBe(true);
    expect(view.chapterOpen).toEqual([true, true]);
  });
});
