import { describe, expect, it } from 'vitest';
import type { DevicePress } from '../input/controller';
import { END_SCREEN_INPUT_DELAY_MS, SFX_VOLUME_MAX, STARS_TO_UNLOCK } from '../sim/balance';
import {
  type Flow,
  type FlowContext,
  type MenuItem,
  createFlow,
  finishRound,
  isRoundRunning,
  menuItems,
  resultsReady,
  updateFlow,
} from './flow';
import { createSave } from './save';

const IDS = ['garage', 'open-plan', 'scale-up'];

function ctx(extra: Partial<FlowContext> = {}): FlowContext {
  return { save: createSave(), levelIds: IDS, unlockAll: false, nowMs: 0, ...extra };
}

function press(deviceId: string, extra: Partial<DevicePress> = {}): DevicePress {
  return {
    deviceId,
    joinGroup: deviceId.startsWith('kb') ? 'keyboard' : deviceId,
    join: false,
    interact: false,
    dash: false,
    menu: false,
    nav: { x: 0, y: 0 },
    ...extra,
  };
}

const confirm = (id = 'pad-0'): DevicePress[] => [press(id, { interact: true, join: true })];
const back = (id = 'pad-0'): DevicePress[] => [press(id, { dash: true })];
const menu = (id = 'pad-0'): DevicePress[] => [press(id, { menu: true })];
const down = (id = 'pad-0'): DevicePress[] => [press(id, { nav: { x: 0, y: 1 } })];
const right = (id = 'pad-0'): DevicePress[] => [press(id, { nav: { x: 1, y: 0 } })];
const left = (id = 'pad-0'): DevicePress[] => [press(id, { nav: { x: -1, y: 0 } })];
/** Enter: a join press on both keyboard schemes at once. */
const enter = (): DevicePress[] => [
  press('kb-left', { join: true }),
  press('kb-right', { join: true }),
];

/** Highlights `item` in the current menu and confirms it. */
function pick(flow: Flow, item: MenuItem, c: FlowContext, id = 'pad-0') {
  const index = menuItems(flow).indexOf(item);
  expect(index).toBeGreaterThanOrEqual(0);
  flow.menuIndex = index;
  return updateFlow(flow, confirm(id), c);
}

/** Title → lobby with pad-0 (player 1) and kb-left joined → level select. */
function atLevelSelect(c = ctx()): Flow {
  const flow = createFlow();
  updateFlow(flow, confirm(), c);
  pick(flow, 'play', c);
  updateFlow(flow, confirm(), c);
  updateFlow(flow, enter(), c);
  updateFlow(flow, confirm(), c);
  expect(flow.screen).toBe('levelSelect');
  return flow;
}

function playing(c = ctx()): Flow {
  const flow = atLevelSelect(c);
  updateFlow(flow, confirm(), c);
  expect(flow.screen).toBe('playing');
  return flow;
}

describe('title', () => {
  it('waits for any button, which only wakes it', () => {
    const flow = createFlow();
    expect(menuItems(flow)).toEqual([]);
    expect(updateFlow(flow, [], ctx()).changed).toBe(false);
    expect(updateFlow(flow, confirm('pad-3'), ctx()).changed).toBe(true);
    expect(flow).toMatchObject({ screen: 'title', awake: true, menuIndex: 0 });
    expect(menuItems(flow)).toEqual(['play', 'settings', 'credits']);
  });

  it('moves the cursor up and down, stopping at the ends', () => {
    const flow = createFlow();
    updateFlow(flow, confirm(), ctx());
    updateFlow(flow, [press('kb-right', { nav: { x: 0, y: -1 } })], ctx());
    expect(flow.menuIndex).toBe(0);
    for (let i = 0; i < 5; i++) updateFlow(flow, down('pad-2'), ctx());
    expect(flow.menuIndex).toBe(2);
  });

  it('goes to an empty lobby, the settings and the credits', () => {
    const c = ctx();
    const flow = createFlow();
    updateFlow(flow, confirm(), c);
    pick(flow, 'credits', c);
    expect(flow.screen).toBe('credits');
    updateFlow(flow, back(), c);
    expect(flow).toMatchObject({ screen: 'title', menuIndex: 2 });
    pick(flow, 'settings', c);
    expect(flow).toMatchObject({ screen: 'settings', settingsFrom: 'title' });
    pick(flow, 'back', c);
    expect(flow).toMatchObject({ screen: 'title', menuIndex: 1 });
    pick(flow, 'play', c);
    expect(flow.screen).toBe('lobby');
    expect(flow.lobby).toEqual({ players: [], started: false });
  });

  it('acts once on Enter, although both keyboard schemes press it', () => {
    const c = ctx();
    const flow = createFlow();
    updateFlow(flow, enter(), c);
    pick(flow, 'settings', c);
    flow.menuIndex = menuItems(flow).indexOf('shake');
    updateFlow(flow, enter(), c);
    expect(c.save.settings.screenShake).toBe(false);
  });
});

describe('lobby', () => {
  function lobby(c = ctx()): Flow {
    const flow = createFlow();
    updateFlow(flow, confirm(), c);
    pick(flow, 'play', c);
    return flow;
  }

  it('joins players and moves on to the level select once player 1 starts', () => {
    const c = ctx();
    const flow = lobby(c);
    expect(updateFlow(flow, confirm('pad-1'), c).changed).toBe(true);
    expect(flow.lobby.players).toEqual([{ playerId: 1, deviceId: 'pad-1' }]);
    updateFlow(flow, confirm('pad-1'), c);
    expect(flow.screen).toBe('levelSelect');
    expect(flow.lobby.started).toBe(true);
  });

  it('goes back to the title from an empty lobby with any device', () => {
    const flow = lobby();
    updateFlow(flow, menu('kb-left'), ctx());
    expect(flow).toMatchObject({ screen: 'title', menuIndex: 0 });
  });

  it('only lets players who joined go back, and clears the lobby', () => {
    const flow = lobby();
    updateFlow(flow, confirm('pad-0'), ctx());
    updateFlow(flow, back('pad-1'), ctx());
    expect(flow.screen).toBe('lobby');
    updateFlow(flow, menu('pad-0'), ctx());
    expect(flow.screen).toBe('title');
    expect(flow.lobby.players).toEqual([]);
  });
});

describe('level select', () => {
  it('moves the cursor over every level, locked ones too', () => {
    const flow = atLevelSelect();
    updateFlow(flow, left(), ctx());
    expect(flow.levelIndex).toBe(0);
    updateFlow(flow, right('kb-left'), ctx());
    updateFlow(flow, down(), ctx());
    updateFlow(flow, right(), ctx());
    expect(flow.levelIndex).toBe(2);
  });

  it('starts unlocked levels only', () => {
    const c = ctx();
    const flow = atLevelSelect(c);
    updateFlow(flow, right(), c);
    expect(updateFlow(flow, confirm(), c).effects).toEqual([]);
    expect(flow.screen).toBe('levelSelect');
    c.save.levels.garage = { bestStars: STARS_TO_UNLOCK, bestScore: 60, plays: 1 };
    expect(updateFlow(flow, confirm(), c).effects).toEqual([{ type: 'startLevel', levelIndex: 1 }]);
    expect(flow.screen).toBe('playing');
  });

  it('starts anything with unlockAll', () => {
    const c = ctx({ unlockAll: true });
    const flow = atLevelSelect(c);
    updateFlow(flow, right(), c);
    updateFlow(flow, right(), c);
    expect(updateFlow(flow, confirm(), c).effects).toEqual([{ type: 'startLevel', levelIndex: 2 }]);
  });

  it('goes back to the lobby keeping the players', () => {
    const flow = atLevelSelect();
    updateFlow(flow, back('kb-left'), ctx());
    expect(flow.screen).toBe('lobby');
    expect(flow.lobby.started).toBe(false);
    expect(flow.lobby.players.map((p) => p.deviceId)).toEqual(['pad-0', 'kb-left']);
  });

  it('ignores devices that did not join', () => {
    const flow = atLevelSelect();
    const before = structuredClone(flow);
    for (const presses of [right('pad-3'), confirm('pad-3'), back('kb-right'), menu('pad-1')]) {
      expect(updateFlow(flow, presses, ctx()).changed).toBe(false);
    }
    expect(flow).toEqual(before);
  });
});

describe('pause', () => {
  it('runs the round only while playing', () => {
    const flow = playing();
    expect(isRoundRunning(flow)).toBe(true);
    updateFlow(flow, menu('kb-left'), ctx());
    expect(flow).toMatchObject({ screen: 'paused', menuIndex: 0 });
    expect(isRoundRunning(flow)).toBe(false);
  });

  it('opens only with the menu button of a player in the round', () => {
    const flow = playing();
    for (const presses of [confirm(), back(), right(), menu('pad-1'), menu('kb-right')]) {
      updateFlow(flow, presses, ctx());
    }
    expect(flow.screen).toBe('playing');
  });

  it('resumes with Resume, back or the menu button', () => {
    for (const presses of [confirm(), back(), menu('kb-left')]) {
      const flow = playing();
      updateFlow(flow, menu(), ctx());
      expect(updateFlow(flow, presses, ctx()).effects).toEqual([{ type: 'resumeRound' }]);
      expect(flow.screen).toBe('playing');
    }
  });

  it('restarts, or leaves the round for the level select, lobby or title', () => {
    const cases: [MenuItem, Partial<Flow>, string][] = [
      ['restart', { screen: 'playing' }, 'startLevel'],
      ['levelSelect', { screen: 'levelSelect' }, 'stopRound'],
      ['changePlayers', { screen: 'lobby' }, 'stopRound'],
      ['quit', { screen: 'title', menuIndex: 0 }, 'stopRound'],
    ];
    for (const [item, after, effect] of cases) {
      const flow = playing();
      updateFlow(flow, menu(), ctx());
      expect(pick(flow, item, ctx()).effects.map((e) => e.type)).toEqual([effect]);
      expect(flow).toMatchObject(after);
    }
  });

  it('keeps the players for Change players and drops them for Quit', () => {
    const flow = playing();
    updateFlow(flow, menu(), ctx());
    pick(flow, 'changePlayers', ctx());
    expect(flow.lobby).toMatchObject({ started: false });
    expect(flow.lobby.players).toHaveLength(2);
    const other = playing();
    updateFlow(other, menu(), ctx());
    pick(other, 'quit', ctx());
    expect(other.lobby.players).toEqual([]);
  });

  it('ignores devices that did not join', () => {
    const flow = playing();
    updateFlow(flow, menu(), ctx());
    updateFlow(flow, down('pad-2'), ctx());
    updateFlow(flow, confirm('pad-2'), ctx());
    expect(flow).toMatchObject({ screen: 'paused', menuIndex: 0 });
  });
});

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

  it('toggles screen shake with left, right or confirm', () => {
    const c = ctx();
    const flow = fromPause(c);
    updateFlow(flow, down(), c);
    updateFlow(flow, right(), c);
    expect(c.save.settings.screenShake).toBe(false);
    const update = updateFlow(flow, confirm(), c);
    expect(c.save.settings.screenShake).toBe(true);
    expect(update.effects.map((e) => e.type)).toContain('saveChanged');
  });

  it('returns to the pause menu with the cursor on Settings', () => {
    const flow = fromPause();
    updateFlow(flow, menu(), ctx());
    expect(flow.screen).toBe('paused');
    expect(menuItems(flow)[flow.menuIndex]).toBe('settings');
    expect(isRoundRunning(flow)).toBe(false);
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

describe('results', () => {
  function finished(stars: number, c = ctx(), levelIndex = 0): Flow {
    const flow = atLevelSelect(c);
    flow.levelIndex = levelIndex;
    updateFlow(flow, confirm(), c);
    c.nowMs = 1000;
    const update = finishRound(flow, { score: stars * 60, stars }, c);
    expect(update.effects).toEqual([{ type: 'saveChanged' }]);
    expect(flow.screen).toBe('results');
    return flow;
  }

  it('records the round, unlocks the next level and picks Next level', () => {
    const c = ctx();
    const flow = finished(STARS_TO_UNLOCK, c);
    expect(c.save.levels.garage?.bestStars).toBe(STARS_TO_UNLOCK);
    expect(flow.results).toMatchObject({ newBest: true, unlockedIndex: 1, canGoNext: true });
    expect(menuItems(flow)[flow.menuIndex]).toBe('next');
  });

  it('only says unlocked the first time', () => {
    const c = ctx();
    finished(STARS_TO_UNLOCK, c);
    const again = finished(0, c);
    expect(again.results).toMatchObject({ newBest: false, unlockedIndex: null, canGoNext: true });
  });

  it('offers no next level when it stays locked, or after the last level', () => {
    const locked = finished(0);
    expect(locked.results?.canGoNext).toBe(false);
    expect(menuItems(locked)).toEqual(['retry', 'levelSelect']);
    const last = finished(3, ctx({ unlockAll: true }), IDS.length - 1);
    expect(last.results).toMatchObject({ canGoNext: false, unlockedIndex: null });
    expect(menuItems(last)[last.menuIndex]).toBe('retry');
  });

  it('ignores presses for a moment, so mashing at the buzzer does nothing', () => {
    const c = ctx();
    const flow = finished(3, c);
    c.nowMs = 1000 + END_SCREEN_INPUT_DELAY_MS - 1;
    expect(resultsReady(flow, c.nowMs)).toBe(false);
    expect(updateFlow(flow, confirm(), c).changed).toBe(false);
    expect(flow.screen).toBe('results');
    c.nowMs += 1;
    expect(resultsReady(flow, c.nowMs)).toBe(true);
    expect(updateFlow(flow, confirm(), c).effects).toEqual([{ type: 'startLevel', levelIndex: 1 }]);
    expect(flow).toMatchObject({ screen: 'playing', levelIndex: 1, results: null });
  });

  it('retries, or goes to the level select', () => {
    const c = ctx();
    const flow = finished(3, c);
    c.nowMs = 10_000;
    expect(pick(flow, 'retry', c).effects).toEqual([{ type: 'startLevel', levelIndex: 0 }]);
    const other = finished(3, c);
    c.nowMs = 20_000;
    expect(updateFlow(other, back(), c).effects).toEqual([{ type: 'stopRound' }]);
    expect(other.screen).toBe('levelSelect');
  });

  it('only finishes a round that is being played', () => {
    const flow = atLevelSelect();
    expect(finishRound(flow, { score: 1, stars: 1 }, ctx()).changed).toBe(false);
    expect(flow.screen).toBe('levelSelect');
  });
});
