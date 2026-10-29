/**
 * The profile HTTP API, on the game server next to `/health`:
 *
 * - `GET /profiles/:userId`: the profile, or 404 when this user has none yet.
 * - `PUT /profiles/:userId` with `{ displayName?, levels? }`: merges a local
 *   save's levels in (best stars and score per level win, plays is the larger
 *   count), creating the profile when missing, and answers the merged profile.
 *
 * User ids are UUID v4s (any case; stored in lower case). Bad ids and bodies
 * get a 400. A new profile past the store's cap gets a 507 (existing ones
 * still update). Body size, per-IP rate limits and CORS origins are checked
 * before these run (`httpGuard.ts`).
 */

import { createEndpoint } from 'colyseus';
import { normalizeDisplayName, normalizeUserId } from '../src/flow/identity';
import { parseLevels } from '../src/flow/save';
import { ProfileLimitError, type ProfileStore, type ProfileUpdate } from './profileStore';

/** Most levels one `PUT` may carry; the game has a dozen. */
export const MAX_LEVELS_PER_UPDATE = 256;
const LEVEL_ID = /^[a-z0-9-]{1,64}$/;

export type Parsed<T> = { ok: true; value: T } | { ok: false; reason: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A `PUT` body, checked: an object with an optional name and optional levels. */
export function parseProfileUpdate(raw: unknown): Parsed<ProfileUpdate> {
  if (!isObject(raw)) return { ok: false, reason: 'body must be a JSON object' };
  const update: ProfileUpdate = {};
  if (raw.displayName !== undefined) {
    const name = typeof raw.displayName === 'string' ? normalizeDisplayName(raw.displayName) : null;
    if (!name) return { ok: false, reason: 'displayName must be 1 to 24 characters' };
    update.displayName = name;
  }
  if (raw.levels !== undefined) {
    if (!isObject(raw.levels)) return { ok: false, reason: 'levels must be an object' };
    const ids = Object.keys(raw.levels);
    if (ids.length > MAX_LEVELS_PER_UPDATE) return { ok: false, reason: 'too many levels' };
    const bad = ids.find((id) => !LEVEL_ID.test(id));
    if (bad !== undefined) return { ok: false, reason: `bad level id ${JSON.stringify(bad)}` };
    update.levels = parseLevels(raw.levels);
  }
  return { ok: true, value: update };
}

function userIdFrom(param: string): string | null {
  try {
    return normalizeUserId(decodeURIComponent(param));
  } catch {
    return null;
  }
}

const badRequest = (reason: string): Response => Response.json({ error: reason }, { status: 400 });

/** The two routes, reading and writing `store`; `now` stamps the profiles. */
export function profileEndpoints(
  store: ProfileStore,
  now: () => string = () => new Date().toISOString(),
) {
  const getProfile = createEndpoint('/profiles/:userId', { method: 'GET' }, async (ctx) => {
    const userId = userIdFrom(ctx.params.userId);
    if (!userId) return badRequest('not a user id');
    const profile = await store.get(userId);
    if (!profile) return Response.json({ error: 'no such profile' }, { status: 404 });
    return Response.json(profile);
  });

  const putProfile = createEndpoint('/profiles/:userId', { method: 'PUT' }, async (ctx) => {
    const userId = userIdFrom(ctx.params.userId);
    if (!userId) return badRequest('not a user id');
    const update = parseProfileUpdate(ctx.body as unknown);
    if (!update.ok) return badRequest(update.reason);
    try {
      return Response.json(await store.merge(userId, update.value, now()));
    } catch (error) {
      if (!(error instanceof ProfileLimitError)) throw error;
      return Response.json({ error: 'profile limit reached' }, { status: 507 });
    }
  });

  return { getProfile, putProfile };
}
