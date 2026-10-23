/**
 * What the world map behind the menus shows, read from the flow and the
 * save: plain data, so it is testable without a renderer.
 */

import type { Flow, Screen } from '../flow/flow';
import {
  type ChapterInfo,
  type SaveData,
  isChapterOpen,
  isUnlocked,
  totalStars,
} from '../flow/save';

export interface MenuLevel {
  open: boolean;
  /** Best stars so far, or `null` when never played. */
  stars: number | null;
}

export interface MenuView {
  screen: Screen;
  /** The selected level, as an index into `levelIds`. */
  levelIndex: number;
  levelIds: readonly string[];
  chapters: readonly ChapterInfo[];
  /** Per level, in `levelIds` order. */
  levels: readonly MenuLevel[];
  /** Per chapter: its star gate is met. */
  chapterOpen: readonly boolean[];
  totalStars: number;
}

/**
 * Screens that show the world map instead of a level: the menus outside a
 * round. During the intro, countdown, round, pause, results and the demo the
 * level shows. `online` is this browser's screen while it connects, before
 * the room's own screen is known.
 */
const MAP_SCREENS: ReadonlySet<Screen> = new Set<Screen>([
  'title',
  'lobby',
  'levelSelect',
  'settings',
  'profile',
  'credits',
  'joinCode',
  'online',
]);

/** Whether `screen` shows the world map; `null` (no screen yet) does too. */
export function showsMap(screen: Screen | null): boolean {
  return screen === null || MAP_SCREENS.has(screen);
}

export interface MenuViewSource {
  flow: Flow;
  save: SaveData;
  levelIds: readonly string[];
  chapters: readonly ChapterInfo[];
  unlockAll: boolean;
}

export function menuViewOf(source: MenuViewSource): MenuView {
  const { flow, save, levelIds, chapters, unlockAll } = source;
  return {
    screen: flow.screen,
    levelIndex: flow.levelIndex,
    levelIds,
    chapters,
    levels: levelIds.map((id, i) => ({
      open: isUnlocked(save, levelIds, i, unlockAll, chapters),
      stars: save.levels[id]?.bestStars ?? null,
    })),
    chapterOpen: chapters.map((_, c) => isChapterOpen(save, levelIds, chapters, c, unlockAll)),
    totalStars: totalStars(save, levelIds),
  };
}

/**
 * Whether the stage draws the world map (else the level) this frame.
 * `local` is this browser's flow, `room` the online room's flow while
 * `local` is on its `online` screen (`null` while connecting); a `picture`
 * (`?scene=`) always shows its level.
 */
export function drawsMap(local: Flow, room: Flow | null, picture: boolean): boolean {
  if (picture) return false;
  const shown = local.screen === 'online' ? room : local;
  return showsMap(shown?.screen ?? null);
}
