/**
 * The server's place in the shard pool, from its env vars: `SHARD_INDEX`
 * and `SHARD_COUNT` (`parseShard`), every shard's public URL `SHARD_URLS`
 * (`parseShardUrls`) and its room limit `SHARD_MAX_ROOMS`
 * (`parseMaxRooms`). Bad values throw, so the server refuses to start.
 * The pool itself is `pool.ts`.
 */

import { NET_SHARD_MAX_ROOMS } from '../sim/balance';
import { MAX_SHARDS, type Shard } from './joinCode';

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

/**
 * `SHARD_URLS`: every shard's public URL, comma-separated in shard order
 * (trailing slashes dropped), exactly `count` of them, each http(s). May be
 * left out with one shard (local dev): then `['']`, this server's URL
 * unknown. Throws otherwise.
 */
export function parseShardUrls(text: string | undefined, count: number): string[] {
  const urls = (text ?? '')
    .split(',')
    .map((url) => url.trim().replace(/\/+$/, ''))
    .filter((url) => url !== '');
  if (urls.length === 0) {
    if (count === 1) return [''];
    throw new Error(`SHARD_URLS must list the ${count} shards' URLs (SHARD_COUNT is ${count})`);
  }
  if (urls.length !== count) {
    throw new Error(`SHARD_URLS has ${urls.length} URLs, SHARD_COUNT is ${count}`);
  }
  for (const url of urls) {
    if (!/^https?:\/\/[^/\s]+/i.test(url)) {
      throw new Error(`SHARD_URLS: "${url}" is not an http(s) URL`);
    }
  }
  return urls;
}

/** `SHARD_MAX_ROOMS`: a whole number from 1, `NET_SHARD_MAX_ROOMS` when unset. Throws otherwise. */
export function parseMaxRooms(text: string | undefined): number {
  const trimmed = text?.trim() ?? '';
  if (trimmed === '') return NET_SHARD_MAX_ROOMS;
  if (!/^\d+$/.test(trimmed) || Number(trimmed) < 1) {
    throw new Error(`SHARD_MAX_ROOMS must be a whole number from 1, got "${text}"`);
  }
  return Number(trimmed);
}
