/**
 * One online room, as plain data and pure functions: who is in it, the
 * room's screen flow and round, and the server clock. Every change returns
 * the messages to send; `GameRoom.ts` only delivers them over Colyseus.
 *
 * Like `src/sim`, nothing in here reads the real clock or `Math.random`:
 * time comes in as `deltaMs`, the round seed is handed in, so tests can play
 * a room tick by tick.
 */

import {
  type Flow,
  type FlowContext,
  type FlowEffect,
  createFlow,
  finishRound,
  isRoundRunning,
  updateFlow,
} from '../src/flow/flow';
import { normalizeUserId } from '../src/flow/identity';
import {
  type ChapterInfo,
  type LevelRecord,
  type SaveData,
  createSave,
  mergeLevels,
  recordLevel,
} from '../src/flow/save';
import type { DevicePress } from '../src/input/controller';
import { type InputBuffer, createInputBuffer, pushInput, takeInput } from '../src/net/inputBuffer';
import {
  type ErrorCode,
  type HelloMessage,
  type LobbyMember,
  PROTOCOL_VERSION,
  type ServerMessage,
  parseClientMessage,
} from '../src/net/protocol';
import {
  type SnapshotLog,
  createSnapshotLog,
  isSnapshotTick,
  recordTick,
  takeSnapshot,
} from '../src/net/snapshot';
import {
  NET_SERVER_MAX_CATCHUP_TICKS,
  NET_SNAPSHOT_EVERY_TICKS,
  TICKS_PER_SECOND,
} from '../src/sim/balance';
import { MAX_PLAYERS } from '../src/sim/level';
import type { LevelResult } from '../src/sim/orders';
import { CHAPTERS, LEVELS } from '../src/sim/levels';
import { type GameState, type PlayerId, createGame } from '../src/sim/state';
import { tick } from '../src/sim/tick';

export const TICK_MS = 1000 / TICKS_PER_SECOND;
/** Absorbs float error so exactly N ticks of time always runs N ticks. */
const EPSILON = 1e-6;

const LEVEL_IDS: readonly string[] = LEVELS.map((l) => l.id);
const CHAPTER_INFO: readonly ChapterInfo[] = CHAPTERS.map((c) => ({
  levelIds: c.levels.map((l) => l.id),
  starGate: c.starGate,
}));

/** Someone connected to the room: one machine, with one or more couch players. */
export interface Member {
  sessionId: string;
  /** From `hello`; stays on the server. */
  userId: string;
  displayName: string;
  /** Couch players on this machine, as `hello` said. */
  localPlayers: number;
  /** The user id as a profile id (a UUID v4 in lower case), or `null`: then no profile. */
  profileId: string | null;
  /** Progress from the member's profile plus rounds played in this room. */
  levels: Record<string, LevelRecord>;
}

/** A finished round to add to a profile in the store. */
export interface ProfileWrite {
  userId: string;
  displayName: string;
  levelId: string;
  result: LevelResult;
}

export interface RoomState {
  joinCode: string;
  /** In join order; the first one is the host. */
  members: Member[];
  /** Server ticks run so far. Never stops, unlike the round's `tick`. */
  serverTick: number;
  /** Real time not run yet, in ticks. */
  accumulator: number;
  /** The room's screens, run for everyone. */
  flow: Flow;
  /**
   * The flow's save context. Its levels are the host's (`Member.levels`),
   * so unlocks follow the host; settings are the defaults and unused.
   */
  save: SaveData;
  /** The round, from its level's intro card to its results; `null` in menus. */
  game: GameState | null;
  /** One per player in `game`. */
  buffers: InputBuffer[];
  log: SnapshotLog;
  /** Menu presses received since the last tick, device ids already made room-unique. */
  presses: DevicePress[];
  /** The next round's seed. */
  seed: number;
  /** Finished rounds for the profile store; `takeProfileWrites` hands them out. */
  profileWrites: ProfileWrite[];
}

/** A message to one session, or to everyone in the room (`to: null`). */
export interface Outgoing {
  to: string | null;
  message: ServerMessage;
}

export type JoinResult =
  { ok: true; out: Outgoing[] } | { ok: false; code: ErrorCode; reason: string };

/** A fresh room, on its lobby screen: everyone joining goes straight there. */
export function createRoomState(joinCode: string, seed: number): RoomState {
  const flow = createFlow();
  flow.screen = 'lobby';
  flow.awake = true;
  return {
    joinCode,
    members: [],
    serverTick: 0,
    accumulator: 0,
    flow,
    save: createSave(),
    game: null,
    buffers: [],
    log: createSnapshotLog(),
    presses: [],
    seed,
    profileWrites: [],
  };
}

export function hostOf(room: RoomState): Member | undefined {
  return room.members[0];
}

/** Device ids from a session are `<sessionId>:<deviceId>`; clients can't send a colon. */
export function roomDeviceId(sessionId: string, deviceId: string): string {
  return `${sessionId}:${deviceId}`;
}

function isFromSession(deviceId: string, sessionId: string): boolean {
  return deviceId.startsWith(`${sessionId}:`);
}

/** The players this session's devices are bound to in the lobby. */
export function playerIdsOf(room: RoomState, sessionId: string): PlayerId[] {
  return room.flow.lobby.players
    .filter((p) => isFromSession(p.deviceId, sessionId))
    .map((p) => p.playerId);
}

function playerCount(room: RoomState, except?: string): number {
  return room.members
    .filter((m) => m.sessionId !== except)
    .reduce((sum, m) => sum + m.localPlayers, 0);
}

export function lobbyMessage(room: RoomState): Outgoing {
  const host = hostOf(room)?.sessionId;
  const members: LobbyMember[] = room.members.map((m) => ({
    sessionId: m.sessionId,
    displayName: m.displayName,
    localPlayers: m.localPlayers,
    isHost: m.sessionId === host,
    connected: true,
  }));
  return { to: null, message: { type: 'lobby', joinCode: room.joinCode, members } };
}

function errorTo(to: string, code: ErrorCode, message: string): Outgoing {
  return { to, message: { type: 'error', code, message } };
}

function roundStartTo(room: RoomState, to: string | null): Outgoing[] {
  const game = room.game;
  if (!game) return [];
  // Not `takeSnapshot`: that would steal the events meant for the next snapshot.
  const snapshot = takeSnapshot({ events: [] }, game, room.serverTick);
  return [
    {
      to,
      message: { type: 'roundStart', levelId: game.levelId, level: game.level, snapshot },
    },
  ];
}

/**
 * Checks a joiner's `hello` (the join options) and adds them. Refused:
 * a bad message, another protocol version, or more players than fit.
 */
export function joinRoom(room: RoomState, sessionId: string, options: unknown): JoinResult {
  const parsed = parseClientMessage(options);
  if (!parsed.ok) return { ok: false, code: 'badMessage', reason: parsed.reason };
  if (parsed.value.type !== 'hello') {
    return { ok: false, code: 'badMessage', reason: 'joining needs a hello' };
  }
  const hello = parsed.value;
  if (hello.protocol !== PROTOCOL_VERSION) {
    return {
      ok: false,
      code: 'protocolMismatch',
      reason: `server speaks protocol ${PROTOCOL_VERSION}, client ${hello.protocol}`,
    };
  }
  if (room.members.some((m) => m.sessionId === sessionId)) {
    return { ok: false, code: 'badMessage', reason: 'already in the room' };
  }
  if (playerCount(room) + hello.localPlayers > MAX_PLAYERS) {
    return { ok: false, code: 'roomFull', reason: `at most ${MAX_PLAYERS} players per room` };
  }
  room.members.push(memberFrom(sessionId, hello));
  followHost(room);
  return {
    ok: true,
    out: [
      {
        to: sessionId,
        message: {
          type: 'welcome',
          protocol: PROTOCOL_VERSION,
          sessionId,
          joinCode: room.joinCode,
          serverTick: room.serverTick,
          ticksPerSecond: TICKS_PER_SECOND,
          snapshotEveryTicks: NET_SNAPSHOT_EVERY_TICKS,
        },
      },
      lobbyMessage(room),
      ...roundStartTo(room, sessionId),
    ],
  };
}

function memberFrom(sessionId: string, hello: HelloMessage): Member {
  return {
    sessionId,
    userId: hello.userId,
    displayName: hello.displayName,
    localPlayers: hello.localPlayers,
    profileId: normalizeUserId(hello.userId),
    levels: {},
  };
}

/** The room's unlocks follow the host: the save's levels become a copy of theirs. */
function followHost(room: RoomState): void {
  room.save.levels = structuredClone(hostOf(room)?.levels ?? {});
}

/**
 * A member's profile came in from the store (after joining: loading takes a
 * moment). Merged into what they have, so rounds finished in the meantime
 * aren't lost. When it's the host's, the room's unlocks change with it.
 */
export function setMemberProfile(
  room: RoomState,
  sessionId: string,
  levels: Readonly<Record<string, LevelRecord>>,
): void {
  const member = room.members.find((m) => m.sessionId === sessionId);
  if (!member) return;
  member.levels = mergeLevels(member.levels, levels);
  if (member === hostOf(room)) followHost(room);
}

/**
 * A round ended: it counts for everyone in the room, not only the host.
 * Recorded in every member's levels, and queued once per profile for the store.
 */
function recordForMembers(room: RoomState, levelId: string, result: LevelResult): void {
  const queued = new Set<string>();
  for (const member of room.members) {
    recordLevel(member.levels, levelId, result);
    if (!member.profileId || queued.has(member.profileId)) continue;
    queued.add(member.profileId);
    room.profileWrites.push({
      userId: member.profileId,
      displayName: member.displayName,
      levelId,
      result: { score: result.score, stars: result.stars },
    });
  }
}

/** The finished rounds to write to the profile store since the last call. */
export function takeProfileWrites(room: RoomState): ProfileWrite[] {
  return room.profileWrites.splice(0);
}

/**
 * Someone left. The host moves to the earliest joined member left. In the
 * lobby their players are dropped and the others renumbered in join order;
 * in a round their players stay and stand still (13f decides more).
 */
export function leaveRoom(room: RoomState, sessionId: string): Outgoing[] {
  const before = room.members.length;
  room.members = room.members.filter((m) => m.sessionId !== sessionId);
  if (room.members.length === before) return [];
  followHost(room);
  room.presses = room.presses.filter((p) => !isFromSession(p.deviceId, sessionId));
  const lobby = room.flow.lobby;
  if (!lobby.started) {
    lobby.players = lobby.players
      .filter((p) => !isFromSession(p.deviceId, sessionId))
      .map((p, i) => ({ ...p, playerId: i + 1 }));
  }
  return room.members.length > 0 ? [lobbyMessage(room)] : [];
}

/** A message from a member: checked first, refused with an `error` when it doesn't parse. */
export function handleMessage(room: RoomState, sessionId: string, raw: unknown): Outgoing[] {
  const member = room.members.find((m) => m.sessionId === sessionId);
  if (!member) return [];
  const parsed = parseClientMessage(raw);
  if (!parsed.ok) return [errorTo(sessionId, 'badMessage', parsed.reason)];
  const message = parsed.value;
  switch (message.type) {
    case 'ping':
      return [
        {
          to: sessionId,
          message: {
            type: 'pong',
            id: message.id,
            clientTimeMs: message.clientTimeMs,
            serverTick: room.serverTick,
          },
        },
      ];
    case 'inputs': {
      const owned = new Set(playerIdsOf(room, sessionId));
      for (const input of message.inputs) {
        if (!owned.has(input.playerId)) continue;
        const buffer = room.buffers.find((b) => b.playerId === input.playerId);
        if (buffer) pushInput(buffer, input, room.serverTick);
      }
      return [];
    }
    case 'menu':
      for (const press of message.presses) {
        room.presses.push({
          ...press,
          deviceId: roomDeviceId(sessionId, press.deviceId),
          joinGroup: roomDeviceId(sessionId, press.joinGroup),
          nav: { ...press.nav },
        });
      }
      return [];
    case 'hello':
      return updateMember(room, member, message);
  }
}

/** A `hello` from someone already in the room: a new name or couch player count. */
function updateMember(room: RoomState, member: Member, hello: HelloMessage): Outgoing[] {
  if (hello.protocol !== PROTOCOL_VERSION) {
    return [
      errorTo(member.sessionId, 'protocolMismatch', `server speaks protocol ${PROTOCOL_VERSION}`),
    ];
  }
  const bound = playerIdsOf(room, member.sessionId).length;
  if (
    playerCount(room, member.sessionId) + hello.localPlayers > MAX_PLAYERS ||
    hello.localPlayers < bound
  ) {
    return [errorTo(member.sessionId, 'roomFull', `no room for ${hello.localPlayers} players`)];
  }
  member.displayName = hello.displayName;
  member.localPlayers = hello.localPlayers;
  return [lobbyMessage(room)];
}

/**
 * Join presses from devices that would take a session past the couch
 * players it said it has are dropped, so the room never holds more
 * players than its members announced.
 */
function allowedPresses(room: RoomState, presses: readonly DevicePress[]): DevicePress[] {
  if (room.flow.screen !== 'lobby') return [...presses];
  const bound = new Set(room.flow.lobby.players.map((p) => p.deviceId));
  const joining = new Map<string, number>();
  return presses.filter((press) => {
    if (!press.join || bound.has(press.deviceId)) return true;
    const member = room.members.find((m) => isFromSession(press.deviceId, m.sessionId));
    if (!member) return false;
    const count = (joining.get(member.sessionId) ?? playerIdsOf(room, member.sessionId).length) + 1;
    if (count > member.localPlayers) return false;
    joining.set(member.sessionId, count);
    return true;
  });
}

function flowContext(room: RoomState): FlowContext {
  return {
    save: room.save,
    levelIds: LEVEL_IDS,
    chapters: CHAPTER_INFO,
    unlockAll: false,
    nowMs: room.serverTick * TICK_MS,
  };
}

function runEffects(room: RoomState, effects: readonly FlowEffect[]): Outgoing[] {
  const out: Outgoing[] = [];
  for (const effect of effects) {
    switch (effect.type) {
      case 'startLevel': {
        const level = LEVELS[effect.levelIndex];
        const ids = room.flow.lobby.players.map((p) => p.playerId);
        if (!level || ids.length === 0) break;
        room.game = createGame(level, room.seed++, ids);
        room.buffers = ids.map((id) => createInputBuffer(id));
        room.log = createSnapshotLog();
        out.push(...roundStartTo(room, null));
        break;
      }
      case 'stopRound':
        room.game = null;
        room.buffers = [];
        room.log = createSnapshotLog();
        break;
      // Rounds run on server ticks, so pause needs no catching up. Results
      // go to the profiles (`recordForMembers`); settings and the profile
      // screen belong to each player's own browser.
      case 'resumeRound':
      case 'saveChanged':
      case 'settingsChanged':
        break;
    }
  }
  return out;
}

/** A function, so TypeScript doesn't assume `tick` left `result` alone. */
const resultOf = (game: GameState): LevelResult | null => game.result;

/**
 * One server tick: the flow with the presses since the last tick, then one
 * input per player and a sim tick while the round plays, then a snapshot
 * every `NET_SNAPSHOT_EVERY_TICKS`.
 */
export function stepRoom(room: RoomState): Outgoing[] {
  const ctx = flowContext(room);
  const presses = allowedPresses(room, room.presses);
  room.presses = [];
  const out = runEffects(room, updateFlow(room.flow, presses, ctx).effects);

  const game = room.game;
  if (game) {
    // Taken every tick, also while paused, so inputs never pile up.
    const inputs = room.buffers.map((b) => takeInput(b, room.serverTick));
    if (isRoundRunning(room.flow) && !game.result) {
      tick(game, inputs);
      recordTick(room.log, game);
      const result = resultOf(game);
      if (result && finishRound(room.flow, result, ctx).changed) {
        recordForMembers(room, game.levelId, result);
      }
    }
  }

  room.serverTick++;
  if (isSnapshotTick(room.serverTick)) {
    out.push({
      to: null,
      message: {
        type: 'snapshot',
        serverTick: room.serverTick,
        flow: structuredClone(room.flow),
        game: room.game ? takeSnapshot(room.log, room.game, room.serverTick) : null,
      },
    });
  }
  return out;
}

/**
 * Runs as many ticks as `deltaMs` of real time calls for, keeping the rest
 * for next time, so the tick count follows the real clock without drift.
 * After a stall at most `NET_SERVER_MAX_CATCHUP_TICKS` run and the rest of
 * the backlog is dropped.
 */
export function advanceRoom(room: RoomState, deltaMs: number): Outgoing[] {
  room.accumulator += Math.max(0, deltaMs) / TICK_MS;
  const out: Outgoing[] = [];
  let ran = 0;
  while (room.accumulator >= 1 - EPSILON && ran < NET_SERVER_MAX_CATCHUP_TICKS) {
    out.push(...stepRoom(room));
    room.accumulator = Math.max(0, room.accumulator - 1);
    ran++;
  }
  if (ran === NET_SERVER_MAX_CATCHUP_TICKS) room.accumulator = Math.min(room.accumulator, 1);
  return out;
}
