/** Routes a member's message to the room logic it belongs to (see `room.ts`). */

import {
  type FlowContext,
  type FlowEffect,
  finishRound,
  isRoundRunning,
  updateFlow,
} from '../src/flow/flow';
import { normalizeUserId } from '../src/flow/identity';
import { type ChapterInfo, type LevelRecord, mergeLevels, recordLevel } from '../src/flow/save';
import { applyCommand } from '../src/flow/commands';
import { rolesForRoster } from '../src/flow/roster';
import { createInputBuffer, pushInput, takeInput } from '../src/net/inputBuffer';
import {
  type ErrorCode,
  type HelloMessage,
  PROTOCOL_VERSION,
  parseClientMessage,
} from '../src/net/protocol';
import { createSnapshotLog, isSnapshotTick, recordTick, takeSnapshot } from '../src/net/snapshot';
import {
  NET_MAX_MESSAGES_PER_SECOND,
  NET_MESSAGE_BURST,
  NET_ROOM_IDLE_MS,
  NET_SERVER_MAX_CATCHUP_TICKS,
  NET_SNAPSHOT_EVERY_TICKS,
  TICKS_PER_SECOND,
} from '../src/sim/balance';
import { MAX_PLAYERS } from '../src/sim/level';
import type { LevelResult } from '../src/sim/orders';
import { CHAPTERS, LEVELS } from '../src/sim/levels';
import { type GameState, type InputCommand, createGame } from '../src/sim/state';
import { tick } from '../src/sim/tick';
import {
  type Member,
  type Outgoing,
  type ProfileWrite,
  type RoomState,
  TICK_MS,
  errorTo,
  hostOf,
  playerCount,
  roundStartTo,
} from './room';
import {
  allowedPresses,
  configurePlayer,
  isFromSession,
  lobbyMessage,
  playerIdsOf,
  pruneDeparted,
  queuePresses,
  takeOverSlot,
} from './lobby';

export {
  type Member,
  type Outgoing,
  type Participant,
  type ProfileWrite,
  type RoomOptions,
  type RoomState,
  TICK_MS,
  createRoomState,
  hostOf,
} from './room';
export { lobbyMessage, playerIdsOf, roomDeviceId } from './lobby';

/** Absorbs float error so exactly N ticks of time always runs N ticks. */
const EPSILON = 1e-6;

const LEVEL_IDS: readonly string[] = LEVELS.map((l) => l.id);
const CHAPTER_INFO: readonly ChapterInfo[] = CHAPTERS.map((c) => ({
  levelIds: c.levels.map((l) => l.id),
  starGate: c.starGate,
}));

export type JoinResult =
  { ok: true; out: Outgoing[] } | { ok: false; code: ErrorCode; reason: string };

function welcomeTo(room: RoomState, sessionId: string): Outgoing {
  return {
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
  };
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
    out: [welcomeTo(room, sessionId), lobbyMessage(room), ...roundStartTo(room, sessionId)],
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
    connected: true,
    budget: NET_MESSAGE_BURST,
    dropped: 0,
  };
}

/** The room's unlocks follow the host: the save's levels become a copy of theirs. */
function followHost(room: RoomState): void {
  room.save.levels = structuredClone(hostOf(room)?.levels ?? {});
}

/**
 * A member's profile came in from the store (after joining: loading takes a
 * moment). Merged into what they have, so rounds finished in the meantime
 * aren't lost. When it's the host's, the room's unlocks change with it and
 * everyone gets them in a new `lobby` message.
 */
export function setMemberProfile(
  room: RoomState,
  sessionId: string,
  levels: Readonly<Record<string, LevelRecord>>,
): Outgoing[] {
  const member = room.members.find((m) => m.sessionId === sessionId);
  if (!member) return [];
  member.levels = mergeLevels(member.levels, levels);
  if (member !== hostOf(room)) return [];
  followHost(room);
  return [lobbyMessage(room)];
}

/**
 * A round ended: it counts for everyone who was in the room when it started
 * (not only the host, and also those who left since; not those who joined
 * while it ran). Recorded in the levels of those still here, and queued once
 * per profile for the store.
 */
function recordForMembers(room: RoomState, levelId: string, result: LevelResult): void {
  const queued = new Set<string>();
  for (const participant of room.participants) {
    const member = room.members.find((m) => m.sessionId === participant.sessionId);
    if (member) recordLevel(member.levels, levelId, result);
    const profileId = participant.profileId;
    if (!profileId || queued.has(profileId)) continue;
    queued.add(profileId);
    room.profileWrites.push({
      userId: profileId,
      displayName: member?.displayName ?? participant.displayName,
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
 * Someone left for good (on purpose, or their reconnect grace ran out). The
 * host moves to the earliest joined member left. Outside a round their
 * players are dropped and the others renumbered in join order; during a
 * round their players stay and stand still until it ends (`pruneDeparted`
 * runs when the round stops or the next one starts).
 */
export function leaveRoom(room: RoomState, sessionId: string): Outgoing[] {
  const before = room.members.length;
  room.members = room.members.filter((m) => m.sessionId !== sessionId);
  if (room.members.length === before) return [];
  followHost(room);
  room.presses = room.presses.filter((p) => !isFromSession(p.deviceId, sessionId));
  if (!room.game || room.flow.screen === 'intro') pruneDeparted(room);
  return room.members.length > 0 ? [lobbyMessage(room)] : [];
}

/**
 * A member's connection dropped: they stay in the room (with their players,
 * who stand still) while it waits for them to reconnect. Menu authority
 * moves to the next connected member meanwhile (`hostOf`).
 */
export function dropMember(room: RoomState, sessionId: string): Outgoing[] {
  const member = room.members.find((m) => m.sessionId === sessionId);
  if (!member?.connected) return [];
  member.connected = false;
  for (const id of playerIdsOf(room, sessionId)) {
    // Refused outside the lobby and intro, where readiness doesn't count.
    applyCommand(room.flow, { type: 'ready', playerId: id, ready: false });
  }
  room.presses = room.presses.filter((p) => !isFromSession(p.deviceId, sessionId));
  followHost(room);
  return [lobbyMessage(room)];
}

/**
 * A dropped member reconnected (the same session): they get the welcome
 * (with the protocol, which the client checks again), the room and the
 * loaded round (same round id) again, as they may have missed changes;
 * everyone gets the new `lobby`.
 */
export function rejoinMember(room: RoomState, sessionId: string): Outgoing[] {
  const member = room.members.find((m) => m.sessionId === sessionId);
  if (!member) return [];
  member.connected = true;
  member.budget = NET_MESSAGE_BURST;
  followHost(room);
  return [welcomeTo(room, sessionId), lobbyMessage(room), ...roundStartTo(room, sessionId)];
}

/** A message from a member: checked first, refused with an `error` when it doesn't parse. */
export function handleMessage(room: RoomState, sessionId: string, raw: unknown): Outgoing[] {
  const member = room.members.find((m) => m.sessionId === sessionId);
  if (!member?.connected) return [];
  // A flood is dropped before anything else looks at it.
  if (member.budget < 1) {
    member.dropped++;
    return [];
  }
  member.budget--;
  const parsed = parseClientMessage(raw);
  if (!parsed.ok) return [errorTo(sessionId, 'badMessage', parsed.reason)];
  const message = parsed.value;
  switch (message.type) {
    case 'role':
    case 'ready':
      return configurePlayer(room, sessionId, message);
    case 'takeover':
      return takeOverSlot(room, sessionId, message);
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
        if (isActive(input)) room.lastActivityTick = room.serverTick;
        const buffer = room.buffers.find((b) => b.playerId === input.playerId);
        if (buffer) pushInput(buffer, input, room.serverTick);
      }
      return [];
    }
    case 'menu':
      queuePresses(room, sessionId, message.presses);
      return [];
    case 'hello':
      return updateMember(room, member, message);
    case 'rename':
      if (member.displayName === message.displayName) return [];
      member.displayName = message.displayName;
      return [lobbyMessage(room)];
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

/** An input that does something (a standing, idle player's inputs don't keep a room open). */
function isActive(input: InputCommand): boolean {
  return input.move.x !== 0 || input.move.y !== 0 || input.interact || input.work || input.dash;
}

function flowContext(room: RoomState): FlowContext {
  const host = hostOf(room)?.sessionId;
  return {
    save: room.save,
    levelIds: LEVEL_IDS,
    chapters: CHAPTER_INFO,
    unlockAll: false,
    nowMs: room.serverTick * TICK_MS,
    // Online the host starts the game, whoever joined first.
    canStart: (deviceId) => host !== undefined && isFromSession(deviceId, host),
    participates: (deviceId) =>
      room.members.some((m) => m.connected && isFromSession(deviceId, m.sessionId)),
  };
}

function runEffects(room: RoomState, effects: readonly FlowEffect[]): Outgoing[] {
  const out: Outgoing[] = [];
  for (const effect of effects) {
    switch (effect.type) {
      case 'lockRoster': {
        const previous = room.game;
        const level = LEVELS[room.flow.levelIndex];
        if (!previous || !level) throw new Error('Cannot lock a roster without a prepared round');
        pruneDeparted(room);
        const ids = room.flow.lobby.players.map((p) => p.playerId);
        room.game = createGame(level, previous.seed, ids, rolesForRoster(room.flow.lobby));
        if (room.roundTicks !== null) room.game.settings.durationTicks = room.roundTicks;
        room.buffers = ids.map((id) => createInputBuffer(id));
        room.log = createSnapshotLog();
        out.push(...roundStartTo(room, null));
        break;
      }
      case 'startLevel': {
        // The round before (if any) is over: those who left during it go now.
        room.game = null;
        pruneDeparted(room);
        const level = LEVELS[effect.levelIndex];
        const ids = room.flow.lobby.players.map((p) => p.playerId);
        if (!level || ids.length === 0) {
          stopRound(room);
          break;
        }
        room.game = createGame(level, room.seed++, ids, rolesForRoster(room.flow.lobby));
        if (room.roundTicks !== null) room.game.settings.durationTicks = room.roundTicks;
        room.buffers = ids.map((id) => createInputBuffer(id));
        room.log = createSnapshotLog();
        room.roundId++;
        room.participants = room.members.map((m) => ({
          sessionId: m.sessionId,
          profileId: m.profileId,
          displayName: m.displayName,
        }));
        out.push(...roundStartTo(room, null));
        break;
      }
      case 'stopRound':
        stopRound(room);
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

/** The round is dropped; those who left during it lose their players now. */
function stopRound(room: RoomState): void {
  room.game = null;
  room.buffers = [];
  room.log = createSnapshotLog();
  room.participants = [];
  pruneDeparted(room);
}

/** A function, so TypeScript doesn't assume `tick` left `result` alone. */
const resultOf = (game: GameState): LevelResult | null => game.result;

/**
 * One server tick: the flow with the presses the room allows (see
 * `allowedPresses`) since the last tick, then one
 * input per player and a sim tick while the round plays, then a snapshot
 * every `NET_SNAPSHOT_EVERY_TICKS`.
 */
export function stepRoom(room: RoomState): Outgoing[] {
  const refill = NET_MAX_MESSAGES_PER_SECOND / TICKS_PER_SECOND;
  for (const member of room.members) {
    member.budget = Math.min(NET_MESSAGE_BURST, member.budget + refill);
  }
  const ctx = flowContext(room);
  const { presses, changed } = allowedPresses(room, room.presses);
  room.presses = [];
  const out = runEffects(room, updateFlow(room.flow, presses, ctx).effects);
  if (changed) out.push(lobbyMessage(room));

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
        // The host's progress changed: the level select shows it.
        out.push(lobbyMessage(room));
      }
    }
  }

  room.serverTick++;
  if (
    room.closing === null &&
    (room.serverTick - room.lastActivityTick) * TICK_MS >= NET_ROOM_IDLE_MS
  ) {
    room.closing = 'idle';
    out.push({ to: null, message: { type: 'closing', reason: 'idle' } });
  }
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
