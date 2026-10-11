/**
 * The only networking code in the browser: a thin wrapper around
 * `@colyseus/sdk`. It creates or joins a room with our `hello`, sends and
 * receives the plain messages from `protocol.ts` (a Colyseus message whose
 * type is the protocol message's `type` and whose payload is the whole
 * message, both ways), and reports the connection's status. Everything the
 * game does with those messages lives in pure code (`src/flow/online.ts`).
 *
 * Reconnecting: when the socket drops, the SDK reconnects on its own for as
 * long as the server keeps the seat (`NET_RECONNECT_GRACE_MS`). A socket that
 * goes quiet without closing (a laptop that slept, a wifi that hangs) is
 * closed after `NET_SILENCE_TIMEOUT_MS`, which starts the same reconnect. A
 * reloaded page gets back in with `rejoinRoom` and the stored token.
 */

import { Client, type Room } from '@colyseus/sdk';
import type { OnlineError } from '../flow/flow';
import type { Identity } from '../flow/identity';
import { onlineErrorFromCode } from '../flow/online';
import { NET_RECONNECT_GRACE_MS, NET_SILENCE_TIMEOUT_MS } from '../sim/balance';
import { type LagSettings, createLagRunner } from './lag';
import {
  type ClientMessage,
  GAME_ROOM,
  type HelloMessage,
  PROTOCOL_VERSION,
  type ServerMessage,
} from './protocol';

/** Colyseus's code for "no room with this id". */
const INVALID_ROOM_ID = 522;
/** Colyseus close codes: the server shutting down, and "drop me, I'll reconnect". */
const SERVER_SHUTDOWN = 4001;
const MAY_TRY_RECONNECT = 4010;

/** The SDK's reconnect backoff never waits longer than this between tries. */
const RECONNECT_MAX_DELAY_MS = 2000;

/**
 * Reconnect tries that cover the grace period: the SDK waits 200, 400, 800,
 * 1600 ms, then `RECONNECT_MAX_DELAY_MS` between tries; one more try after
 * the grace ran out makes sure the end is seen.
 */
export function reconnectRetries(graceMs: number): number {
  let waited = 0;
  let tries = 0;
  while (waited <= graceMs) {
    tries++;
    waited += Math.min(RECONNECT_MAX_DELAY_MS, Math.max(100, 2 ** tries * 100));
  }
  return tries;
}

export type ConnectionStatus = 'connected' | 'reconnecting' | 'closed';

/** Why creating or joining a room didn't work, as the join screen explains it. */
export class JoinError extends Error {
  constructor(
    readonly code: OnlineError,
    message: string,
  ) {
    super(message);
    this.name = 'JoinError';
  }
}

export interface NetConnection {
  readonly sessionId: string;
  /** The room's join code (its Colyseus room id). */
  readonly joinCode: string;
  send(message: ClientMessage): void;
  /**
   * Calls `listener` with every message from the server. Messages that came
   * before the first listener are kept and handed to it right away.
   */
  onMessage(listener: (message: ServerMessage) => void): () => void;
  /**
   * The connection dropped (`reconnecting`, the library retries on its own),
   * came back (`connected`) or is over (`closed`, with `disconnected` as the
   * error unless we left on purpose).
   */
  onStatus(listener: (status: ConnectionStatus, error: OnlineError | null) => void): () => void;
  /** Leaves the room; resolves once the server knows. Never rejects. */
  leave(): Promise<void>;
  /** What gets this session back in after a reload (`<roomId>:<token>`; changes after each reconnect). */
  reconnectionToken(): string;
}

/** The game server's address as a WebSocket URL: `http` → `ws`, `https` → `wss`. */
export function socketUrl(httpUrl: string): string {
  return httpUrl.replace(/^http(s?):\/\//i, (_, s: string) => `ws${s.toLowerCase()}://`);
}

/** The hello for this browser: its user id and name, with one couch player to start. */
export function helloFor(identity: Identity, localPlayers = 1): HelloMessage {
  return {
    type: 'hello',
    protocol: PROTOCOL_VERSION,
    userId: identity.userId,
    displayName: identity.displayName,
    localPlayers,
  };
}

/** Gets a reloaded page back into its room with the token it kept. */
export async function rejoinRoom(
  serverUrl: string,
  token: string,
  options: ConnectOptions = {},
): Promise<NetConnection> {
  try {
    return wrap(await new Client(socketUrl(serverUrl)).reconnect(token), options);
  } catch (error) {
    const joinError = toJoinError(error);
    // No server is "unreachable"; anything else means the seat is gone.
    throw joinError.code === 'unreachable' && /expired|invalid|disposed/i.test(joinError.message)
      ? new JoinError('reconnectFailed', joinError.message)
      : joinError.code === 'wrongCode'
        ? new JoinError('reconnectFailed', joinError.message)
        : joinError;
  }
}

/** A refused or failed join as a `JoinError`. */
export function toJoinError(error: unknown): JoinError {
  if (error instanceof JoinError) return error;
  const e = error as { code?: unknown; message?: unknown } | null;
  const message = typeof e?.message === 'string' ? e.message : String(error);
  if (e?.code === INVALID_ROOM_ID) return new JoinError('wrongCode', message);
  // A Colyseus room refuses a client past `maxClients` as "locked".
  if (/locked|full/i.test(message) && message !== 'roomFull') {
    return new JoinError('roomFull', message);
  }
  return new JoinError(onlineErrorFromCode(message), message);
}

export interface ConnectOptions {
  /**
   * Dev only (`?lag=&jitter=`): delays every message sent and received by
   * this much, keeping their order. Joining itself isn't delayed.
   */
  lag?: LagSettings | null;
}

/** Creates a room on the server at `serverUrl` (http or ws) and joins it as its host. */
export async function hostRoom(
  serverUrl: string,
  hello: HelloMessage,
  options: ConnectOptions = {},
): Promise<NetConnection> {
  try {
    return wrap(await new Client(socketUrl(serverUrl)).create(GAME_ROOM, hello), options);
  } catch (error) {
    throw toJoinError(error);
  }
}

/** Joins the room with this (normalized) join code. */
export async function joinRoomByCode(
  serverUrl: string,
  code: string,
  hello: HelloMessage,
  options: ConnectOptions = {},
): Promise<NetConnection> {
  try {
    return wrap(await new Client(socketUrl(serverUrl)).joinById(code, hello), options);
  } catch (error) {
    throw toJoinError(error);
  }
}

/** Runs functions right away, or after the simulated lag (in order) when there is one. */
function lagRunner(options: ConnectOptions): (fn: () => void) => void {
  if (!options.lag)
    return (fn) => {
      fn();
    };
  return createLagRunner(options.lag, Math.floor(Math.random() * 2 ** 31), {
    now: () => performance.now(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
  });
}

function wrap(room: Room, options: ConnectOptions): NetConnection {
  const lagIn = lagRunner(options);
  const lagOut = lagRunner(options);
  const messageListeners = new Set<(message: ServerMessage) => void>();
  const statusListeners = new Set<(status: ConnectionStatus, error: OnlineError | null) => void>();
  const early: ServerMessage[] = [];
  let leaving = false;
  let closed = false;
  let reconnecting = false;
  /** Why the server said it closes the room, or another protocol after a reconnect. */
  let closeReason: OnlineError | null = null;
  let lastHeardMs = performance.now();

  // Reconnect right away (the SDK waits 5 s after joining by default) and for
  // the whole grace period; nothing is queued while away: old inputs and
  // pings are worthless by the time we're back.
  room.reconnection.minUptime = 0;
  room.reconnection.maxDelay = RECONNECT_MAX_DELAY_MS;
  room.reconnection.maxRetries = reconnectRetries(NET_RECONNECT_GRACE_MS);
  room.reconnection.maxEnqueuedMessages = 0;

  const status = (next: ConnectionStatus, error: OnlineError | null): void => {
    for (const listener of statusListeners) listener(next, error);
  };
  room.onMessage('*', (_type: string | number, payload: ServerMessage) => {
    lastHeardMs = performance.now();
    if (payload.type === 'closing') {
      closeReason = payload.reason === 'shutdown' ? 'serverShutdown' : 'roomClosed';
    }
    if (payload.type === 'welcome' && payload.protocol !== PROTOCOL_VERSION) {
      // Back in after a reconnect, but the server was updated meanwhile.
      closeReason = 'protocolMismatch';
      void room.leave(true).catch(() => undefined);
      return;
    }
    lagIn(() => {
      if (messageListeners.size === 0) early.push(payload);
      for (const listener of messageListeners) listener(payload);
    });
  });
  room.onDrop(() => {
    reconnecting = true;
    status('reconnecting', null);
  });
  room.onReconnect(() => {
    reconnecting = false;
    if (leaving) {
      // Left while away, and a try that was already out got back in: leave now.
      void room.leave(true).catch(() => undefined);
      return;
    }
    lastHeardMs = performance.now();
    // The SDK sets the new reconnection token right after this callback.
    queueMicrotask(() => {
      status('connected', null);
    });
  });
  // A socket can go quiet without closing; then close it, so the SDK reconnects.
  const watchdog = setInterval(
    () => {
      if (closed || reconnecting) return;
      if (performance.now() - lastHeardMs < NET_SILENCE_TIMEOUT_MS) return;
      room.connection.close(MAY_TRY_RECONNECT, 'silent');
    },
    Math.min(1000, NET_SILENCE_TIMEOUT_MS / 2),
  );
  room.onLeave((code: number) => {
    closed = true;
    clearInterval(watchdog);
    let error: OnlineError | null;
    if (closeReason) error = closeReason;
    else if (leaving) error = null;
    else if (code === SERVER_SHUTDOWN) error = 'serverShutdown';
    else if (reconnecting) error = 'reconnectFailed';
    else error = 'disconnected';
    reconnecting = false;
    status('closed', error);
  });

  return {
    sessionId: room.sessionId,
    joinCode: room.roomId,
    send: (message) => {
      lagOut(() => {
        if (!closed && !reconnecting) room.send(message.type, message);
      });
    },
    onMessage: (listener) => {
      messageListeners.add(listener);
      for (const message of early.splice(0)) listener(message);
      return () => messageListeners.delete(listener);
    },
    onStatus: (listener) => {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    leave: async () => {
      // The library's `leave` waits for a close that already happened.
      if (closed) return;
      leaving = true;
      clearInterval(watchdog);
      if (reconnecting) {
        // Nothing to say goodbye on: stop trying, the server lets the seat go after the grace period.
        room.reconnection.maxRetries = 0;
        closed = true;
        return;
      }
      try {
        await room.leave(true);
      } catch {
        // Already gone: nothing to leave.
      }
    },
    reconnectionToken: () => room.reconnectionToken,
  };
}
