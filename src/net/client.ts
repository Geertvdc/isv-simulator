/**
 * The only networking code in the browser: a thin wrapper around
 * `@colyseus/sdk`. It creates or joins a room with our `hello`, sends and
 * receives the plain messages from `protocol.ts` (a Colyseus message whose
 * type is the protocol message's `type` and whose payload is the whole
 * message, both ways), and reports the connection's status. Everything the
 * game does with those messages lives in pure code (`src/flow/online.ts`).
 */

import { Client, type Room } from '@colyseus/sdk';
import type { OnlineError } from '../flow/flow';
import type { Identity } from '../flow/identity';
import { onlineErrorFromCode } from '../flow/online';
import { type LagLine, type LagSettings, createLagLine, deliveryTime } from './lag';
import {
  type ClientMessage,
  GAME_ROOM,
  type HelloMessage,
  PROTOCOL_VERSION,
  type ServerMessage,
} from './protocol';

/** Colyseus's code for "no room with this id". */
const INVALID_ROOM_ID = 522;

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

/** Calls `fn` now, or after the simulated lag on `line`. */
function later(line: LagLine | null, fn: () => void): void {
  if (!line) {
    fn();
    return;
  }
  const now = performance.now();
  setTimeout(fn, deliveryTime(line, now) - now);
}

function lagLine(options: ConnectOptions): LagLine | null {
  return options.lag ? createLagLine(options.lag, Math.floor(Math.random() * 2 ** 31)) : null;
}

function wrap(room: Room, options: ConnectOptions): NetConnection {
  const lagIn = lagLine(options);
  const lagOut = lagLine(options);
  const messageListeners = new Set<(message: ServerMessage) => void>();
  const statusListeners = new Set<(status: ConnectionStatus, error: OnlineError | null) => void>();
  const early: ServerMessage[] = [];
  let leaving = false;
  let closed = false;

  room.onMessage('*', (_type: string | number, payload: ServerMessage) => {
    later(lagIn, () => {
      if (messageListeners.size === 0) early.push(payload);
      for (const listener of messageListeners) listener(payload);
    });
  });
  const status = (next: ConnectionStatus, error: OnlineError | null): void => {
    for (const listener of statusListeners) listener(next, error);
  };
  room.onDrop(() => {
    status('reconnecting', null);
  });
  room.onReconnect(() => {
    status('connected', null);
  });
  room.onLeave(() => {
    closed = true;
    status('closed', leaving ? null : 'disconnected');
  });

  return {
    sessionId: room.sessionId,
    joinCode: room.roomId,
    send: (message) => {
      later(lagOut, () => {
        if (!closed) room.send(message.type, message);
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
      try {
        await room.leave(true);
      } catch {
        // Already gone: nothing to leave.
      }
    },
  };
}
