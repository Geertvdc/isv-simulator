/**
 * The rejoin ticket: what a browser tab keeps (in `sessionStorage`) to get
 * back into its room after a page reload. The room's code, the Colyseus
 * reconnection token (it changes after every reconnect) and when it was
 * saved: past the server's grace period the room has let go of the seat, so
 * an older ticket isn't worth trying.
 */

import { NET_RECONNECT_GRACE_MS } from '../sim/balance';
import { normalizeJoinCode } from './joinCode';

/** The `sessionStorage` key. */
export const REJOIN_KEY = 'isv-simulator.rejoin';

/** How this browser got into the room (`OnlineRole` in `src/flow/online.ts`). */
export type RejoinRole = 'host' | 'join';

export interface RejoinTicket {
  joinCode: string;
  /** `room.reconnectionToken`: `<roomId>:<token>`. */
  token: string;
  role: RejoinRole;
  /** When it was saved (`Date.now()`), refreshed when the page goes away. */
  savedAtMs: number;
}

export function encodeTicket(ticket: RejoinTicket): string {
  return JSON.stringify(ticket);
}

/** Tokens are `<roomId>:<token>`, both parts from Colyseus's id alphabet. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,64}:[A-Za-z0-9_-]{1,64}$/;

/**
 * The stored ticket, if it's well-formed and young enough to try: saved no
 * longer than the grace period ago (and not in the future, a clock that
 * jumped back). `null` otherwise.
 */
export function parseTicket(text: string | null, nowMs: number): RejoinTicket | null {
  if (!text) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const joinCode = typeof r.joinCode === 'string' ? normalizeJoinCode(r.joinCode) : null;
  if (!joinCode || r.joinCode !== joinCode) return null;
  if (typeof r.token !== 'string' || !TOKEN_PATTERN.test(r.token)) return null;
  if (!r.token.startsWith(`${joinCode}:`)) return null;
  if (r.role !== 'host' && r.role !== 'join') return null;
  const savedAtMs = r.savedAtMs;
  if (typeof savedAtMs !== 'number' || !Number.isFinite(savedAtMs)) return null;
  const age = nowMs - savedAtMs;
  if (age < 0 || age > NET_RECONNECT_GRACE_MS) return null;
  return { joinCode, token: r.token, role: r.role, savedAtMs };
}
