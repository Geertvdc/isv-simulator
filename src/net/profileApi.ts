/**
 * Talks to the server's profile API (`GET`/`PUT /profiles/:userId`) and
 * merges this browser's progress with the online profile. `fetch` comes in
 * as an argument, so this stays testable and free of browser globals.
 *
 * Everything here may fail (no server, offline, a slow network): `syncLevels`
 * then answers `null` and the game carries on with the local save, exactly
 * as it does without a server.
 */

import { type Identity, defaultDisplayName } from '../flow/identity';
import { type LevelRecord, mergeLevels, parseLevels } from '../flow/save';
import { NET_PROFILE_TIMEOUT_MS, NET_SERVER_DEFAULT_PORT } from '../sim/balance';

/** The part of `fetch` we use. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** A profile as the server sends it. */
export interface RemoteProfile {
  userId: string;
  displayName: string;
  levels: Record<string, LevelRecord>;
}

export interface ProfileUpdate {
  displayName?: string;
  levels?: Record<string, LevelRecord>;
}

export interface ProfileApi {
  /** The profile, or `null` when this user has none yet. Rejects on trouble. */
  get(userId: string): Promise<RemoteProfile | null>;
  /** Merges into the profile (creating it) and answers the result. Rejects on trouble. */
  put(userId: string, update: ProfileUpdate): Promise<RemoteProfile>;
}

/**
 * Where the server is: `VITE_SERVER_URL` when set (trailing slashes dropped),
 * else this page's host on port 2567 with the page's protocol.
 */
export function serverUrl(
  envUrl: string | undefined,
  location: { protocol: string; hostname: string },
): string {
  const url = envUrl?.trim().replace(/\/+$/, '');
  if (url) return url;
  const host = location.hostname.includes(':') ? `[${location.hostname}]` : location.hostname;
  return `${location.protocol}//${host}:${NET_SERVER_DEFAULT_PORT}`;
}

/** A profile from the server's JSON, or `null` when it doesn't look like one. */
export function parseProfile(raw: unknown): RemoteProfile | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.userId !== 'string' || typeof p.displayName !== 'string') return null;
  return { userId: p.userId, displayName: p.displayName, levels: parseLevels(p.levels) };
}

export function createProfileApi(
  baseUrl: string,
  fetchFn: FetchLike,
  timeoutMs = NET_PROFILE_TIMEOUT_MS,
): ProfileApi {
  const url = (userId: string): string => `${baseUrl}/profiles/${encodeURIComponent(userId)}`;
  const read = async (res: Response): Promise<RemoteProfile> => {
    if (!res.ok) throw new Error(`profile API answered ${res.status}`);
    const profile = parseProfile(await res.json());
    if (!profile) throw new Error('profile API sent something that is not a profile');
    return profile;
  };
  return {
    get: async (userId) => {
      const res = await fetchFn(url(userId), { signal: AbortSignal.timeout(timeoutMs) });
      return res.status === 404 ? null : read(res);
    },
    put: async (userId, update) =>
      read(
        await fetchFn(url(userId), {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(update),
          signal: AbortSignal.timeout(timeoutMs),
        }),
      ),
  };
}

/**
 * Sends this browser's progress to the profile and answers the two merged,
 * for the local save; `null` when the server can't be reached or says no.
 * A default name ("Dev 1234") isn't sent, so it never overwrites a name
 * picked on another device.
 */
export async function syncLevels(
  api: ProfileApi,
  identity: Identity,
  levels: Readonly<Record<string, LevelRecord>>,
): Promise<Record<string, LevelRecord> | null> {
  const update: ProfileUpdate = { levels: { ...levels } };
  if (identity.displayName !== defaultDisplayName(identity.userId)) {
    update.displayName = identity.displayName;
  }
  try {
    const profile = await api.put(identity.userId, update);
    return mergeLevels(levels, profile.levels);
  } catch {
    return null;
  }
}
