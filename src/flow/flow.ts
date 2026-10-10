/**
 * The screens around a round, as a plain-data state machine: title, lobby,
 * level select, the round itself, pause, results, settings and credits.
 * `updateFlow` turns this frame's button presses into a new screen and a
 * list of effects for the scene to run (start a round, save, ...). Like the
 * sim it never touches Phaser or the DOM, and time only comes in as an
 * argument.
 */

import type { DevicePress } from '../input/controller';
import { type Lobby, createLobby, updateLobby } from '../input/lobby';
import { END_SCREEN_INPUT_DELAY_MS, SFX_VOLUME_MAX } from '../sim/balance';
import type { LevelResult } from '../sim/orders';
import {
  type ChapterInfo,
  type SaveData,
  chapterIndexOf,
  isChapterOpen,
  isUnlocked,
  recordResult,
} from './save';

export type Screen =
  'title' | 'lobby' | 'levelSelect' | 'playing' | 'paused' | 'results' | 'settings' | 'credits';

/** One line in a vertical menu. */
export type MenuItem =
  | 'play'
  | 'settings'
  | 'credits'
  | 'resume'
  | 'restart'
  | 'levelSelect'
  | 'changePlayers'
  | 'quit'
  | 'next'
  | 'retry'
  | 'volume'
  | 'shake'
  | 'back';

export interface Results {
  score: number;
  stars: number;
  /** The score beat the best so far (or it was the first round on this level). */
  newBest: boolean;
  /** The level this round just unlocked, if any. */
  unlockedIndex: number | null;
  /** The chapter this round just opened (its star gate was met), if any. */
  unlockedChapter: number | null;
  /** Whether there is a next level and it is open. */
  canGoNext: boolean;
  /** When the round ended, in the caller's clock; presses wait a moment after. */
  endedAtMs: number;
}

/** Screens that can open the settings, and get them back after. */
export type SettingsFrom = 'title' | 'paused';

export interface Flow {
  screen: Screen;
  /** On the title: someone pressed a button, so the menu shows (and audio may play). */
  awake: boolean;
  /** Stays the same between levels; `started` once the players moved on to pick a level. */
  lobby: Lobby;
  /** The level being played, or the one highlighted in the level select. */
  levelIndex: number;
  /** The highlighted line in the current screen's menu. */
  menuIndex: number;
  settingsFrom: SettingsFrom;
  /** Set on the results screen. */
  results: Results | null;
}

export interface FlowContext {
  /** Progress and settings. `updateFlow` changes the settings in place, `finishRound` the progress. */
  save: SaveData;
  /** Every level's id, in order. */
  levelIds: readonly string[];
  /** The chapters, in order; together they hold `levelIds` in the same order. */
  chapters: readonly ChapterInfo[];
  /** `?unlockAll`: every level is open. */
  unlockAll: boolean;
  /** Current time in ms, any clock that only goes forward. */
  nowMs: number;
}

export type FlowEffect =
  /** Start a fresh round of this level, dropping any round in progress. */
  | { type: 'startLevel'; levelIndex: number }
  /** Carry on with the paused round; real time spent paused must not count. */
  | { type: 'resumeRound' }
  /** Drop the round in progress. */
  | { type: 'stopRound' }
  /** The save changed and should be written. */
  | { type: 'saveChanged' }
  /** The settings changed and should be applied. */
  | { type: 'settingsChanged' };

export interface FlowUpdate {
  /** Whether anything on screen changed. */
  changed: boolean;
  effects: FlowEffect[];
}

export function createFlow(): Flow {
  return {
    screen: 'title',
    awake: false,
    lobby: createLobby(),
    levelIndex: 0,
    menuIndex: 0,
    settingsFrom: 'title',
    results: null,
  };
}

/** The lines of the current screen's menu; empty for screens without one. */
export function menuItems(flow: Flow): MenuItem[] {
  switch (flow.screen) {
    case 'title':
      return flow.awake ? ['play', 'settings', 'credits'] : [];
    case 'paused':
      return ['resume', 'restart', 'settings', 'levelSelect', 'changePlayers', 'quit'];
    case 'results':
      return flow.results?.canGoNext ? ['next', 'retry', 'levelSelect'] : ['retry', 'levelSelect'];
    case 'settings':
      return ['volume', 'shake', 'back'];
    case 'credits':
      return ['back'];
    default:
      return [];
  }
}

/** Whether the round should advance this frame. */
export function isRoundRunning(flow: Flow): boolean {
  return flow.screen === 'playing';
}

/** Whether the results screen takes presses yet. */
export function resultsReady(flow: Flow, nowMs: number): boolean {
  return flow.results !== null && nowMs - flow.results.endedAtMs >= END_SCREEN_INPUT_DELAY_MS;
}

/** What a press means in a menu. */
function isConfirm(press: DevicePress): boolean {
  return press.interact || press.join;
}

function isBack(press: DevicePress): boolean {
  return press.dash || press.menu;
}

function hasAnything(press: DevicePress): boolean {
  return isConfirm(press) || isBack(press) || press.nav.x !== 0 || press.nav.y !== 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function goTo(flow: Flow, screen: Screen, menuIndex = 0): void {
  flow.screen = screen;
  flow.menuIndex = menuIndex;
  if (screen !== 'results') flow.results = null;
}

/** Back on the title with nobody joined. */
function quitToTitle(flow: Flow, item: MenuItem = 'play'): void {
  flow.lobby = createLobby();
  goTo(flow, 'title', ['play', 'settings', 'credits'].indexOf(item));
}

/** To the lobby, keeping everyone who joined, so players can join or leave. */
function changePlayers(flow: Flow): void {
  flow.lobby.started = false;
  goTo(flow, 'lobby');
}

/**
 * Applies this frame's presses. On the title and in the lobby any device
 * counts; after the lobby only devices that joined. One confirm or back
 * counts per frame, so Enter (which presses on both keyboard schemes) acts
 * once.
 */
export function updateFlow(
  flow: Flow,
  presses: readonly DevicePress[],
  ctx: FlowContext,
): FlowUpdate {
  const update: FlowUpdate = { changed: false, effects: [] };
  if (flow.screen === 'lobby') return updateLobbyScreen(flow, presses);
  const joined = new Set(flow.lobby.players.map((p) => p.deviceId));
  const own = flow.lobby.started ? presses.filter((p) => joined.has(p.deviceId)) : presses;
  if (own.length === 0) return update;

  if (flow.screen === 'title' && !flow.awake) {
    if (!own.some(hasAnything)) return update;
    flow.awake = true;
    flow.menuIndex = 0;
    return { changed: true, effects: [] };
  }
  if (flow.screen === 'playing') {
    if (!own.some((p) => p.menu)) return update;
    goTo(flow, 'paused');
    return { changed: true, effects: [] };
  }
  if (flow.screen === 'results' && !resultsReady(flow, ctx.nowMs)) return update;

  for (const press of own) {
    if (navigate(flow, press, ctx, update)) update.changed = true;
  }
  const action = own.find((p) => isConfirm(p) || isBack(p));
  if (action) {
    const screen = flow.screen;
    if (isBack(action)) back(flow, update);
    else confirm(flow, ctx, update);
    if (flow.screen !== screen) update.changed = true;
  }
  return update;
}

function updateLobbyScreen(flow: Flow, presses: readonly DevicePress[]): FlowUpdate {
  const joined = new Set(flow.lobby.players.map((p) => p.deviceId));
  const backPress = presses.find((p) => isBack(p) && (joined.size === 0 || joined.has(p.deviceId)));
  if (backPress) {
    quitToTitle(flow);
    return { changed: true, effects: [] };
  }
  const changed = updateLobby(flow.lobby, presses);
  if (flow.lobby.started) goTo(flow, 'levelSelect');
  return { changed, effects: [] };
}

/** Moves a cursor or changes a setting. Returns whether anything changed. */
function navigate(flow: Flow, press: DevicePress, ctx: FlowContext, update: FlowUpdate): boolean {
  const { x, y } = press.nav;
  if (x === 0 && y === 0) return false;
  if (flow.screen === 'levelSelect') {
    const index = chapterCursor(ctx, flow.levelIndex, x, y);
    if (index === flow.levelIndex) return false;
    flow.levelIndex = index;
    return true;
  }
  const items = menuItems(flow);
  if (items.length === 0) return false;
  if (y !== 0) {
    const index = clamp(flow.menuIndex + y, 0, items.length - 1);
    if (index === flow.menuIndex) return false;
    flow.menuIndex = index;
    return true;
  }
  const item = items[flow.menuIndex];
  const settings = ctx.save.settings;
  if (item === 'volume') {
    const volume = clamp(settings.sfxVolume + x, 0, SFX_VOLUME_MAX);
    if (volume === settings.sfxVolume) return false;
    settings.sfxVolume = volume;
    update.effects.push({ type: 'settingsChanged' }, { type: 'saveChanged' });
    return true;
  }
  if (item === 'shake') {
    toggleShake(ctx, update);
    return true;
  }
  return false;
}

/**
 * The level select cursor moved from level `index`: left/right to the same
 * row of the chapter next door (or its last level when it's shorter),
 * up/down within the chapter. Returns the new level index.
 */
export function chapterCursor(ctx: FlowContext, index: number, x: number, y: number): number {
  const { chapters, levelIds } = ctx;
  const id = levelIds[index];
  const chapter = id === undefined ? -1 : chapterIndexOf(chapters, id);
  const current = chapters[chapter];
  if (!current) return clamp(index + (x !== 0 ? x : y), 0, levelIds.length - 1);
  const row = current.levelIds.indexOf(id ?? '');
  const target =
    x !== 0 ? chapters[clamp(chapter + Math.sign(x), 0, chapters.length - 1)] : current;
  if (!target) return index;
  const nextRow = x !== 0 ? row : row + Math.sign(y);
  const nextId = target.levelIds[clamp(nextRow, 0, target.levelIds.length - 1)];
  const next = nextId === undefined ? -1 : levelIds.indexOf(nextId);
  return next < 0 ? index : next;
}

function toggleShake(ctx: FlowContext, update: FlowUpdate): void {
  ctx.save.settings.screenShake = !ctx.save.settings.screenShake;
  update.effects.push({ type: 'settingsChanged' }, { type: 'saveChanged' });
  update.changed = true;
}

function back(flow: Flow, update: FlowUpdate): void {
  switch (flow.screen) {
    case 'levelSelect':
      changePlayers(flow);
      return;
    case 'paused':
      goTo(flow, 'playing');
      update.effects.push({ type: 'resumeRound' });
      return;
    case 'results':
      update.effects.push({ type: 'stopRound' });
      goTo(flow, 'levelSelect');
      return;
    case 'settings':
      closeSettings(flow);
      return;
    case 'credits':
      quitToTitle(flow, 'credits');
      return;
    default:
      return;
  }
}

function closeSettings(flow: Flow): void {
  const from = flow.settingsFrom;
  goTo(flow, from);
  flow.menuIndex = menuItems(flow).indexOf('settings');
}

function startLevel(flow: Flow, levelIndex: number, update: FlowUpdate): void {
  flow.levelIndex = levelIndex;
  goTo(flow, 'playing');
  update.effects.push({ type: 'startLevel', levelIndex });
}

function confirm(flow: Flow, ctx: FlowContext, update: FlowUpdate): void {
  if (flow.screen === 'levelSelect') {
    if (isUnlocked(ctx.save, ctx.levelIds, flow.levelIndex, ctx.unlockAll, ctx.chapters)) {
      startLevel(flow, flow.levelIndex, update);
    }
    return;
  }
  const item = menuItems(flow)[flow.menuIndex];
  switch (item) {
    case 'play':
      flow.lobby = createLobby();
      goTo(flow, 'lobby');
      return;
    case 'settings':
      flow.settingsFrom = flow.screen === 'paused' ? 'paused' : 'title';
      goTo(flow, 'settings');
      return;
    case 'credits':
      goTo(flow, 'credits');
      return;
    case 'resume':
      goTo(flow, 'playing');
      update.effects.push({ type: 'resumeRound' });
      return;
    case 'restart':
    case 'retry':
      startLevel(flow, flow.levelIndex, update);
      return;
    case 'next':
      startLevel(flow, flow.levelIndex + 1, update);
      return;
    case 'levelSelect':
      update.effects.push({ type: 'stopRound' });
      goTo(flow, 'levelSelect');
      return;
    case 'changePlayers':
      update.effects.push({ type: 'stopRound' });
      changePlayers(flow);
      return;
    case 'quit':
      update.effects.push({ type: 'stopRound' });
      quitToTitle(flow);
      return;
    case 'shake':
      toggleShake(ctx, update);
      return;
    case 'back':
      back(flow, update);
      return;
    case 'volume':
    case undefined:
      return;
  }
}

/**
 * The round on `flow.levelIndex` ended: records it in the save and shows the
 * results, with "Next level" picked when the next level is open.
 */
export function finishRound(flow: Flow, result: LevelResult, ctx: FlowContext): FlowUpdate {
  const levelId = ctx.levelIds[flow.levelIndex];
  if (levelId === undefined || flow.screen !== 'playing') return { changed: false, effects: [] };
  const next = flow.levelIndex + 1;
  const open = (): { level: boolean; chapters: boolean[] } => ({
    level: isUnlocked(ctx.save, ctx.levelIds, next, ctx.unlockAll, ctx.chapters),
    chapters: ctx.chapters.map((_, i) =>
      isChapterOpen(ctx.save, ctx.levelIds, ctx.chapters, i, ctx.unlockAll),
    ),
  });
  const before = open();
  const { newBest } = recordResult(ctx.save, levelId, result);
  const after = open();
  const isOpen = after.level;
  const chapter = after.chapters.findIndex((o, i) => o && !before.chapters[i]);
  flow.results = {
    score: result.score,
    stars: result.stars,
    newBest,
    unlockedIndex: isOpen && !before.level ? next : null,
    unlockedChapter: chapter >= 0 ? chapter : null,
    canGoNext: isOpen,
    endedAtMs: ctx.nowMs,
  };
  goTo(flow, 'results');
  return { changed: true, effects: [{ type: 'saveChanged' }] };
}
