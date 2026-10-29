/**
 * Who this browser is online: a random user id and a display name, each
 * under its own key in the injected `StorageLike` (the browser passes
 * `localStorage`, tests a fake). There is no login: knowing an id is
 * being that user, so the id can be copied to another device (or pasted
 * from one) to take the progress along. Storage can be missing or throw, so
 * every access is guarded; without storage the id lasts for the session.
 */

import { NET_MAX_NAME_LENGTH } from '../sim/balance';
import { DEFAULT_DISPLAY_NAME_PREFIX, PROFILE_TEXT } from '../sim/content';
import type { StorageLike } from './save';

export const USER_ID_KEY = 'isv-simulator.userId';
export const DISPLAY_NAME_KEY = 'isv-simulator.displayName';

export interface Identity {
  /** A UUID v4 in lower case. */
  userId: string;
  displayName: string;
}

export type IdentityChange = { ok: true; identity: Identity } | { ok: false; reason: string };

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** A typed or pasted id as a user id (trimmed, lower case), or `null` when it isn't a UUID v4. */
export function normalizeUserId(text: string): string | null {
  const id = text.trim().toLowerCase();
  return UUID_V4.test(id) ? id : null;
}

/** A typed name, trimmed with inner spaces collapsed, or `null` when empty or too long. */
export function normalizeDisplayName(text: string): string | null {
  const name = text.trim().replace(/\s+/g, ' ');
  return name.length > 0 && name.length <= NET_MAX_NAME_LENGTH ? name : null;
}

/**
 * A UUID v4 from 16 random bytes, for browsers without `crypto.randomUUID`
 * (it needs a secure context, so plain http on a LAN has only `getRandomValues`).
 */
export function uuidFromBytes(bytes: Uint8Array): string {
  if (bytes.length < 16) throw new Error('a UUID needs 16 random bytes');
  const b = Array.from(bytes.slice(0, 16));
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const hex = b.map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** "Dev 1234", the digits taken from the id so the same id always gets the same name. */
export function defaultDisplayName(userId: string): string {
  const hex = userId.replace(/[^0-9a-f]/gi, '').slice(0, 8);
  const number = (Number.parseInt(hex || '0', 16) || 0) % 10000;
  return `${DEFAULT_DISPLAY_NAME_PREFIX} ${String(number).padStart(4, '0')}`;
}

function read(storage: StorageLike | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(storage: StorageLike | null, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // Full or blocked: the identity lives on in memory for this session.
  }
}

/**
 * The stored identity, or a new one. A missing or broken id is replaced by
 * `newId()` (the browser passes `crypto.randomUUID`) and stored; a missing or
 * broken name falls back to the default for the id (and isn't stored, so it
 * follows the id until someone picks a name).
 */
export function loadIdentity(storage: StorageLike | null, newId: () => string): Identity {
  let userId = normalizeUserId(read(storage, USER_ID_KEY) ?? '');
  if (!userId) {
    userId = normalizeUserId(newId()) ?? fallbackId(newId);
    write(storage, USER_ID_KEY, userId);
  }
  const displayName =
    normalizeDisplayName(read(storage, DISPLAY_NAME_KEY) ?? '') ?? defaultDisplayName(userId);
  return { userId, displayName };
}

/** A generator that doesn't give UUID v4s is a bug; fail loudly rather than store junk. */
function fallbackId(newId: () => string): never {
  throw new Error(`newId() must return a UUID v4, got ${JSON.stringify(newId())}`);
}

/**
 * Switches to a pasted id, e.g. one copied from another device. Refused when
 * it isn't a UUID v4. The display name stays as it is: a name someone picked
 * stays theirs, and a default name moves on to the new id's default.
 */
export function replaceUserId(
  storage: StorageLike | null,
  identity: Identity,
  text: string,
): IdentityChange {
  const userId = normalizeUserId(text);
  if (!userId)
    return { ok: false, reason: 'That is not a user ID (it looks like 8-4-4-4-12 hex digits).' };
  const named = read(storage, DISPLAY_NAME_KEY) !== null;
  const displayName =
    named || identity.displayName !== defaultDisplayName(identity.userId)
      ? identity.displayName
      : defaultDisplayName(userId);
  write(storage, USER_ID_KEY, userId);
  return { ok: true, identity: { userId, displayName } };
}

/** Picks a display name; refused when empty or longer than `NET_MAX_NAME_LENGTH`. */
export function setDisplayName(
  storage: StorageLike | null,
  identity: Identity,
  text: string,
): IdentityChange {
  const displayName = normalizeDisplayName(text);
  if (!displayName) {
    return { ok: false, reason: PROFILE_TEXT.badName };
  }
  write(storage, DISPLAY_NAME_KEY, displayName);
  return { ok: true, identity: { ...identity, displayName } };
}
