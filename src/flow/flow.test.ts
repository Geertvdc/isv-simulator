import { describe, expect, it } from 'vitest';
import { END_SCREEN_INPUT_DELAY_MS, STARS_TO_UNLOCK } from '../sim/balance';
import {
  type Flow,
  type FlowContext,
  type MenuItem,
  COUNTDOWN_MS,
  countdownNumber,
  createFlow,
  finishRound,
  isRoundRunning,
  menuItems,
  resultsReady,
} from './flow';
import { updateFlow } from './updateFlow';
import {
  atLevelSelect,
  back,
  confirm,
  ctx,
  down,
  enter,
  left,
  menu,
  pick,
  play,
  playing,
  press,
  right,
  IDS,
} from './flowTesting';

describe('title', () => {
  it('waits for any button, which only wakes it', () => {
    const flow = createFlow();
    expect(menuItems(flow)).toEqual([]);
    expect(updateFlow(flow, [], ctx()).changed).toBe(false);
    expect(updateFlow(flow, confirm('pad-3'), ctx()).changed).toBe(true);
    expect(flow).toMatchObject({ screen: 'title', awake: true, menuIndex: 0 });
    expect(menuItems(flow)).toEqual(['play', 'hostOnline', 'joinOnline', 'settings', 'credits']);
  });

  it('moves the cursor up and down, stopping at the ends', () => {
    const flow = createFlow();
    updateFlow(flow, confirm(), ctx());
    updateFlow(flow, [press('kb-right', { nav: { x: 0, y: -1 } })], ctx());
    expect(flow.menuIndex).toBe(0);
    for (let i = 0; i < 7; i++) updateFlow(flow, down('pad-2'), ctx());
    expect(flow.menuIndex).toBe(4);
  });

  it('goes to an empty lobby, the settings and the credits', () => {
    const c = ctx();
    const flow = createFlow();
    updateFlow(flow, confirm(), c);
    pick(flow, 'credits', c);
    expect(flow.screen).toBe('credits');
    updateFlow(flow, back(), c);
    expect(flow).toMatchObject({ screen: 'title', menuIndex: 4 });
    pick(flow, 'settings', c);
    expect(flow).toMatchObject({ screen: 'settings', settingsFrom: 'title' });
    pick(flow, 'back', c);
    expect(flow).toMatchObject({ screen: 'title', menuIndex: 3 });
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
    updateFlow(flow, right(), ctx());
    expect(flow.levelIndex).toBe(2);
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
    expect(flow.screen).toBe('intro');
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

describe('intro and countdown', () => {
  function atIntro(c = ctx()): Flow {
    const flow = atLevelSelect(c);
    updateFlow(flow, confirm(), c);
    expect(flow.screen).toBe('intro');
    return flow;
  }

  it('shows the intro card first; the round does not run under it', () => {
    const flow = atIntro();
    expect(isRoundRunning(flow)).toBe(false);
    expect(menuItems(flow)).toEqual([]);
  });

  it('every joined player confirms the intro, unjoined devices cannot', () => {
    const c = ctx({ nowMs: 500 });
    for (const id of ['pad-0', 'kb-left']) {
      const flow = atIntro(c);
      updateFlow(flow, confirm('pad-3'), c);
      updateFlow(flow, confirm('kb-right'), c);
      expect(flow.screen).toBe('intro');
      expect(updateFlow(flow, confirm(id), c).changed).toBe(true);
      expect(flow.screen).toBe('intro');
      updateFlow(flow, confirm(id === 'pad-0' ? 'kb-left' : 'pad-0'), c);
      expect(flow).toMatchObject({ screen: 'countdown', countdownStartMs: 500 });
    }
  });

  it('goes back to the level select from the intro, dropping the round', () => {
    const flow = atIntro();
    expect(updateFlow(flow, back(), ctx()).effects).toEqual([{ type: 'stopRound' }]);
    expect(flow.screen).toBe('levelSelect');
  });

  it('counts down 3, 2, 1, then the round runs', () => {
    const c = ctx({ nowMs: 1000 });
    const flow = atIntro(c);
    updateFlow(flow, confirm(), c);
    updateFlow(flow, confirm('kb-left'), c);
    const at = (ms: number): FlowContext => ({ ...c, nowMs: 1000 + ms });
    expect(countdownNumber(flow, 1000)).toBe(3);
    expect(countdownNumber(flow, 1000 + COUNTDOWN_MS / 3)).toBe(2);
    expect(countdownNumber(flow, 1000 + COUNTDOWN_MS - 1)).toBe(1);
    updateFlow(flow, [], at(COUNTDOWN_MS - 1));
    expect(isRoundRunning(flow)).toBe(false);
    expect(updateFlow(flow, [], at(COUNTDOWN_MS)).changed).toBe(true);
    expect(flow.screen).toBe('playing');
    expect(isRoundRunning(flow)).toBe(true);
    expect(countdownNumber(flow, 1000 + COUNTDOWN_MS)).toBeNull();
  });

  it('ignores every press during the countdown, pause and back included', () => {
    const c = ctx();
    const flow = atIntro(c);
    updateFlow(flow, confirm(), c);
    updateFlow(flow, confirm('kb-left'), c);
    for (const presses of [confirm(), back(), menu(), right(), down(), enter(), menu('kb-left')]) {
      const update = updateFlow(flow, presses, { ...c, nowMs: 100 });
      expect(update).toEqual({ changed: false, effects: [] });
      expect(flow.screen).toBe('countdown');
      expect(isRoundRunning(flow)).toBe(false);
    }
  });

  it('Restart preserves roles but requires a fresh team confirmation', () => {
    const c = ctx();
    const flow = playing(c);
    updateFlow(flow, menu(), c);
    pick(flow, 'restart', { ...c, nowMs: 7000 });
    expect(flow.screen).toBe('intro');
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
      ['restart', { screen: 'intro' }, 'startLevel'],
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

describe('results', () => {
  function finished(stars: number, c = ctx(), levelIndex = 0): Flow {
    const flow = atLevelSelect(c);
    flow.levelIndex = levelIndex;
    play(flow, c);
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
    expect(flow).toMatchObject({ screen: 'intro', levelIndex: 1, results: null });
  });

  it('retries, or goes to the level select', () => {
    const c = ctx();
    const flow = finished(3, c);
    c.nowMs = 10_000;
    expect(pick(flow, 'retry', c).effects).toEqual([{ type: 'startLevel', levelIndex: 0 }]);
    // Same level again: roles persist, but readiness must be reconfirmed.
    expect(flow).toMatchObject({ screen: 'intro' });
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

describe("a room's flow (online)", () => {
  function roomLobby(): Flow {
    const flow = createFlow();
    flow.online = true;
    flow.awake = true;
    flow.screen = 'lobby';
    return flow;
  }

  it('ignores back in the lobby: leaving is up to each browser', () => {
    const c = ctx();
    const flow = roomLobby();
    updateFlow(flow, confirm('a:pad-0'), c);
    updateFlow(flow, [...back('a:pad-0'), ...menu('b:pad-0')], c);
    expect(flow.screen).toBe('lobby');
    expect(flow.lobby.players).toHaveLength(1);
  });

  it('lets only the devices canStart allows start the game', () => {
    const host = (id: string): boolean => id.startsWith('host:');
    const c = ctx({ canStart: host });
    const flow = roomLobby();
    updateFlow(flow, confirm('guest:pad-0'), c);
    updateFlow(flow, confirm('host:pad-0'), c);
    // The guest is player 1 but not the host.
    updateFlow(flow, confirm('guest:pad-0'), c);
    expect(flow.screen).toBe('lobby');
    updateFlow(flow, confirm('host:pad-0'), c);
    expect(flow.screen).toBe('levelSelect');
  });

  it('has no settings or quit in the pause menu', () => {
    const flow = roomLobby();
    flow.screen = 'paused';
    expect(menuItems(flow)).toEqual(['resume', 'restart', 'levelSelect', 'changePlayers']);
  });
});
