/** Routes a member's message to the room logic it belongs to (see `room.ts`). */

import {
  type FlowContext,
  type FlowEffect,
  finishRound,
  isRoundRunning,
  updateFlow,
} from '../src/flow/flow';
import { type ChapterInfo, recordLevel } from '../src/flow/save';
import { rolesForRoster } from '../src/flow/roster';
import { createInputBuffer, pushInput, takeInput } from '../src/net/inputBuffer';
import { parseClientMessage } from '../src/net/protocol';
import { createSnapshotLog, isSnapshotTick, recordTick, takeSnapshot } from '../src/net/snapshot';
import { NET_ROOM_IDLE_MS, NET_SERVER_MAX_CATCHUP_TICKS } from '../src/sim/balance';
import type { LevelResult } from '../src/sim/orders';
import { CHAPTERS, LEVELS } from '../src/sim/levels';
import { type GameState, type InputCommand, createGame } from '../src/sim/state';
import { tick } from '../src/sim/tick';
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
import { refillBudgets, renameMember, spendMessage, updateMember } from './membership';
import {
  type Outgoing,
  type ProfileWrite,
  type RoomState,
  TICK_MS,
  errorTo,
  hostOf,
  roundStartTo,
} from './room';

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
export {
  type JoinResult,
  dropMember,
  joinRoom,
  leaveRoom,
  rejoinMember,
  setMemberProfile,
} from './membership';

/** Absorbs float error so exactly N ticks of time always runs N ticks. */
const EPSILON = 1e-6;

const LEVEL_IDS: readonly string[] = LEVELS.map((l) => l.id);
const CHAPTER_INFO: readonly ChapterInfo[] = CHAPTERS.map((c) => ({
  levelIds: c.levels.map((l) => l.id),
  starGate: c.starGate,
}));

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

/** A message from a member: checked first, refused with an `error` when it doesn't parse. */
export function handleMessage(room: RoomState, sessionId: string, raw: unknown): Outgoing[] {
  const member = room.members.find((m) => m.sessionId === sessionId);
  if (!member?.connected) return [];
  // A flood is dropped before anything else looks at it.
  if (!spendMessage(member)) return [];
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
      return renameMember(room, member, message.displayName);
  }
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
  refillBudgets(room);
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
