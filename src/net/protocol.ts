/**
 * The messages between browser and server, as plain JSON, and validators for
 * what the server receives. Everything a client sends is untrusted: the
 * server only ever looks at a message after `parseClientMessage` accepted it.
 */

import type { Flow } from '../flow/flow';
import type { LevelRecord } from '../flow/save';
import type { DevicePress } from '../input/controller';
import {
  NET_MAX_ID_LENGTH,
  NET_MAX_INPUTS_PER_MESSAGE,
  NET_MAX_NAME_LENGTH,
  NET_MAX_PRESSES_PER_MESSAGE,
} from '../sim/balance';
import { type LevelMap, MAX_PLAYERS } from '../sim/level';
import type { InputCommand, Vec } from '../sim/state';
import type { Snapshot } from './snapshot';

/** The Colyseus room type clients create and join: `client.create(GAME_ROOM, hello)`. */
export const GAME_ROOM = 'game';

/** Bumped on every incompatible change; the server refuses other versions. */
export const PROTOCOL_VERSION = 3;

// ---------------------------------------------------------------- client → server

/** First message after connecting (and after a reconnect): who is here and with how many players. */
export interface HelloMessage {
  type: 'hello';
  protocol: number;
  /** The random id from `localStorage`; never sent on to other clients. */
  userId: string;
  displayName: string;
  /** Couch players on this machine, 1 to `MAX_PLAYERS`. */
  localPlayers: number;
}

/**
 * This frame's input commands, one per local player per tick, stamped with
 * the server tick they are meant for. The server only accepts commands for
 * player ids this client owns.
 */
export interface InputsMessage {
  type: 'inputs';
  inputs: InputCommand[];
}

export interface PingMessage {
  type: 'ping';
  /** Echoed in the pong, to match them up. */
  id: number;
  /** The client's clock when sent, echoed in the pong. */
  clientTimeMs: number;
}

/**
 * Menu button presses from this machine's devices. Device ids are local
 * (`kb-left`, `pad-0`); the server makes them room-unique as `<sessionId>:<deviceId>`.
 */
export interface MenuMessage {
  type: 'menu';
  presses: DevicePress[];
}

export type ClientMessage = HelloMessage | InputsMessage | PingMessage | MenuMessage;

// ---------------------------------------------------------------- server → client

export interface WelcomeMessage {
  type: 'welcome';
  protocol: number;
  /** This client's session in the room; device ids from it are `<sessionId>:<deviceId>`. */
  sessionId: string;
  joinCode: string;
  serverTick: number;
  ticksPerSecond: number;
  snapshotEveryTicks: number;
}

/** Someone in the room. User ids stay on the server: knowing one is being that user. */
export interface LobbyMember {
  sessionId: string;
  displayName: string;
  localPlayers: number;
  isHost: boolean;
  /** `false` while their connection is down and the room waits for them to reconnect. */
  connected: boolean;
}

export interface LobbyMessage {
  type: 'lobby';
  joinCode: string;
  /** In join order. */
  members: LobbyMember[];
  /**
   * The room's progress: the host's levels, which decide what is open in
   * the level select. Sent again whenever it changes.
   */
  levels: Record<string, LevelRecord>;
}

/** A round begins: the static map, sent once, and the first snapshot. */
export interface RoundStartMessage {
  type: 'roundStart';
  /** Counts up per room: a reconnect gets the same round again with the same id. */
  roundId: number;
  /**
   * Whether this member counts in the round: they were in the room when it
   * started, so it goes into their profile. `false` for someone who joined
   * while it ran (they watch it).
   */
  counted: boolean;
  levelId: string;
  level: LevelMap;
  snapshot: Snapshot;
}

export interface SnapshotMessage {
  type: 'snapshot';
  serverTick: number;
  /** The room's screen flow (lobby, menus, results), run on the server. */
  flow: Flow;
  /** The round, or `null` when no round is loaded. */
  game: Snapshot | null;
}

export interface PongMessage {
  type: 'pong';
  id: number;
  clientTimeMs: number;
  /** The server tick when the ping was answered. */
  serverTick: number;
}

/** The server is about to close the room: nobody did anything for a long time, or it is shutting down. */
export interface ClosingMessage {
  type: 'closing';
  reason: 'idle' | 'shutdown';
}

export type ErrorCode =
  'badMessage' | 'protocolMismatch' | 'wrongCode' | 'roomFull' | 'roundRunning' | 'notHost';

export interface ErrorMessage {
  type: 'error';
  code: ErrorCode;
  message: string;
}

export type ServerMessage =
  | WelcomeMessage
  | LobbyMessage
  | RoundStartMessage
  | SnapshotMessage
  | PongMessage
  | ErrorMessage
  | ClosingMessage;

// ---------------------------------------------------------------- validation

export type ParseResult<T> = { ok: true; value: T } | { ok: false; reason: string };

/** Thrown inside the validators only; turned into `{ ok: false }` at the edge. */
class Invalid extends Error {}

function fail(reason: string): never {
  throw new Invalid(reason);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function record(v: unknown, what: string): Record<string, unknown> {
  if (!isRecord(v)) fail(`${what} must be an object`);
  return v;
}

function finite(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${what} must be a finite number`);
  return v;
}

function int(v: unknown, what: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  const n = finite(v, what);
  if (!Number.isInteger(n) || n < min || n > max) {
    fail(`${what} must be a whole number from ${min} to ${max}`);
  }
  return n;
}

function bool(v: unknown, what: string): boolean {
  if (typeof v !== 'boolean') fail(`${what} must be true or false`);
  return v;
}

function str(v: unknown, what: string, maxLength: number): string {
  if (typeof v !== 'string') fail(`${what} must be a string`);
  if (v.length > maxLength) fail(`${what} is longer than ${maxLength} characters`);
  return v;
}

/** Ids: letters, digits, `-` and `_`, so they are safe in keys, logs and device ids. */
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function id(v: unknown, what: string): string {
  const s = str(v, what, NET_MAX_ID_LENGTH);
  if (!ID_PATTERN.test(s)) fail(`${what} may only hold letters, digits, - and _`);
  return s;
}

function array(v: unknown, what: string, maxLength: number): unknown[] {
  if (!Array.isArray(v)) fail(`${what} must be an array`);
  if (v.length > maxLength) fail(`${what} has more than ${maxLength} entries`);
  return v;
}

/** A world direction of at most length 1; longer ones are scaled down. */
function move(v: unknown, what: string): Vec {
  const r = record(v, what);
  const x = finite(r.x, `${what}.x`);
  const y = finite(r.y, `${what}.y`);
  const length = Math.hypot(x, y);
  return length > 1 ? { x: x / length, y: y / length } : { x, y };
}

/** -1, 0 or 1. */
function step(v: unknown, what: string): number {
  return int(v, what, -1, 1);
}

function parseHello(m: Record<string, unknown>): HelloMessage {
  const displayName = str(m.displayName, 'displayName', NET_MAX_NAME_LENGTH).trim();
  if (displayName.length === 0) fail('displayName must not be empty');
  return {
    type: 'hello',
    protocol: int(m.protocol, 'protocol', 0),
    userId: id(m.userId, 'userId'),
    displayName,
    localPlayers: int(m.localPlayers, 'localPlayers', 1, MAX_PLAYERS),
  };
}

function parseInput(v: unknown, i: number): InputCommand {
  const what = `inputs[${i}]`;
  const r = record(v, what);
  return {
    playerId: int(r.playerId, `${what}.playerId`, 1, MAX_PLAYERS),
    tick: int(r.tick, `${what}.tick`, 0),
    move: move(r.move, `${what}.move`),
    interact: bool(r.interact, `${what}.interact`),
    work: bool(r.work, `${what}.work`),
    dash: bool(r.dash, `${what}.dash`),
  };
}

function parsePress(v: unknown, i: number): DevicePress {
  const what = `presses[${i}]`;
  const r = record(v, what);
  const nav = record(r.nav, `${what}.nav`);
  return {
    deviceId: id(r.deviceId, `${what}.deviceId`),
    joinGroup: id(r.joinGroup, `${what}.joinGroup`),
    join: bool(r.join, `${what}.join`),
    interact: bool(r.interact, `${what}.interact`),
    dash: bool(r.dash, `${what}.dash`),
    menu: bool(r.menu, `${what}.menu`),
    nav: { x: step(nav.x, `${what}.nav.x`), y: step(nav.y, `${what}.nav.y`) },
  };
}

function parse(raw: unknown): ClientMessage {
  const m = record(raw, 'message');
  switch (m.type) {
    case 'hello':
      return parseHello(m);
    case 'inputs':
      return {
        type: 'inputs',
        inputs: array(m.inputs, 'inputs', NET_MAX_INPUTS_PER_MESSAGE).map(parseInput),
      };
    case 'ping':
      return {
        type: 'ping',
        id: int(m.id, 'id', 0),
        clientTimeMs: finite(m.clientTimeMs, 'clientTimeMs'),
      };
    case 'menu':
      return {
        type: 'menu',
        presses: array(m.presses, 'presses', NET_MAX_PRESSES_PER_MESSAGE).map(parsePress),
      };
    default:
      return fail(
        `unknown message type ${typeof m.type === 'string' ? m.type.slice(0, 32) : typeof m.type}`,
      );
  }
}

/**
 * Checks a message from a client. Returns a fresh copy holding only the known
 * fields, so nothing extra a client sends ever reaches the server's state.
 */
export function parseClientMessage(raw: unknown): ParseResult<ClientMessage> {
  try {
    return { ok: true, value: parse(raw) };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, reason: e.message };
    throw e;
  }
}

/** `parseClientMessage` for raw text off the wire. */
export function decodeClientMessage(text: string): ParseResult<ClientMessage> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not valid JSON' };
  }
  return parseClientMessage(raw);
}
