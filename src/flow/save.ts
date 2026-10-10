/**
 * The save: progress per level and the settings, versioned, under one
 * `localStorage` key. Storage can be missing or throw (private windows,
 * blocked site data), so every access is guarded and the game plays fine
 * without it. Only progress and settings are saved, never a round.
 */

import {
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_SFX_VOLUME,
  MAX_STARS,
  SFX_VOLUME_MAX,
  STARS_TO_UNLOCK,
} from '../sim/balance';
import type { LevelResult } from '../sim/orders';

export const SAVE_KEY = 'isv-simulator.save';
/** Phase 6 to 9 kept only best stars, here. Read once when there is no save yet. */
export const OLD_BEST_STARS_KEY = 'isv-simulator.best-stars';
export const SAVE_VERSION = 1;

/** The part of `Storage` we use, so tests can pass a fake. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface LevelRecord {
  bestStars: number;
  bestScore: number;
  /** Rounds played to the end. */
  plays: number;
}

export interface Settings {
  /** 0 (off) to `SFX_VOLUME_MAX`. */
  sfxVolume: number;
  /** 0 (off) to `SFX_VOLUME_MAX`, separate from the sound effects. */
  musicVolume: number;
  screenShake: boolean;
  /** All sound and music off, from the speaker button or M. */
  muted: boolean;
}

export interface SaveData {
  version: number;
  /** By level id; levels never finished are missing. */
  levels: Record<string, LevelRecord>;
  settings: Settings;
  /** The first-level hints were all followed once; they never show again. */
  tutorialDone: boolean;
}

export function defaultSettings(): Settings {
  return { sfxVolume: DEFAULT_SFX_VOLUME, musicVolume: DEFAULT_MUSIC_VOLUME, screenShake: true, muted: false };
}

export function createSave(): SaveData {
  return { version: SAVE_VERSION, levels: {}, settings: defaultSettings(), tutorialDone: false };
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function wholeNumber(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function parseLevel(raw: unknown): LevelRecord | null {
  if (!isObject(raw)) return null;
  const bestStars = wholeNumber(raw.bestStars, 0, MAX_STARS);
  const bestScore = wholeNumber(raw.bestScore, -Infinity, Infinity);
  const plays = wholeNumber(raw.plays, 0, Infinity);
  // Without stars the record says nothing; the other two can fall back.
  if (bestStars === null) return null;
  return { bestStars, bestScore: bestScore ?? 0, plays: plays ?? 1 };
}

/**
 * Any parsed JSON to a save, field by field: what's broken or missing falls
 * back to its default. A save from a newer version is read as far as we
 * understand it.
 */
export function parseSave(raw: unknown): SaveData {
  const save = createSave();
  if (!isObject(raw)) return save;
  const version = wholeNumber(raw.version, 1, Infinity);
  if (version !== null) save.version = version;
  if (isObject(raw.levels)) {
    for (const [id, level] of Object.entries(raw.levels)) {
      const parsed = parseLevel(level);
      if (parsed) save.levels[id] = parsed;
    }
  }
  if (isObject(raw.settings)) {
    const volume = wholeNumber(raw.settings.sfxVolume, 0, SFX_VOLUME_MAX);
    if (volume !== null) save.settings.sfxVolume = volume;
    // Saves from before phase 12 have no music volume: they keep the default.
    const music = wholeNumber(raw.settings.musicVolume, 0, SFX_VOLUME_MAX);
    if (music !== null) save.settings.musicVolume = music;
    if (typeof raw.settings.screenShake === 'boolean') {
      save.settings.screenShake = raw.settings.screenShake;
    }
    if (typeof raw.settings.muted === 'boolean') save.settings.muted = raw.settings.muted;
  }
  if (typeof raw.tutorialDone === 'boolean') save.tutorialDone = raw.tutorialDone;
  return save;
}

/** The old best stars by level id, as level records. */
function migrateBestStars(raw: unknown): SaveData {
  const save = createSave();
  if (!isObject(raw)) return save;
  for (const [id, stars] of Object.entries(raw)) {
    const bestStars = wholeNumber(stars, 0, MAX_STARS);
    // The old save only knew stars; finishing a level once is the least it took.
    if (bestStars !== null) save.levels[id] = { bestStars, bestScore: 0, plays: 1 };
  }
  return save;
}

function readJson(storage: StorageLike | null, key: string): { found: boolean; value: unknown } {
  try {
    const text = storage?.getItem(key) ?? null;
    if (text === null) return { found: false, value: undefined };
    return { found: true, value: JSON.parse(text) as unknown };
  } catch {
    // Unreadable storage or broken JSON: start from defaults.
    return { found: true, value: undefined };
  }
}

/** The save, or a fresh one. Moves the old best stars over the first time. */
export function loadSave(storage: StorageLike | null): SaveData {
  const current = readJson(storage, SAVE_KEY);
  if (current.found) return parseSave(current.value);
  const old = readJson(storage, OLD_BEST_STARS_KEY);
  if (!old.found) return createSave();
  const save = migrateBestStars(old.value);
  writeSave(storage, save);
  return save;
}

/**
 * Stores the save. Whatever a newer version of the game left in the stored
 * save that we don't know about is kept, so playing an older build never
 * throws newer progress away.
 */
export function writeSave(storage: StorageLike | null, save: SaveData): void {
  try {
    const stored = readJson(storage, SAVE_KEY).value;
    const base = isObject(stored) ? stored : {};
    const baseLevels = isObject(base.levels) ? base.levels : {};
    const levels: Json = { ...baseLevels };
    for (const [id, record] of Object.entries(save.levels)) {
      const old = baseLevels[id];
      levels[id] = { ...(isObject(old) ? old : {}), ...record };
    }
    const settings = { ...(isObject(base.settings) ? base.settings : {}), ...save.settings };
    const version = Math.max(save.version, wholeNumber(base.version, 1, Infinity) ?? 1);
    storage?.setItem(
      SAVE_KEY,
      JSON.stringify({ ...base, version, levels, settings, tutorialDone: save.tutorialDone }),
    );
  } catch {
    // Full or blocked: progress lives on in memory for this session.
  }
}

export interface RecordOutcome {
  /** The score beat the best so far, or this is the first finished round. */
  newBest: boolean;
}

/** Adds a finished round to the save. A worse round never lowers a best. */
export function recordResult(save: SaveData, levelId: string, result: LevelResult): RecordOutcome {
  const old = save.levels[levelId];
  const stars = Math.min(MAX_STARS, Math.max(0, result.stars));
  save.levels[levelId] = {
    bestStars: Math.max(old?.bestStars ?? 0, stars),
    bestScore: old ? Math.max(old.bestScore, result.score) : result.score,
    plays: (old?.plays ?? 0) + 1,
  };
  return { newBest: !old || result.score > old.bestScore };
}

/** A chapter as the menus see it: its levels in order and the stars that open it. */
export interface ChapterInfo {
  levelIds: readonly string[];
  /** Best stars over all levels needed to open it. */
  starGate: number;
}

/** Whether chapter `index` is open: the total of best stars meets its gate. */
export function isChapterOpen(
  save: SaveData,
  levelIds: readonly string[],
  chapters: readonly ChapterInfo[],
  index: number,
  unlockAll = false,
): boolean {
  const chapter = chapters[index];
  if (!chapter) return false;
  return unlockAll || totalStars(save, levelIds) >= chapter.starGate;
}

/** The chapter holding `levelId`, or -1 when no chapter has it. */
export function chapterIndexOf(chapters: readonly ChapterInfo[], levelId: string): number {
  return chapters.findIndex((c) => c.levelIds.includes(levelId));
}

/**
 * Whether the level at `index` of `levelIds` may be played: the first always,
 * the others once the one before has `STARS_TO_UNLOCK` stars and its
 * chapter's star gate is met.
 */
export function isUnlocked(
  save: SaveData,
  levelIds: readonly string[],
  index: number,
  unlockAll = false,
  chapters: readonly ChapterInfo[] = [],
): boolean {
  if (index < 0 || index >= levelIds.length) return false;
  if (unlockAll || index === 0) return true;
  const previous = levelIds[index - 1];
  const id = levelIds[index];
  if (previous === undefined || id === undefined) return false;
  if ((save.levels[previous]?.bestStars ?? 0) < STARS_TO_UNLOCK) return false;
  const chapter = chapterIndexOf(chapters, id);
  return chapter < 0 || isChapterOpen(save, levelIds, chapters, chapter);
}

/** Best stars added up over the given levels. */
export function totalStars(save: SaveData, levelIds: readonly string[]): number {
  return levelIds.reduce((sum, id) => sum + (save.levels[id]?.bestStars ?? 0), 0);
}
