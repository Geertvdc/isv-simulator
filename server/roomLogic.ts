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
import { createLobby } from '../src/input/lobby';
import { configureRoster, rolesForRoster, selection } from '../src/flow/roster';
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
import { type GameState, type InputCommand, type PlayerId, createGame } from '../src/sim/state';
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
  /** `false` while their connection is down and the room waits for them to come back. */
  connected: boolean;
  /** Messages they may still send right now (a token bucket, refilled every tick). */
  budget: number;
  /** Messages dropped for going over the budget. */
  dropped: number;
}

/** Someone in the room when a round started: the round counts for them. */
export interface Participant {
  sessionId: string;
  profileId: string | null;
  displayName: string;
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
  /** Every round lasts this many ticks instead of its level's length (dev and tests); `null`: as the level says. */
  roundTicks: number | null;
  /** The loaded round's id, counting up per room (0 before the first). */
  roundId: number;
  /** Who was in the room when the loaded round started: it counts for them. */
  participants: Participant[];
  /** The last server tick someone pressed or moved anything. */
  lastActivityTick: number;
  /** Set when the room should close (nobody did anything for too long); `GameRoom` closes it. */
  closing: 'idle' | null;
}

/** How a room plays, set when the server starts. */
export interface RoomOptions {
  /** Every round lasts this many ticks (`ROUND_SECONDS` on the server, for trying things out and tests). */
  roundTicks?: number;
}

/** A message to one session, or to everyone in the room (`to: null`). */
export interface Outgoing {
  to: string | null;
  message: ServerMessage;
}

export type JoinResult =
  { ok: true; out: Outgoing[] } | { ok: false; code: ErrorCode; reason: string };

/** A fresh room, on its lobby screen: everyone joining goes straight there. */
export function createRoomState(
  joinCode: string,
  seed: number,
  options: RoomOptions = {},
): RoomState {
  const flow = createFlow();
  flow.screen = 'lobby';
  flow.awake = true;
  flow.online = true;
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
    roundTicks: options.roundTicks ?? null,
    roundId: 0,
    participants: [],
    lastActivityTick: 0,
    closing: null,
  };
}

/**
 * The host: the earliest joined member whose connection is up, so someone
 * can always drive the menus while the host reconnects; the earliest joined
 * member when nobody is connected.
 */
export function hostOf(room: RoomState): Member | undefined {
  return room.members.find((m) => m.connected) ?? room.members[0];
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

function errorTo(to: string, code: ErrorCode, message: string): Outgoing {
  return { to, message: { type: 'error', code, message } };
}

/** The loaded round's `roundStart`, for everyone (`to: null`, all counted) or one session. */
function roundStartTo(room: RoomState, to: string | null): Outgoing[] {
  const game = room.game;
  if (!game) return [];
  // Not `takeSnapshot`: that would steal the events meant for the next snapshot.
  const snapshot = takeSnapshot({ events: [] }, game, room.serverTick);
  const counted = to === null || room.participants.some((p) => p.sessionId === to);
  return [
    {
      to,
      message: {
        type: 'roundStart',
        roundId: room.roundId,
        counted,
        levelId: game.levelId,
        level: game.level,
        snapshot,
      },
    },
  ];
}

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
 * Drops the players of devices whose member left, renumbering the others in
 * join order (player ids must be 1..n for the spawns). A room left without
 * players after the lobby goes back to the lobby, so someone joins again.
 */
function pruneDeparted(room: RoomState): void {
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
 * A member's connection dropped: they stay in the room (with their players,
 * who stand still) while it waits for them to reconnect. Menu authority
 * moves to the next connected member meanwhile (`hostOf`).
 */
export function dropMember(room: RoomState, sessionId: string): Outgoing[] {
  const member = room.members.find((m) => m.sessionId === sessionId);
  if (!member?.connected) return [];
  member.connected = false;
  for (const id of playerIdsOf(room, sessionId)) {
    if (room.flow.screen === 'intro' || room.flow.screen === 'lobby') {
      configureRoster(room.flow.lobby, room.flow.screen, {
        type: 'ready',
        playerId: id,
        ready: false,
      });
    }
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
    case 'ready': {
      if (!playerIdsOf(room, sessionId).includes(message.playerId)) {
        return [errorTo(sessionId, 'notOwner', 'You can only configure your own player slots.')];
      }
      const result = configureRoster(room.flow.lobby, room.flow.screen, message);
      if (!result.ok) return [errorTo(sessionId, 'roundRunning', result.reason)];
      room.lastActivityTick = room.serverTick;
      return [];
    }
    case 'takeover': {
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
          errorTo(
            sessionId,
            'badMessage',
            'Controller is already bound or the slot is not a gamepad.',
          ),
        ];
      }
      binding.deviceId = deviceId;
      return [];
    }
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
      if (message.presses.length > 0) room.lastActivityTick = room.serverTick;
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
function allowedPresses(
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
