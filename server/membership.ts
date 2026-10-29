/**
 * Who is in the room: joining with a `hello`, leaving, dropping and
 * reconnecting, profiles coming in, and each member's message budget.
 */

import { applyCommand } from '../src/flow/commands';
import { normalizeUserId } from '../src/flow/identity';
import { type LevelRecord, mergeLevels } from '../src/flow/save';
import {
  type ErrorCode,
  type HelloMessage,
  PROTOCOL_VERSION,
  parseClientMessage,
} from '../src/net/protocol';
import {
  NET_MAX_MESSAGES_PER_SECOND,
  NET_MESSAGE_BURST,
  NET_SNAPSHOT_EVERY_TICKS,
  TICKS_PER_SECOND,
} from '../src/sim/balance';
import { MAX_PLAYERS } from '../src/sim/level';
import { isFromSession, lobbyMessage, playerIdsOf, pruneDeparted } from './lobby';
import {
  type Member,
  type Outgoing,
  type RoomState,
  errorTo,
  hostOf,
  playerCount,
  roundStartTo,
} from './room';

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

/** A `hello` from someone already in the room: a new name or couch player count. */
export function updateMember(room: RoomState, member: Member, hello: HelloMessage): Outgoing[] {
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

/** A new display name for everyone's lobby; nothing to send when it's the same. */
export function renameMember(room: RoomState, member: Member, displayName: string): Outgoing[] {
  if (member.displayName === displayName) return [];
  member.displayName = displayName;
  return [lobbyMessage(room)];
}

/**
 * Spends one message from the member's budget: `false` (and counted as
 * dropped) when they have none left, so a flood is dropped unread.
 */
export function spendMessage(member: Member): boolean {
  if (member.budget < 1) {
    member.dropped++;
    return false;
  }
  member.budget--;
  return true;
}

/** Every tick each member's budget fills up a little, up to the burst. */
export function refillBudgets(room: RoomState): void {
  const refill = NET_MAX_MESSAGES_PER_SECOND / TICKS_PER_SECOND;
  for (const member of room.members) {
    member.budget = Math.min(NET_MESSAGE_BURST, member.budget + refill);
  }
}
