/**
 * One online room as plain data: who is in it, the room's screen flow and
 * round, and the server clock. The functions that change it live next door
 * and each return the messages to send; `GameRoom.ts` only delivers them
 * over Colyseus.
 *
 * - `membership.ts`: joining, leaving, dropping, rejoining, the message budget.
 * - `lobby.ts`: the roster (device bindings, roles, ready) and who drives the menus.
 * - `round.ts`: the server tick: flow, sim, input buffers, snapshots, results.
 * - `roomLogic.ts`: routes a member's message to the right one.
 *
 * Like `src/sim`, nothing in here reads the real clock or `Math.random`:
 * time comes in as `deltaMs`, the round seed is handed in, so tests can play
 * a room tick by tick.
 */

import { type Flow, createFlow } from '../src/flow/flow';
import { type LevelRecord, type SaveData, createSave } from '../src/flow/save';
import type { DevicePress } from '../src/input/controller';
import type { InputBuffer } from '../src/net/inputBuffer';
import type { ErrorCode, ServerMessage } from '../src/net/protocol';
import { type SnapshotLog, createSnapshotLog, takeSnapshot } from '../src/net/snapshot';
import { TICKS_PER_SECOND } from '../src/sim/balance';
import type { LevelResult } from '../src/sim/orders';
import type { GameState } from '../src/sim/state';

export const TICK_MS = 1000 / TICKS_PER_SECOND;

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

/** Couch players all members announced, leaving out one session if given. */
export function playerCount(room: RoomState, except?: string): number {
  return room.members
    .filter((m) => m.sessionId !== except)
    .reduce((sum, m) => sum + m.localPlayers, 0);
}

export function errorTo(to: string, code: ErrorCode, message: string): Outgoing {
  return { to, message: { type: 'error', code, message } };
}

/** The loaded round's `roundStart`, for everyone (`to: null`, all counted) or one session. */
export function roundStartTo(room: RoomState, to: string | null): Outgoing[] {
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
