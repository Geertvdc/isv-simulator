import { describe, expect, it } from 'vitest';
import { SFX_VOLUME_MAX } from '../sim/balance';
import { type Flow, type FlowContext, finishRound, isRoundRunning, menuItems } from './flow';
import { updateFlow } from './updateFlow';
import {
  atLevelSelect,
  back,
  confirm,
  ctx,
  down,
  left,
  menu,
  pick,
  play,
  playing,
  right,
} from './flowTesting';

describe('settings', () => {
  function fromPause(c = ctx()): Flow {
    const flow = playing(c);
    updateFlow(flow, menu(), c);
    pick(flow, 'settings', c);
    expect(flow).toMatchObject({ screen: 'settings', settingsFrom: 'paused', menuIndex: 0 });
    return flow;
  }

  it('changes the volume with left and right, within its range', () => {
    const c = ctx();
    const flow = fromPause(c);
    expect(updateFlow(flow, right(), c).effects).toEqual([]);
    expect(c.save.settings.sfxVolume).toBe(SFX_VOLUME_MAX);
    const update = updateFlow(flow, left(), c);
    expect(update.effects.map((e) => e.type).sort()).toEqual(['saveChanged', 'settingsChanged']);
    expect(c.save.settings.sfxVolume).toBe(SFX_VOLUME_MAX - 1);
    for (let i = 0; i < SFX_VOLUME_MAX + 3; i++) updateFlow(flow, left(), c);
    expect(c.save.settings.sfxVolume).toBe(0);
  });

  it('changes the music volume on its own line, apart from the sound volume', () => {
    const c = ctx();
    const flow = fromPause(c);
    updateFlow(flow, down(), c);
    expect(menuItems(flow)[flow.menuIndex]).toBe('music');
    const before = c.save.settings.musicVolume;
    const update = updateFlow(flow, left(), c);
    expect(update.effects.map((e) => e.type).sort()).toEqual(['saveChanged', 'settingsChanged']);
    expect(c.save.settings.musicVolume).toBe(before - 1);
    expect(c.save.settings.sfxVolume).toBe(SFX_VOLUME_MAX);
    for (let i = 0; i < SFX_VOLUME_MAX + 3; i++) updateFlow(flow, right(), c);
    expect(c.save.settings.musicVolume).toBe(SFX_VOLUME_MAX);
  });

  it('toggles screen shake with left, right or confirm', () => {
    const c = ctx();
    const flow = fromPause(c);
    updateFlow(flow, down(), c);
    updateFlow(flow, down(), c);
    updateFlow(flow, right(), c);
    expect(c.save.settings.screenShake).toBe(false);
    const update = updateFlow(flow, confirm(), c);
    expect(c.save.settings.screenShake).toBe(true);
    expect(update.effects.map((e) => e.type)).toContain('saveChanged');
  });

  it('steps Graphics through auto, high, medium and low, wrapping round', () => {
    const c = ctx();
    const flow = fromPause(c);
    flow.menuIndex = menuItems(flow).indexOf('graphics');
    expect(c.save.settings.graphics).toBe('auto');
    updateFlow(flow, right(), c);
    expect(c.save.settings.graphics).toBe('high');
    updateFlow(flow, left(), c);
    const update = updateFlow(flow, left(), c);
    expect(c.save.settings.graphics).toBe('low');
    expect(update.effects.map((e) => e.type)).toContain('saveChanged');
    updateFlow(flow, confirm(), c);
    expect(c.save.settings.graphics).toBe('auto');
  });

  it('returns to the pause menu with the cursor on Settings', () => {
    const flow = fromPause();
    updateFlow(flow, menu(), ctx());
    expect(flow.screen).toBe('paused');
    expect(menuItems(flow)[flow.menuIndex]).toBe('settings');
    expect(isRoundRunning(flow)).toBe(false);
  });

  it('opens the online profile and comes back to its line', () => {
    const c = ctx();
    const flow = fromPause(c);
    pick(flow, 'profile', c);
    expect(flow.screen).toBe('profile');
    expect(menuItems(flow)).toEqual(['copyId', 'changeName', 'changeId', 'back']);
    updateFlow(flow, back(), c);
    expect(flow.screen).toBe('settings');
    expect(menuItems(flow)[flow.menuIndex]).toBe('profile');
    pick(flow, 'profile', c);
    pick(flow, 'back', c);
    expect(flow.screen).toBe('settings');
    expect(flow.settingsFrom).toBe('paused');
  });

  it('asks the UI to copy the id, change the name or use another id', () => {
    const c = ctx();
    const flow = fromPause(c);
    pick(flow, 'profile', c);
    for (const action of ['copyId', 'changeName', 'changeId'] as const) {
      flow.menuIndex = menuItems(flow).indexOf(action);
      const update = updateFlow(flow, confirm(), c);
      expect(update.effects).toEqual([{ type: 'profileAction', action }]);
      expect(flow.screen).toBe('profile');
    }
  });

  it('only takes presses from players once opened from the pause menu', () => {
    const c = ctx();
    const flow = fromPause(c);
    updateFlow(flow, left('pad-3'), c);
    updateFlow(flow, back('pad-3'), c);
    expect(flow.screen).toBe('settings');
    expect(c.save.settings.sfxVolume).toBe(SFX_VOLUME_MAX);
  });
});

describe('chapter view', () => {
  const CHAPTER_IDS = ['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'c1', 'c2'];
  const CHAPTERS = [
    { levelIds: ['a1', 'a2', 'a3'], starGate: 0 },
    { levelIds: ['b1', 'b2', 'b3'], starGate: 3 },
    { levelIds: ['c1', 'c2'], starGate: 6 },
  ];
  const chapterCtx = (extra: Partial<FlowContext> = {}): FlowContext =>
    ctx({ levelIds: CHAPTER_IDS, chapters: CHAPTERS, ...extra });

  it('drives the level select cursor, locked chapters included', () => {
    const c = chapterCtx();
    const flow = atLevelSelect(c);
    for (let i = 0; i < 4; i++) updateFlow(flow, right(), c);
    expect(flow.levelIndex).toBe(4);
    for (let i = 0; i < 5; i++) updateFlow(flow, right(), c);
    expect(flow.levelIndex).toBe(7);
    expect(updateFlow(flow, confirm(), c).effects).toEqual([]);
  });

  it('starts the first level of a chapter once its gate is met', () => {
    const c = chapterCtx();
    const flow = atLevelSelect(c);
    flow.levelIndex = 3;
    c.save.levels.a1 = { bestStars: 1, bestScore: 1, plays: 1 };
    c.save.levels.a2 = { bestStars: 1, bestScore: 1, plays: 1 };
    c.save.levels.a3 = { bestStars: 1, bestScore: 1, plays: 1 };
    expect(updateFlow(flow, confirm(), c).effects).toEqual([{ type: 'startLevel', levelIndex: 3 }]);
  });

  it('the results say when a round opened a chapter, and offer it as next level', () => {
    const c = chapterCtx();
    c.save.levels.a1 = { bestStars: 1, bestScore: 1, plays: 1 };
    c.save.levels.a2 = { bestStars: 1, bestScore: 1, plays: 1 };
    const flow = atLevelSelect(c);
    flow.levelIndex = 2;
    play(flow, c);
    finishRound(flow, { score: 60, stars: 1 }, c);
    expect(flow.results).toMatchObject({ unlockedChapter: 1, unlockedIndex: 3, canGoNext: true });
  });

  it('a chapter opened by stars on another level still shows as opened', () => {
    const c = chapterCtx();
    c.save.levels.a1 = { bestStars: 1, bestScore: 1, plays: 1 };
    const flow = atLevelSelect(c);
    play(flow, c);
    finishRound(flow, { score: 180, stars: 3 }, c);
    expect(flow.results).toMatchObject({ unlockedChapter: 1, unlockedIndex: null });
  });
});
