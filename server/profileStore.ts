/**
 * Online profiles: a display name and level progress per user id, kept on
 * the server. `ProfileStore` is what the HTTP routes and rooms use;
 * `JsonFileProfileStore` keeps everything in one JSON file (fine for an
 * internal game), `MemoryProfileStore` is the same without the file, for
 * tests.
 *
 * Every call runs after the one before has finished (one promise chain), so
 * two merges for the same user never read the same old profile and the file
 * is never written twice at once. Times come in as ISO strings from the
 * caller.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { defaultDisplayName, normalizeDisplayName } from '../src/flow/identity';
import { type LevelRecord, mergeLevels, parseLevels, recordLevel } from '../src/flow/save';
import { NET_MAX_PROFILES } from '../src/sim/balance';
import type { LevelResult } from '../src/sim/orders';

/**
 * Outside `server/`, `src/` and `maps/` on purpose: `npm run server` restarts on
 * any change there, so a profile write would restart the server mid-game.
 */
export const DEFAULT_PROFILE_STORE_PATH = 'data/profiles.json';
const FILE_VERSION = 1;
const EPOCH = new Date(0).toISOString();

export interface Profile {
  userId: string;
  displayName: string;
  /** Same shape as `SaveData.levels`. */
  levels: Record<string, LevelRecord>;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileUpdate {
  /** Replaces the name when given. */
  displayName?: string;
  /** Merged in: best stars and score per level win, plays is the larger count. */
  levels?: Record<string, LevelRecord>;
}

export interface ProfileStore {
  /** The profile, or `null` when this user has none yet. */
  get(userId: string): Promise<Profile | null>;
  /** Merges into the profile, creating it when missing. Returns the result. */
  merge(userId: string, update: ProfileUpdate, now: string): Promise<Profile>;
  /** Adds a finished round, creating the profile when missing. */
  recordResult(
    userId: string,
    levelId: string,
    result: LevelResult,
    now: string,
    displayName?: string,
  ): Promise<Profile>;
}

/** Thrown when creating a profile would go past the store's `maxProfiles`. */
export class ProfileLimitError extends Error {
  constructor(readonly maxProfiles: number) {
    super(`profile limit reached (${maxProfiles})`);
    this.name = 'ProfileLimitError';
  }
}

function newProfile(userId: string, now: string): Profile {
  return {
    userId,
    displayName: defaultDisplayName(userId),
    levels: {},
    createdAt: now,
    updatedAt: now,
  };
}

/** The profiles in memory; subclasses add loading and saving. */
export class MemoryProfileStore implements ProfileStore {
  protected profiles = new Map<string, Profile>();
  private chain: Promise<unknown> = Promise.resolve();

  /** Past this many profiles, creating one throws `ProfileLimitError`; existing ones still change. */
  constructor(readonly maxProfiles = NET_MAX_PROFILES) {}

  get(userId: string): Promise<Profile | null> {
    return this.run(false, () => {
      const profile = this.profiles.get(userId);
      return profile ? structuredClone(profile) : null;
    });
  }

  merge(userId: string, update: ProfileUpdate, now: string): Promise<Profile> {
    return this.run(true, () =>
      this.change(userId, now, (profile) => {
        const name =
          update.displayName === undefined ? null : normalizeDisplayName(update.displayName);
        if (name) profile.displayName = name;
        if (update.levels) profile.levels = mergeLevels(profile.levels, update.levels);
      }),
    );
  }

  recordResult(
    userId: string,
    levelId: string,
    result: LevelResult,
    now: string,
    displayName?: string,
  ): Promise<Profile> {
    return this.run(true, () =>
      this.change(userId, now, (profile) => {
        recordLevel(profile.levels, levelId, result);
        const name = displayName === undefined ? null : normalizeDisplayName(displayName);
        if (name) profile.displayName = name;
      }),
    );
  }

  /** Reads what is stored, once, before the first call. */
  protected load(): Promise<void> {
    return Promise.resolve();
  }

  /** Stores the profiles after a change. */
  protected persist(): Promise<void> {
    return Promise.resolve();
  }

  private change(userId: string, now: string, apply: (profile: Profile) => void): Profile {
    let profile = this.profiles.get(userId);
    if (!profile) {
      if (this.profiles.size >= this.maxProfiles) throw new ProfileLimitError(this.maxProfiles);
      profile = newProfile(userId, now);
    }
    apply(profile);
    profile.updatedAt = now;
    this.profiles.set(userId, profile);
    return structuredClone(profile);
  }

  private loaded: Promise<void> | null = null;

  /** Queues `fn` after every call before it; a failed call doesn't block the next. */
  private run<T>(writes: boolean, fn: () => T): Promise<T> {
    const next = this.chain.then(async () => {
      // A failed load (say, no permission) is tried again on the next call.
      this.loaded ??= this.load().catch((error: unknown) => {
        this.loaded = null;
        throw error;
      });
      await this.loaded;
      const value = fn();
      if (writes) await this.persist();
      return value;
    });
    this.chain = next.catch(() => undefined);
    return next;
  }
}

/** Any parsed JSON to profiles: what doesn't look like a profile is left out. */
export function parseProfiles(raw: unknown): Map<string, Profile> {
  const profiles = new Map<string, Profile>();
  if (typeof raw !== 'object' || raw === null) return profiles;
  const list = (raw as { profiles?: unknown }).profiles;
  if (typeof list !== 'object' || list === null) return profiles;
  for (const [userId, value] of Object.entries(list)) {
    if (typeof value !== 'object' || value === null) continue;
    const p = value as Record<string, unknown>;
    const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
    profiles.set(userId, {
      userId,
      displayName: normalizeDisplayName(str(p.displayName) ?? '') ?? defaultDisplayName(userId),
      levels: parseLevels(p.levels),
      createdAt: str(p.createdAt) ?? EPOCH,
      updatedAt: str(p.updatedAt) ?? EPOCH,
    });
  }
  return profiles;
}

function isMissing(error: unknown): boolean {
  return (error as { code?: unknown }).code === 'ENOENT';
}

/**
 * All profiles in one JSON file (`{ version, profiles: { [userId]: Profile } }`),
 * read on first use and rewritten after each change: written to a temp file
 * next to it, then renamed over it, so a crash never leaves half a file.
 * A file that isn't valid JSON is renamed to `<path>.corrupt-<time>` and the
 * store starts empty; a missing file (and folder) is created on the first write.
 */
export class JsonFileProfileStore extends MemoryProfileStore {
  constructor(
    readonly path: string,
    /** Names the backup of a corrupt file. */
    private readonly clock: () => Date = () => new Date(),
    maxProfiles = NET_MAX_PROFILES,
  ) {
    super(maxProfiles);
  }

  protected override async load(): Promise<void> {
    let text: string;
    try {
      text = await readFile(this.path, 'utf8');
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      raw = undefined;
    }
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      const backup = `${this.path}.corrupt-${this.clock().toISOString().replace(/[:.]/g, '-')}`;
      await rename(this.path, backup);
      console.warn(`Profile store ${this.path} was not valid JSON; moved it to ${backup}`);
      return;
    }
    this.profiles = parseProfiles(raw);
  }

  protected override async persist(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${process.pid}.tmp`;
    const data = { version: FILE_VERSION, profiles: Object.fromEntries(this.profiles) };
    await writeFile(temp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    await rename(temp, this.path);
  }
}

/** The store `npm run server` uses: `PROFILE_STORE_PATH`, or `data/profiles.json`. */
export function profileStoreFromEnv(env: NodeJS.ProcessEnv = process.env): JsonFileProfileStore {
  return new JsonFileProfileStore(env.PROFILE_STORE_PATH || DEFAULT_PROFILE_STORE_PATH);
}
