/**
 * Checks on every HTTP request before Colyseus and our routes see it:
 *
 * - **Body size.** A body over `maxBodyBytes` (by its `Content-Length`) gets
 *   a 413 straight away and is discarded unread, never buffered or parsed
 *   (a huge one cuts the connection); a body without a length (chunked)
 *   gets a 411.
 * - **Rate limits per client IP** (token buckets, `rateLimit.ts`): creating
 *   rooms (`POST /matchmake/create|joinOrCreate`), writing profiles
 *   (`PUT /profiles/:userId`) and failed joins (`POST /matchmake/join|joinById`
 *   and `GET /rooms/:code` that fail; against guessing join codes). Past a
 *   limit: 429 with `Retry-After`.
 * - **Path shape.** The router matches on the WHATWG-normalized pathname
 *   (`.`/`..` and `%2e` segments resolved, `\` turned into `/`, ...), so a
 *   path that normalizes to something else gets a 400:
 *   otherwise `/./matchmake/create/game` would dodge the limits below.
 * - **CORS origins** (`corsOrigin`, installed on Colyseus' matchmaker
 *   controller): only `allowedOrigins` get their origin back, or any origin
 *   when that's `null`.
 *
 * The client IP is the socket's peer address, or with `trustProxyHops` set
 * (behind a reverse proxy) the address that many hops from the right of
 * `X-Forwarded-For`: the one our own proxy added, which a client can't fake.
 */

import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { matchMaker } from 'colyseus';
import {
  NET_FAILED_JOIN_BURST,
  NET_FAILED_JOIN_REFILL_MS,
  NET_MAX_BODY_BYTES,
  NET_MAX_DRAIN_BYTES,
  NET_PROFILE_WRITE_BURST,
  NET_PROFILE_WRITE_REFILL_MS,
  NET_ROOM_CREATE_BURST,
  NET_ROOM_CREATE_REFILL_MS,
} from '../src/sim/balance';
import { type RateLimit, RateLimiter } from './rateLimit';

export interface HttpLimits {
  roomCreate: RateLimit;
  failedJoin: RateLimit;
  profileWrite: RateLimit;
  maxBodyBytes: number;
}

export const DEFAULT_HTTP_LIMITS: HttpLimits = {
  roomCreate: { burst: NET_ROOM_CREATE_BURST, refillMs: NET_ROOM_CREATE_REFILL_MS },
  failedJoin: { burst: NET_FAILED_JOIN_BURST, refillMs: NET_FAILED_JOIN_REFILL_MS },
  profileWrite: { burst: NET_PROFILE_WRITE_BURST, refillMs: NET_PROFILE_WRITE_REFILL_MS },
  maxBodyBytes: NET_MAX_BODY_BYTES,
};

export interface HttpGuardSettings {
  limits: HttpLimits;
  /** Reverse proxies in front of the server whose `X-Forwarded-For` we trust; 0 trusts none. */
  trustProxyHops: number;
  /** Milliseconds, for the rate limits. */
  now: () => number;
}

/** `ALLOWED_ORIGINS`: comma-separated origins, or `null` (any origin) when unset, empty or `*`. */
export function parseAllowedOrigins(raw: string | undefined): string[] | null {
  const origins = (raw ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter((o) => o !== '');
  if (origins.length === 0 || origins.includes('*')) return null;
  return origins;
}

/** `TRUST_PROXY`: unset, `0` or `false` trusts no proxy; `true` is one; a number is that many. */
export function parseTrustProxy(raw: string | undefined): number {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === 'true') return 1;
  const hops = Number(value);
  return Number.isInteger(hops) && hops > 0 ? hops : 0;
}

/** The `Access-Control-Allow-Origin` for a request from `origin`. */
export function corsOrigin(origin: string | null, allowed: readonly string[] | null): string {
  if (allowed === null) return origin || '*';
  if (origin !== null && allowed.includes(origin)) return origin;
  // Not an allowed origin: name one that is, so the browser refuses the response.
  return allowed[0] ?? 'null';
}

/** Answers CORS with `allowed` for every Colyseus route (matchmaking and ours). Process-wide. */
export function installCors(allowed: readonly string[] | null): void {
  matchMaker.controller.getCorsHeaders = (headers: Headers) => ({
    'Access-Control-Allow-Origin': corsOrigin(headers.get('origin'), allowed),
    Vary: 'Origin',
  });
}

/** The client's address: the peer, or the `hops`-th from the right of `X-Forwarded-For`. */
export function clientIp(
  remoteAddress: string | undefined,
  forwardedFor: string | string[] | undefined,
  hops: number,
): string {
  const peer = remoteAddress ?? 'unknown';
  if (hops <= 0 || forwardedFor === undefined) return peer;
  const list = (Array.isArray(forwardedFor) ? forwardedFor.join(',') : forwardedFor)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  if (list.length === 0) return peer;
  return list[Math.max(0, list.length - hops)] ?? peer;
}

export type RequestKind = 'createRoom' | 'joinRoom' | 'lookupRoom' | 'profileWrite' | 'other';

/**
 * The pathname the router will match `url` against, or `null` when that is not
 * exactly the raw path: dot segments (also escaped, `%2e`), backslashes,
 * characters it would escape, fragments, absolute or empty forms. The router
 * decodes no other escapes (`%2f` stays three characters), so those are fine. Refusing those means the guard and the
 * router always agree on which route a request is for.
 */
export function normalizedPath(url: string): string | null {
  const raw = url.split('?')[0] ?? '';
  if (!raw.startsWith('/')) return null;
  let pathname: string;
  try {
    pathname = new URL(url, 'http://localhost').pathname;
  } catch {
    return null;
  }
  return pathname === raw ? pathname : null;
}

/** Which limit a request falls under, by the path as the router sees it (case-blind, to be safe). */
export function classifyRequest(method: string, url: string): RequestKind {
  let path: string;
  try {
    path = new URL(url, 'http://localhost').pathname.toLowerCase();
  } catch {
    return 'other';
  }
  if (method === 'POST') {
    const match = /^\/matchmake\/([^/]+)\//.exec(path);
    if (match?.[1] === 'create' || match?.[1] === 'joinorcreate') return 'createRoom';
    if (match?.[1] === 'join' || match?.[1] === 'joinbyid') return 'joinRoom';
  }
  if (method === 'GET' && path.startsWith('/rooms/')) return 'lookupRoom';
  if (method === 'PUT' && path.startsWith('/profiles/')) return 'profileWrite';
  return 'other';
}

function refuse(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  error: string,
  headers: Record<string, string> = {},
): void {
  const cors = {
    ...matchMaker.controller.DEFAULT_CORS_HEADERS,
    ...matchMaker.controller.getCorsHeaders(
      new Headers(req.headers.origin ? { origin: req.headers.origin } : {}),
    ),
  };
  const body = JSON.stringify({ error });
  res.writeHead(status, {
    ...cors,
    ...headers,
    'content-type': 'application/json',
    'content-length': String(Buffer.byteLength(body)),
  });
  res.end(body);
  // Let any body flow past unread (not buffered or parsed), so the client
  // sees the answer instead of a reset connection.
  req.resume();
}

/**
 * Checks a request; answers it and returns `false` when it is refused.
 * Returned by `createHttpGuard` so it can be tested without a server.
 */
export type HttpGuard = (req: IncomingMessage, res: ServerResponse) => boolean;

export function createHttpGuard(settings: HttpGuardSettings): HttpGuard {
  const { limits, trustProxyHops, now } = settings;
  const roomCreate = new RateLimiter(limits.roomCreate);
  const failedJoin = new RateLimiter(limits.failedJoin);
  const profileWrite = new RateLimiter(limits.profileWrite);
  const retryAfter = (limit: RateLimit) => ({
    'retry-after': String(Math.ceil(limit.refillMs / 1000)),
  });

  return (req, res) => {
    const method = req.method ?? 'GET';
    const url = req.url ?? '/';
    if (normalizedPath(url) === null) {
      refuse(req, res, 400, 'malformed request path');
      return false;
    }
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      const length = req.headers['content-length'];
      if (length === undefined && req.headers['transfer-encoding'] !== undefined) {
        refuse(req, res, 411, 'length required');
        return false;
      }
      if (Number(length) > limits.maxBodyBytes) {
        refuse(req, res, 413, 'request body too large');
        // Not worth sitting through a huge upload just to keep the connection.
        if (Number(length) > NET_MAX_DRAIN_BYTES) {
          res.once('finish', () => req.destroy());
        }
        return false;
      }
    }
    const kind = classifyRequest(method, url);
    if (kind === 'other') return true;
    const ip = clientIp(req.socket.remoteAddress, req.headers['x-forwarded-for'], trustProxyHops);
    const t = now();
    switch (kind) {
      case 'createRoom':
        if (roomCreate.tryTake(ip, t)) return true;
        refuse(req, res, 429, 'too many rooms created', retryAfter(limits.roomCreate));
        return false;
      case 'profileWrite':
        if (profileWrite.tryTake(ip, t)) return true;
        refuse(req, res, 429, 'too many profile writes', retryAfter(limits.profileWrite));
        return false;
      case 'joinRoom':
      case 'lookupRoom':
        if (!failedJoin.allows(ip, t)) {
          refuse(req, res, 429, 'too many failed joins', retryAfter(limits.failedJoin));
          return false;
        }
        res.once('finish', () => {
          if (res.statusCode >= 400) failedJoin.take(ip, now());
        });
        return true;
    }
  };
}

/** Puts `guard` in front of every `request` listener `server` has now. */
export function installHttpGuard(server: Server, guard: HttpGuard): void {
  const listeners = server.listeners('request') as ((
    req: IncomingMessage,
    res: ServerResponse,
  ) => void)[];
  server.removeAllListeners('request');
  server.on('request', (req: IncomingMessage, res: ServerResponse) => {
    if (!guard(req, res)) return;
    for (const listener of listeners) listener.call(server, req, res);
  });
}
