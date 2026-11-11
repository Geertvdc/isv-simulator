/**
 * The ops dashboard: a page on shard 0 that shows the shard pool (every
 * shard, awake or asleep, with its rooms, players, CPU, memory, ...) and its
 * history. Open (no login) and read-only, for demos: served by shard 0 only
 * (other shards answer 404 for `/admin` paths, from Colyseus).
 *
 * - `GET /admin`: the page (`admin/page.html`, with `admin/app.js` and
 *   `admin/app.css` at `/admin/app.js` and `/admin/app.css`).
 * - `GET /admin/api/state`: the pool now (`AdminState`).
 * - `GET /admin/api/history?range=1h|24h|7d`: chart points and events
 *   (`HistoryRecorder.history`).
 *
 * Because anyone can read it, it never shows a full join code (anyone could
 * join that room): rooms are listed as `AB••` (`maskJoinCode`), and no user
 * ids, names or IPs are sent. Reads come from the pool cache
 * (`NET_POOL_CACHE_MS`) and the history cache (`NET_HISTORY_CACHE_MS`), so
 * many viewers refreshing don't add table reads. Every answer has
 * `Cache-Control: no-store`, no CORS headers (same origin only) and a strict
 * CSP (no inline script or style, nothing from elsewhere). GET only.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Shard } from '../src/net/joinCode';
import {
  type PoolEntry,
  type ShardOps,
  entriesByIndex,
  isAwake,
  pickHostShard,
  poolHeadroom,
} from '../src/net/pool';
import {
  NET_ADMIN_REFRESH_MS,
  NET_HISTORY_RETENTION_DAYS,
  NET_POOL_HEADROOM_ROOMS,
  NET_SHARD_AWAKE_MS,
  NET_SHARD_HEARTBEAT_MS,
  NET_SHARD_MAX_ROOMS,
} from '../src/sim/balance';
import appCss from './admin/app.css?raw';
import appJs from './admin/app.js?raw';
import pageHtml from './admin/page.html?raw';
import type { HistoryRecorder } from './historyRecorder';
import { parseRange } from './poolHistory';

/** A join code as the public dashboard shows it: the first two letters, then `••`. */
export function maskJoinCode(code: string): string {
  return `${code.slice(0, 2)}••`;
}

/** One shard as the dashboard shows it. */
export interface AdminShard {
  index: number;
  url: string;
  awake: boolean;
  /** It wrote a heartbeat at some point (an entry exists). */
  known: boolean;
  /** This server: its numbers are live. */
  self: boolean;
  /** Seconds since its last heartbeat; `null` without one (or after a clean shutdown). */
  lastSeenS: number | null;
  rooms: number;
  players: number;
  maxRooms: number;
  /** `null` for a shard that never reported them. */
  ops: ShardOps | null;
}

/** `GET /admin/api/state`. */
export interface AdminState {
  now: string;
  /** This server's shard index. */
  self: number;
  poolSize: number;
  /** Shard 0's public URL (`''` when unknown). */
  frontDoor: string;
  refreshMs: number;
  freshness: string;
  totals: {
    awake: number;
    poolSize: number;
    rooms: number;
    /** Room slots on the awake shards. */
    capacity: number;
    /** Room slots with every shard awake. */
    poolCapacity: number;
    players: number;
    connections: number;
  };
  headroom: { free: number; target: number };
  /** Where the next room goes (`pickHostShard`); -1: everything full. */
  nextHost: number;
  /** Spares the pool manager is waking now. */
  waking: number[];
  /** Versions on the awake shards. */
  versions: { version: string; shards: number[] }[];
  historyRetentionDays: number;
  shards: AdminShard[];
}

export interface AdminStateInput {
  entries: readonly PoolEntry[];
  now: number;
  shard: Shard;
  urls: readonly string[];
  waking: readonly number[];
  headroom?: number;
}

/** The dashboard's view of the pool from its entries. Pure. */
export function adminState(input: AdminStateInput): AdminState {
  const { entries, now, shard, urls, waking, headroom = NET_POOL_HEADROOM_ROOMS } = input;
  const byIndex = entriesByIndex(entries, shard.count);
  const shards = byIndex.map((e, index): AdminShard => {
    const awake = isAwake(e, now);
    return {
      index,
      url: urls[index] ?? '',
      awake,
      known: e !== undefined,
      self: index === shard.index,
      lastSeenS: e && e.updatedAt > 0 ? Math.max(0, Math.round((now - e.updatedAt) / 1000)) : null,
      rooms: awake ? (e?.rooms ?? 0) : 0,
      players: awake ? (e?.players ?? 0) : 0,
      maxRooms: e?.maxRooms ?? NET_SHARD_MAX_ROOMS,
      // Masked again here, in case a shard on an older build sent full codes.
      ops: e?.ops
        ? { ...e.ops, roomList: e.ops.roomList.map((r) => ({ ...r, code: maskJoinCode(r.code) })) }
        : null,
    };
  });
  const awake = shards.filter((s) => s.awake);
  const sum = (f: (s: AdminShard) => number) => awake.reduce((n, s) => n + f(s), 0);
  const versions = new Map<string, number[]>();
  for (const s of awake) {
    const v = s.ops?.version ?? 'unknown';
    versions.set(v, [...(versions.get(v) ?? []), s.index]);
  }
  return {
    now: new Date(now).toISOString(),
    self: shard.index,
    poolSize: shard.count,
    frontDoor: urls[0] ?? '',
    refreshMs: NET_ADMIN_REFRESH_MS,
    freshness:
      `Shard ${shard.index}'s numbers are live; the others' come from their last heartbeat ` +
      `(written on every room or player change and at least every ${NET_SHARD_HEARTBEAT_MS / 1000} s, ` +
      `so up to ${NET_SHARD_HEARTBEAT_MS / 1000} s old). A shard without a heartbeat for ` +
      `${NET_SHARD_AWAKE_MS / 1000} s counts as asleep.`,
    totals: {
      awake: awake.length,
      poolSize: shard.count,
      rooms: sum((s) => s.rooms),
      capacity: sum((s) => s.maxRooms),
      poolCapacity: shards.reduce((n, s) => n + s.maxRooms, 0),
      players: sum((s) => s.players),
      connections: sum((s) => s.ops?.connections ?? 0),
    },
    headroom: { free: poolHeadroom(entries, now), target: headroom },
    nextHost: pickHostShard(entries, now, shard.count),
    waking: [...waking],
    versions: [...versions].map(([version, list]) => ({ version, shards: list })),
    historyRetentionDays: NET_HISTORY_RETENTION_DAYS,
    shards,
  };
}

export interface AdminOptions {
  shard: Shard;
  urls: readonly string[];
  /** The pool as this shard reads it, and the spares it's waking (`ShardPool`). */
  pool: { entries(): Promise<PoolEntry[]>; readonly waking: readonly number[] };
  history: HistoryRecorder;
  headroom?: number;
  now?: () => number;
}

/** The `Content-Security-Policy` of every admin answer: our own script and style, nothing else. */
export const ADMIN_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const SECURITY_HEADERS = {
  'cache-control': 'no-store',
  'content-security-policy': ADMIN_CSP,
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
};

/** Whether a request path is one of the dashboard's (case-blind, like the guard). */
export function isAdminPath(pathname: string): boolean {
  const p = pathname.toLowerCase();
  return p === '/admin' || p.startsWith('/admin/');
}

function send(res: ServerResponse, status: number, type: string, body: string, extra = {}): void {
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    ...extra,
    'content-type': type,
    'content-length': String(Buffer.byteLength(body)),
  });
  res.end(body);
}

const json = (res: ServerResponse, status: number, value: unknown): void => {
  send(res, status, 'application/json; charset=utf-8', JSON.stringify(value));
};

/**
 * The dashboard's request handler, put in front of Colyseus with
 * `installHttpGuard`: answers `/admin` paths and returns `false`; returns
 * `true` (not mine) for every other path.
 */
export function createAdminHandler(
  options: AdminOptions,
): (req: IncomingMessage, res: ServerResponse) => boolean {
  const now = options.now ?? (() => Date.now());
  return (req, res) => {
    let url: URL;
    try {
      url = new URL(req.url ?? '/', 'http://localhost');
    } catch {
      return true;
    }
    if (!isAdminPath(url.pathname)) return true;
    // Anything sent along is ignored.
    req.resume();
    if (req.method !== 'GET') {
      send(res, 405, 'text/plain; charset=utf-8', 'method not allowed', { allow: 'GET' });
      return false;
    }
    const path = url.pathname.toLowerCase().replace(/\/+$/, '');
    switch (path) {
      case '/admin':
        send(res, 200, 'text/html; charset=utf-8', pageHtml);
        return false;
      case '/admin/app.js':
        send(res, 200, 'text/javascript; charset=utf-8', appJs);
        return false;
      case '/admin/app.css':
        send(res, 200, 'text/css; charset=utf-8', appCss);
        return false;
      case '/admin/api/state':
        options.pool.entries().then(
          (entries) => {
            json(
              res,
              200,
              adminState({
                entries,
                now: now(),
                shard: options.shard,
                urls: options.urls,
                waking: options.pool.waking,
                headroom: options.headroom,
              }),
            );
          },
          (error: unknown) => {
            console.error('Admin: could not read the shard pool:', error);
            json(res, 503, { error: 'pool unavailable' });
          },
        );
        return false;
      case '/admin/api/history': {
        const range = parseRange(url.searchParams.get('range') ?? '1h');
        if (!range) {
          json(res, 400, { error: 'range must be 1h, 24h or 7d' });
          return false;
        }
        options.history.history(range).then(
          (answer) => {
            json(res, 200, answer);
          },
          (error: unknown) => {
            console.error('Admin: could not read the history:', error);
            json(res, 503, { error: 'history unavailable' });
          },
        );
        return false;
      }
      default:
        json(res, 404, { error: 'not found' });
        return false;
    }
  };
}
