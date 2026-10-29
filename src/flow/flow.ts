/**
 * The screens around a round, as a plain-data state machine: title, lobby,
 * level select, the level intro card and countdown, the round itself,
 * pause, results, settings (with the online profile), credits, and the way
 * into an online room (typing a join code), and the demo (bots play while
 * nobody does, for a big screen at a booth). The server runs the same flow
 * for a room (`flow.online`), with a few online rules.
 * `updateFlow` (in `updateFlow.ts`) turns this frame's button presses into a
 * new screen and a list of effects for the scene to run (start a round,
 * save, ...); the menu actions live in `menuActions.ts` and the join-code
 * screen in `joinFlow.ts`. This module holds the state, its queries and the
 * small moves they share. Like the
 * sim it never touches Phaser or the DOM, and time only comes in as an
 * argument.
 */

import type { DevicePress } from '../input/controller';
import type { DeviceId } from '../input/controller';
import { type Lobby, createLobby } from '../input/lobby';
import { COUNTDOWN_STEPS, COUNTDOWN_STEP_MS, END_SCREEN_INPUT_DELAY_MS } from '../sim/balance';
import type { LevelResult } from '../sim/orders';
import { type ChapterInfo, type SaveData, isChapterOpen, isUnlocked, recordResult } from './save';
import { resetReadiness } from './roster';

export type Screen =
  | 'title'
  | 'lobby'
  | 'levelSelect'
  /** The level card before a round: name, recipes, what's new. */
  | 'intro'
  /** "3, 2, 1" before the round; the round waits and presses are ignored. */
  | 'countdown'
  | 'playing'
  | 'paused'
  | 'results'
  | 'settings'
  /** Under settings: this browser's user id and display name. */
  | 'profile'
  | 'credits'
  /** Typing a join code to join an online room. */
  | 'joinCode'
  /** In an online room: the screens come from the server, this flow waits. */
  | 'online'
  /** Bots play a round while nobody does; any button goes back to the title. */
  | 'demo';

/** One line in a vertical menu. */
export type MenuItem =
  | 'play'
  | 'hostOnline'
  | 'joinOnline'
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
  | 'music'
  | 'shake'
  | 'graphics'
  | 'profile'
  | ProfileAction
  | 'back';

/**
 * What the profile screen's lines do. The flow only asks for them (a
 * `profileAction` effect): copying and typing happen in the browser's UI.
 */
export type ProfileAction = 'copyId' | 'changeName' | 'changeId';

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

/** Why joining or staying in an online room didn't work, for the screens to explain. */
export type OnlineError =
  /** The typed code can't be a code (not 4 letters from the code alphabet). */
  | 'badCode'
  /** No room with that code. */
  | 'wrongCode'
  | 'roomFull'
  /** The server runs another version of the game. */
  | 'protocolMismatch'
  /** The server can't be reached. */
  | 'unreachable'
  /** The connection to the room was lost. */
  | 'disconnected'
  /** The connection dropped and getting back into the room didn't work in time. */
  | 'reconnectFailed'
  /** The server is shutting down (a restart or a deploy). */
  | 'serverShutdown'
  /** The room closed after a long time without anyone playing. */
  | 'roomClosed';

/** The join-code screen: what is typed so far. */
export interface JoinCodeEntry {
  /** Upper case, code letters only, at most `NET_JOIN_CODE_LENGTH`. */
  text: string;
  /** For the gamepad letter wheel: the letter it changes. */
  cursor: number;
  error: OnlineError | null;
  /** A join is out: waiting for the server. */
  busy: boolean;
}

/** The title menu, in order. */
export const TITLE_ITEMS: readonly MenuItem[] = [
  'play',
  'hostOnline',
  'joinOnline',
  'settings',
  'credits',
];

/** How a demo round went, shown once it's over until the next one starts. */
export interface DemoEnd {
  score: number;
  stars: number;
  /** When the round ended, in the caller's clock. */
  atMs: number;
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
  /** When the countdown started, in the caller's clock. */
  countdownStartMs: number;
  /** The join-code screen's entry. */
  joinCode: JoinCodeEntry;
  /**
   * The flow of an online room, run on the server: back in the lobby does
   * nothing (leaving is up to each browser), and the pause menu has no
   * settings or quit.
   */
  online: boolean;
  /** When any device last pressed a button, in the caller's clock; the demo starts after a while without. */
  lastPressMs: number;
  /** Demo rounds started so far: picks the next demo level. */
  demoRounds: number;
  /** Set once the demo round on screen is over. */
  demoEnd: DemoEnd | null;
}

/** Demo mode: bots play when nobody has pressed a button for a while. */
export interface DemoOptions {
  /** `?demo`, for a booth: the other menus go to the demo too, not only the title. */
  kiosk: boolean;
  /** The levels the demo plays in turn, as indexes into `levelIds`. */
  levels: readonly number[];
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
  /** Who may start the game from the lobby; player 1 when left out. */
  canStart?: (deviceId: DeviceId) => boolean;
  /** Connected owned slots online; disconnected players cannot block confirmation. */
  participates?: (deviceId: DeviceId) => boolean;
  /** Dev-only local lab skips the campaign map, without saving progression. */
  practice?: boolean;
  /** Demo mode; left out for none (an online room). */
  demo?: DemoOptions;
}

export type FlowEffect =
  | { type: 'lockRoster' }
  /** Start a fresh round of this level, dropping any round in progress. */
  | { type: 'startLevel'; levelIndex: number }
  /** Carry on with the paused round; real time spent paused must not count. */
  | { type: 'resumeRound' }
  /** Drop the round in progress. */
  | { type: 'stopRound' }
  /** The save changed and should be written. */
  | { type: 'saveChanged' }
  /** The settings changed and should be applied. */
  | { type: 'settingsChanged' }
  /** A line on the profile screen was picked. */
  | { type: 'profileAction'; action: ProfileAction }
  /** Create an online room and go in. */
  | { type: 'hostOnline' }
  /** Join the online room with this code (already normalized). */
  | { type: 'joinOnline'; code: string }
  /** Drop the join that is out: the player backed out. */
  | { type: 'cancelJoin' };

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
    countdownStartMs: 0,
    joinCode: emptyJoinCode(),
    online: false,
    lastPressMs: 0,
    demoRounds: 0,
    demoEnd: null,
  };
}

export function emptyJoinCode(): JoinCodeEntry {
  return { text: '', cursor: 0, error: null, busy: false };
}

/** The lines of the current screen's menu; empty for screens without one. */
export function menuItems(flow: Flow): MenuItem[] {
  switch (flow.screen) {
    case 'title':
      return flow.awake ? [...TITLE_ITEMS] : [];
    case 'paused':
      return flow.online
        ? ['resume', 'restart', 'levelSelect', 'changePlayers']
        : ['resume', 'restart', 'settings', 'levelSelect', 'changePlayers', 'quit'];
    case 'results':
      return flow.results?.canGoNext ? ['next', 'retry', 'levelSelect'] : ['retry', 'levelSelect'];
    case 'settings':
      return ['volume', 'music', 'shake', 'graphics', 'profile', 'back'];
    case 'profile':
      return ['copyId', 'changeName', 'changeId', 'back'];
    case 'credits':
      return ['back'];
    default:
      return [];
  }
}

/** Whether the round should advance this frame. */
export function isRoundRunning(flow: Flow): boolean {
  return flow.screen === 'playing' || (flow.screen === 'demo' && flow.demoEnd === null);
}

/** How long the whole countdown lasts, in ms. */
export const COUNTDOWN_MS = COUNTDOWN_STEPS * COUNTDOWN_STEP_MS;

/** The number the countdown shows now (3, 2, 1), or `null` outside the countdown. */
export function countdownNumber(flow: Flow, nowMs: number): number | null {
  if (flow.screen !== 'countdown') return null;
  const step = Math.floor(Math.max(0, nowMs - flow.countdownStartMs) / COUNTDOWN_STEP_MS);
  return Math.max(1, COUNTDOWN_STEPS - step);
}

/** Whether the results screen takes presses yet. */
export function resultsReady(flow: Flow, nowMs: number): boolean {
  return flow.results !== null && nowMs - flow.results.endedAtMs >= END_SCREEN_INPUT_DELAY_MS;
}

/** What a press means in a menu. */
export function isConfirm(press: DevicePress): boolean {
  return press.interact || press.join;
}

export function isBack(press: DevicePress): boolean {
  return press.dash || press.menu;
}

export function hasAnything(press: DevicePress): boolean {
  return isConfirm(press) || isBack(press) || press.nav.x !== 0 || press.nav.y !== 0;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function goTo(flow: Flow, screen: Screen, menuIndex = 0): void {
  flow.screen = screen;
  flow.menuIndex = menuIndex;
  if (screen !== 'results') flow.results = null;
  if (screen !== 'demo') flow.demoEnd = null;
}

/** Back on the title with nobody joined. */
export function quitToTitle(flow: Flow, item: MenuItem = 'play'): void {
  flow.lobby = createLobby();
  goTo(flow, 'title', TITLE_ITEMS.indexOf(item));
}

/** To the lobby, keeping everyone who joined, so players can join or leave. */
export function changePlayers(flow: Flow): void {
  flow.lobby.started = false;
  resetReadiness(flow.lobby);
  goTo(flow, 'lobby');
}

/** The demo round ended: its score shows until the next one starts. Nothing is saved. */
export function finishDemoRound(flow: Flow, result: LevelResult, nowMs: number): FlowUpdate {
  if (flow.screen !== 'demo' || flow.demoEnd) return { changed: false, effects: [] };
  flow.demoEnd = { score: result.score, stars: result.stars, atMs: nowMs };
  return { changed: true, effects: [] };
}

/** The online room is over (left, or the connection is gone): back on the title. */
export function onlineEnded(flow: Flow, item: MenuItem = 'hostOnline'): void {
  flow.awake = true;
  quitToTitle(flow, item);
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
