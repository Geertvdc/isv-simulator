/**
 * The room's roster: which device is bound to which player, their roles and
 * readiness, and whose menu presses count on which screen. Device ids are
 * made room-unique here, as `<sessionId>:<deviceId>`.
 */

import {
  type CommandFailure,
  type FlowCommand,
  applyCommand,
  commandFailureText,
} from '../src/flow/commands';
import { selection } from '../src/flow/roster';
import type { DevicePress } from '../src/input/controller';
import { createLobby } from '../src/input/lobby';
import type { ClientMessage, ErrorCode, LobbyMember } from '../src/net/protocol';
import { createSnapshotLog } from '../src/net/snapshot';
import { MAX_PLAYERS } from '../src/sim/level';
import type { PlayerId } from '../src/sim/state';
import { type Outgoing, type RoomState, errorTo, hostOf, playerCount } from './room';

type TakeoverMessage = Extract<ClientMessage, { type: 'takeover' }>;

/** Device ids from a session are `<sessionId>:<deviceId>`; clients can't send a colon. */
export function roomDeviceId(sessionId: string, deviceId: string): string {
  return `${sessionId}:${deviceId}`;
}

export function isFromSession(deviceId: string, sessionId: string): boolean {
  return deviceId.startsWith(`${sessionId}:`);
}

/** The players this session's devices are bound to in the lobby. */
export function playerIdsOf(room: RoomState, sessionId: string): PlayerId[] {
  return room.flow.lobby.players
    .filter((p) => isFromSession(p.deviceId, sessionId))
    .map((p) => p.playerId);
}

export function lobbyMessage(room: RoomState): Outgoing {
  const host = hostOf(room)?.sessionId;
  const members: LobbyMember[] = room.members.map((m) => ({
    sessionId: m.sessionId,
    displayName: m.displayName,
    localPlayers: m.localPlayers,
    isHost: m.sessionId === host,
    connected: m.connected,
  }));
  return {
    to: null,
    message: {
      type: 'lobby',
      joinCode: room.joinCode,
      members,
      levels: structuredClone(room.save.levels),
    },
  };
}

const COMMAND_ERROR_CODES: Record<CommandFailure, ErrorCode> = {
  rosterLocked: 'roundRunning',
  unknownPlayer: 'notOwner',
  unknownRole: 'badMessage',
};

/** A refused `applyCommand` as the protocol's `error`. */
function commandErrorTo(to: string, reason: CommandFailure): Outgoing {
  return errorTo(to, COMMAND_ERROR_CODES[reason], commandFailureText(reason));
}

/** A role or ready change for one of the session's own players. */
export function configurePlayer(
  room: RoomState,
  sessionId: string,
  command: FlowCommand,
): Outgoing[] {
  if (!playerIdsOf(room, sessionId).includes(command.playerId)) {
    return [errorTo(sessionId, 'notOwner', 'You can only configure your own player slots.')];
  }
  const result = applyCommand(room.flow, command);
  if (!result.ok) return [commandErrorTo(sessionId, result.reason)];
  room.lastActivityTick = room.serverTick;
  return [];
}

/** Moves one of the session's gamepad players to another of its (unbound) gamepads. */
export function takeOverSlot(
  room: RoomState,
  sessionId: string,
  message: TakeoverMessage,
): Outgoing[] {
  const binding = room.flow.lobby.players.find((p) => p.playerId === message.playerId);
  if (!binding || !isFromSession(binding.deviceId, sessionId)) {
    return [errorTo(sessionId, 'notOwner', 'You can only reclaim your own controller slot.')];
  }
  const deviceId = roomDeviceId(sessionId, message.deviceId);
  if (
    !binding.deviceId.startsWith(`${sessionId}:pad-`) ||
    room.flow.lobby.players.some((p) => p.deviceId === deviceId)
  ) {
    return [
      errorTo(sessionId, 'badMessage', 'Controller is already bound or the slot is not a gamepad.'),
    ];
  }
  binding.deviceId = deviceId;
  return [];
}

/** Menu presses from a session, queued with room-unique device ids for the next tick. */
export function queuePresses(
  room: RoomState,
  sessionId: string,
  presses: readonly DevicePress[],
): void {
  if (presses.length > 0) room.lastActivityTick = room.serverTick;
  for (const press of presses) {
    room.presses.push({
      ...press,
      deviceId: roomDeviceId(sessionId, press.deviceId),
      joinGroup: roomDeviceId(sessionId, press.joinGroup),
      nav: { ...press.nav },
    });
  }
}

/**
 * Drops the players of devices whose member left, renumbering the others in
 * join order (player ids must be 1..n for the spawns). A room left without
 * players after the lobby goes back to the lobby, so someone joins again.
 */
export function pruneDeparted(room: RoomState): void {
  const lobby = room.flow.lobby;
  const kept = lobby.players.filter((p) =>
    room.members.some((m) => isFromSession(p.deviceId, m.sessionId)),
  );
  if (kept.length !== lobby.players.length) {
    const choices = kept.map((p) => selection(lobby, p.playerId));
    lobby.players = kept.map((p, i) => ({ ...p, playerId: i + 1 }));
    lobby.selections = Object.fromEntries(choices.map((choice, i) => [i + 1, choice]));
  }
  if (lobby.started && lobby.players.length === 0 && (!room.game || room.flow.screen === 'intro')) {
    room.game = null;
    room.buffers = [];
    room.log = createSnapshotLog();
    room.participants = [];
    room.flow.lobby = createLobby();
    room.flow.screen = 'lobby';
    room.flow.menuIndex = 0;
    room.flow.results = null;
  }
}

/**
 * The presses the room's flow gets this tick, and whether the players or a
 * member's couch player count changed.
 *
 * - In the lobby every member's devices count. A join press from a device
 *   past the couch players its member announced makes room for one more
 *   while the room has space, and is dropped when it's full, so the room
 *   never holds more players than its members' counts add up to.
 * - On the level select and the results, a member without any player (they
 *   joined while a round ran, or only watched) joins one with a join press,
 *   so they play the next round whatever the host picks. That press does
 *   nothing else. More couch players join through Change players.
 * - Everywhere else (level select, intro, pause, results, and pausing a
 *   round) only the host's devices count. After the lobby the flow only
 *   takes devices with a player, so a host without one (say, a spectator
 *   who became host when the host left) has their presses passed on as
 *   player 1's device: someone can always drive the menus.
 */
export function allowedPresses(
  room: RoomState,
  presses: readonly DevicePress[],
): { presses: DevicePress[]; changed: boolean } {
  const screen = room.flow.screen;
  if (screen === 'lobby') return lobbyPresses(room, presses);
  if (screen === 'intro') {
    const host = hostOf(room);
    const bound = new Set(room.flow.lobby.players.map((p) => p.deviceId));
    return {
      presses: presses.filter(
        (p) =>
          bound.has(p.deviceId) &&
          (!(p.dash || p.menu) || (host && isFromSession(p.deviceId, host.sessionId))),
      ),
      changed: false,
    };
  }
  let changed = false;
  let rest = presses;
  if (screen === 'levelSelect' || screen === 'results') {
    const joined = joinBetweenRounds(room, presses);
    if (joined.size > 0) {
      changed = true;
      rest = presses.filter((p) => !joined.has(p.deviceId.slice(0, p.deviceId.indexOf(':'))));
    }
  }
  const host = hostOf(room);
  if (!host) return { presses: [], changed };
  const bound = new Set(room.flow.lobby.players.map((p) => p.deviceId));
  const stand = room.flow.lobby.players[0]?.deviceId;
  const own = rest
    .filter((p) => isFromSession(p.deviceId, host.sessionId))
    .flatMap((p) => {
      if (bound.has(p.deviceId)) return [p];
      return stand === undefined ? [] : [{ ...p, deviceId: stand }];
    });
  return { presses: own, changed };
}

/** The lobby's presses: everyone's, with join presses checked against the room's size. */
function lobbyPresses(
  room: RoomState,
  presses: readonly DevicePress[],
): { presses: DevicePress[]; changed: boolean } {
  const bound = new Set(room.flow.lobby.players.map((p) => p.deviceId));
  const joining = new Map<string, number>();
  const groups = new Set<string>();
  let changed = false;
  const allowed = presses.filter((press) => {
    if (!press.join || bound.has(press.deviceId)) return true;
    // The lobby joins one device per join group per tick (Enter presses both keyboard schemes).
    const group = `${press.deviceId.slice(0, press.deviceId.indexOf(':'))}/${press.joinGroup}`;
    if (groups.has(group)) return true;
    const member = room.members.find((m) => isFromSession(press.deviceId, m.sessionId));
    if (!member) return false;
    const count = (joining.get(member.sessionId) ?? playerIdsOf(room, member.sessionId).length) + 1;
    if (count > member.localPlayers) {
      if (playerCount(room) >= MAX_PLAYERS) return false;
      member.localPlayers++;
      changed = true;
    }
    joining.set(member.sessionId, count);
    groups.add(group);
    return true;
  });
  return { presses: allowed, changed };
}

/**
 * Join presses on the level select and results from members without a
 * player: each such member gets one (while the room has space). Returns the
 * sessions that joined; their presses this tick are used up.
 */
function joinBetweenRounds(room: RoomState, presses: readonly DevicePress[]): Set<string> {
  const lobby = room.flow.lobby;
  const joined = new Set<string>();
  for (const press of presses) {
    if (!press.join || lobby.players.length >= MAX_PLAYERS) continue;
    const member = room.members.find((m) => isFromSession(press.deviceId, m.sessionId));
    if (!member || joined.has(member.sessionId)) continue;
    if (playerIdsOf(room, member.sessionId).length > 0) continue;
    lobby.players.push({ playerId: lobby.players.length + 1, deviceId: press.deviceId });
    joined.add(member.sessionId);
  }
  return joined;
}
