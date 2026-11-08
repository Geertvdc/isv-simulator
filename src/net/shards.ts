/**
 * Several game servers (shards), each with its own URL and its own rooms.
 * The client knows them all (`VITE_SERVER_URLS`, URL i is shard i): it hosts
 * on any of them, joins a code at the shard its first letter names
 * (`shardOfJoinCode`), and talks to the first for profiles (the profile
 * store is shared). One server is one shard. The server reads its own place
 * from `SHARD_INDEX` and `SHARD_COUNT` (`parseShard`).
 */

import { MAX_SHARDS, type Shard, shardOfJoinCode } from './joinCode';
import { serverUrl } from './profileApi';

/**
 * The shards' URLs in shard order: `VITE_SERVER_URLS` (comma-separated,
 * trailing slashes dropped) when it has any, else the one `serverUrl` gives
 * (`VITE_SERVER_URL`, or this page's host on port 2567).
 */
export function serverUrls(
  envUrls: string | undefined,
  envUrl: string | undefined,
  location: { protocol: string; hostname: string },
): string[] {
  const urls = (envUrls ?? '')
    .split(',')
    .map((url) => url.trim().replace(/\/+$/, ''))
    .filter((url) => url !== '');
  return urls.length > 0 ? urls : [serverUrl(envUrl, location)];
}

/** The URL of the shard holding the room with this (normalized) code. */
export function shardUrl(urls: readonly string[], code: string): string {
  return urls[shardOfJoinCode(code, urls.length)] ?? urls[0] ?? '';
}

/**
 * The shards to try for hosting a room, in order: all of them, starting at
 * a random one (`randomInt(n)` is 0 to n - 1), so rooms spread over the
 * shards and a shard that's down is skipped.
 */
export function hostOrder(urls: readonly string[], randomInt: (n: number) => number): string[] {
  if (urls.length <= 1) return [...urls];
  const start = randomInt(urls.length);
  return urls.map((_, i) => urls[(start + i) % urls.length] ?? '');
}

/**
 * The server's shard from `SHARD_INDEX` (default 0) and `SHARD_COUNT`
 * (default 1): whole numbers with 1 <= count <= 24 and 0 <= index < count.
 * Throws with a message saying what's wrong otherwise.
 */
export function parseShard(indexText: string | undefined, countText: string | undefined): Shard {
  const whole = (name: string, text: string | undefined, fallback: number): number => {
    const trimmed = text?.trim() ?? '';
    if (trimmed === '') return fallback;
    if (!/^\d+$/.test(trimmed)) throw new Error(`${name} must be a whole number, got "${text}"`);
    return Number(trimmed);
  };
  const index = whole('SHARD_INDEX', indexText, 0);
  const count = whole('SHARD_COUNT', countText, 1);
  if (count < 1 || count > MAX_SHARDS) {
    throw new Error(`SHARD_COUNT must be from 1 to ${MAX_SHARDS}, got ${count}`);
  }
  if (index >= count) {
    throw new Error(`SHARD_INDEX must be below SHARD_COUNT (${count}), got ${index}`);
  }
  return { index, count };
}
