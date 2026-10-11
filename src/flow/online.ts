/**
 * This browser's side of an online room, as plain data: the connection's
 * status, who is in the room, the room's unlocks, and the room's screen flow
 * as the server last sent it. The client doesn't run a flow of its own while
 * online: it shows this one and sends its presses to the server.
 *
 * Pure like the rest of `src/flow`: the scene feeds in what the network
 * wrapper (`src/net/client.ts`) reports.
 */

import type { DevicePress } from '../input/controller';
import type { LobbyMember, ServerMessage } from '../net/protocol';
import { TICKS_PER_SECOND } from '../sim/balance';
import type { PlayerId } from '../sim/state';
import type { Flow, OnlineError, Screen } from './flow';
import type { LevelRecord } from './save';

/** How this browser got into the room. */
export type OnlineRole = 'host' | 'join';

export type OnlineStatus =
  /** Creating or joining the room. */
  | 'connecting'
  | 'connected'
  /** The connection dropped; the network library is trying to get it back. */
  | 'reconnecting'
  /** Over: left, refused or lost (see `error`). */
  | 'closed';

export interface OnlineState {
  role: OnlineRole;
  status: OnlineStatus;
  /** Why it closed or never opened; `null` while all is well or after leaving on purpose. */
  error: OnlineError | null;
  /** This browser's session in the room, once connected. */
  sessionId: string | null;
  joinCode: string | null;
  /** In join order; the host has `isHost`. */
  members: LobbyMember[];
  /** The room's progress (the host's levels): what the level select shows. */
  levels: Record<string, LevelRecord>;
  /** The room's flow from the last snapshot; `null` until the first one. */
  flow: Flow | null;
  /** The newest server tick heard of. */
  serverTick: number;
  /** The level of the round loaded on the server, if any. */
  levelId: string | null;
}

export function createOnline(role: OnlineRole): OnlineState {
  return {
    role,
    status: 'connecting',
    error: null,
    sessionId: null,
    joinCode: null,
    members: [],
    levels: {},
    flow: null,
    serverTick: 0,
    levelId: null,
  };
}

/** The room was created or joined. */
export function onlineConnected(state: OnlineState, sessionId: string, joinCode: string): void {
  state.status = 'connected';
  state.error = null;
  state.sessionId = sessionId;
  state.joinCode = joinCode;
}

/** The connection changed; an error says why it closed. */
export function setOnlineStatus(
  state: OnlineState,
  status: OnlineStatus,
  error: OnlineError | null = null,
): void {
  state.status = status;
  if (status === 'closed') state.error = error;
}

/**
 * What a refused join's code (an `ErrorCode`, or any other text) means
 * for the player. Our own codes come through; anything else (the library's
 * own errors) means the server couldn't be reached or answered something we
 * don't understand.
 */
export function onlineErrorFromCode(code: string): OnlineError {
  switch (code) {
    case 'wrongCode':
    case 'roomFull':
    case 'protocolMismatch':
      return code;
    default:
      return 'unreachable';
  }
}

/**
 * Applies a message from the server. Returns whether anything shown
 * changed (a snapshot whose flow is the same as before changes nothing).
 */
export function applyServerMessage(state: OnlineState, message: ServerMessage): boolean {
  switch (message.type) {
    case 'welcome':
      state.sessionId = message.sessionId;
      state.joinCode = message.joinCode;
      state.serverTick = Math.max(state.serverTick, message.serverTick);
      return true;
    case 'lobby':
      state.joinCode = message.joinCode;
      state.members = message.members;
      state.levels = message.levels;
      return true;
    case 'snapshot': {
      state.serverTick = Math.max(state.serverTick, message.serverTick);
      const same =
        state.flow !== null && JSON.stringify(state.flow) === JSON.stringify(message.flow);
      state.flow = message.flow;
      if (!message.game) state.levelId = null;
      return !same;
    }
    case 'roundStart':
      state.levelId = message.levelId;
      state.serverTick = Math.max(state.serverTick, message.snapshot.serverTick);
      return true;
    case 'pong':
    case 'error':
      return false;
  }
}

/** The room's clock in ms, for the countdown and the results delay (the flow's `nowMs`). */
export function onlineNowMs(state: OnlineState): number {
  return (state.serverTick * 1000) / TICKS_PER_SECOND;
}

export function onlineHost(state: OnlineState): LobbyMember | undefined {
  return state.members.find((m) => m.isHost);
}

export function isOnlineHost(state: OnlineState): boolean {
  return state.sessionId !== null && onlineHost(state)?.sessionId === state.sessionId;
}

/** Screens only the host's devices drive online (the server ignores everyone else's presses). */
export const HOST_SCREENS: readonly Screen[] = ['levelSelect', 'intro', 'paused', 'results'];

/** This browser waits for the host: the room is on a screen only the host drives. */
export function hostIsChoosing(state: OnlineState): boolean {
  const screen = state.flow?.screen;
  return screen !== undefined && HOST_SCREENS.includes(screen) && !isOnlineHost(state);
}

/** A couch player of a member, with the device id as it is on that member's machine. */
export interface OnlinePlayer {
  playerId: PlayerId;
  deviceId: string;
}

export interface OnlineMemberView {
  member: LobbyMember;
  /** This browser. */
  isYou: boolean;
  /** The member's joined couch players, in player order. */
  players: OnlinePlayer[];
}

/**
 * Everyone in the room with their joined players. Device ids in the room are
 * `<sessionId>:<deviceId>`; the part after the colon is the member's own.
 */
export function membersWithPlayers(state: OnlineState): OnlineMemberView[] {
  const players = state.flow?.lobby.players ?? [];
  return state.members.map((member) => {
    const prefix = `${member.sessionId}:`;
    return {
      member,
      isYou: member.sessionId === state.sessionId,
      players: players
        .filter((p) => p.deviceId.startsWith(prefix))
        .map((p) => ({ playerId: p.playerId, deviceId: p.deviceId.slice(prefix.length) })),
    };
  });
}

/**
 * The players bound to this browser's devices, with the local device ids:
 * whose inputs this machine sends during a round. Empty for a spectator.
 */
export function localBindings(state: OnlineState): OnlinePlayer[] {
  return membersWithPlayers(state).find((m) => m.isYou)?.players ?? [];
}

function isBack(press: DevicePress): boolean {
  return press.dash || press.menu;
}

/**
 * What this frame's presses mean online: `send` goes to the server as a
 * `menu` message, `leave` leaves the room. Back on the room's lobby leaves
 * (as it goes back to the title on the couch); so does back while
 * connecting, reconnecting or after the room closed. Everything else is the
 * server's to judge, so it all goes there.
 */
export function onlineMenuPresses(
  state: OnlineState,
  presses: readonly DevicePress[],
): { send: DevicePress[]; leave: boolean } {
  if (state.status !== 'connected' || state.flow === null) {
    return { send: [], leave: presses.some(isBack) };
  }
  if (state.flow.screen === 'lobby') {
    return { send: presses.filter((p) => !isBack(p)), leave: presses.some(isBack) };
  }
  return { send: [...presses], leave: false };
}
