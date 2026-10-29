/** Helpers for room tests: joining, pressing, stepping and playing a room tick by tick. */

import { expect } from 'vitest';
import { COUNTDOWN_MS } from '../src/flow/flow';
import type { DevicePress } from '../src/input/controller';
import { type HelloMessage, PROTOCOL_VERSION, type ServerMessage } from '../src/net/protocol';
import { TICKS_PER_SECOND } from '../src/sim/balance';
import { joinRoom } from './membership';
import { type Outgoing, type RoomState, TICK_MS, createRoomState } from './room';
import { handleMessage } from './roomLogic';
import { stepRoom } from './round';

/** Profile ids (UUID v4) for members whose rounds count for a profile. */
export const ADA = '3f2b8c1e-9d4a-4e6b-8a1c-2b3c4d5e6f70';
export const GRACE = 'a1b2c3d4-e5f6-4a7b-9c8d-0e1f2a3b4c5d';
export const LATE = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';

export function hello(localPlayers = 1, name = 'Ada'): HelloMessage {
  return {
    type: 'hello',
    protocol: PROTOCOL_VERSION,
    userId: `user-${name}`,
    displayName: name,
    localPlayers,
  };
}

export function press(deviceId: string, buttons: Partial<DevicePress> = {}): DevicePress {
  return {
    deviceId,
    joinGroup: deviceId.startsWith('kb') ? 'kb' : deviceId,
    join: false,
    interact: false,
    dash: false,
    menu: false,
    nav: { x: 0, y: 0 },
    ...buttons,
  };
}

export function join(room: RoomState, sessionId: string, localPlayers = 1): Outgoing[] {
  const result = joinRoom(room, sessionId, hello(localPlayers, sessionId));
  if (!result.ok) throw new Error(result.reason);
  return result.out;
}

/** Joins with one couch player and a user id (a profile id when it's a UUID v4). */
export function joinAs(room: RoomState, sessionId: string, userId?: string): void {
  const result = joinRoom(room, sessionId, {
    ...hello(1, sessionId),
    userId: userId ?? sessionId,
  });
  if (!result.ok) throw new Error(result.reason);
}

/** Sends the presses as a `menu` message and runs one tick. */
export function menu(room: RoomState, sessionId: string, ...presses: DevicePress[]): Outgoing[] {
  const out = handleMessage(room, sessionId, { type: 'menu', presses });
  return [...out, ...stepRoom(room)];
}

export function steps(room: RoomState, n: number): Outgoing[] {
  const out: Outgoing[] = [];
  for (let i = 0; i < n; i++) out.push(...stepRoom(room));
  return out;
}

export function messages<T extends ServerMessage['type']>(
  out: readonly Outgoing[],
  type: T,
): Extract<ServerMessage, { type: T }>[] {
  return out
    .map((o) => o.message)
    .filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type);
}

/** A room with one member on the keyboard, playing the first level. */
export function playingRoom(): RoomState {
  const room = createRoomState('ABCD', 1);
  join(room, 'host');
  menu(room, 'host', press('kb-left', { join: true }));
  menu(room, 'host', press('kb-left', { interact: true }));
  expect(room.flow.screen).toBe('levelSelect');
  menu(room, 'host', press('kb-left', { interact: true }));
  expect(room.flow.screen).toBe('intro');
  menu(room, 'host', press('kb-left', { interact: true }));
  expect(room.flow.screen).toBe('countdown');
  steps(room, Math.ceil(COUNTDOWN_MS / TICK_MS) + 1);
  expect(room.flow.screen).toBe('playing');
  return room;
}

/** Host and guest each with a keyboard player (host is player 1), on the level select. */
export function twoPlayers(): RoomState {
  const room = createRoomState('ABCD', 1);
  joinAs(room, 'host', ADA);
  joinAs(room, 'guest', GRACE);
  menu(room, 'host', press('kb-left', { join: true }));
  menu(room, 'guest', press('kb-left', { join: true }));
  menu(room, 'host', press('kb-left', { interact: true }));
  expect(room.flow.screen).toBe('levelSelect');
  return room;
}

/** From the level select into a running round of the first level, driven by `by`. */
export function play(room: RoomState, by = 'host', device = 'kb-left'): void {
  menu(room, by, press(device, { interact: true }));
  expect(room.flow.screen).toBe('intro');
  for (const binding of room.flow.lobby.players) {
    const [sessionId, deviceId] = binding.deviceId.split(':');
    if (sessionId && deviceId) menu(room, sessionId, press(deviceId, { interact: true }));
  }
  steps(room, Math.ceil(COUNTDOWN_MS / TICK_MS) + 1);
  expect(room.flow.screen).toBe('playing');
}

/** Plays the loaded round to its results, and waits until the results take presses. */
export function finish(room: RoomState): void {
  const game = room.game;
  if (!game) throw new Error('no round');
  steps(room, game.settings.durationTicks - game.tick + 5);
  expect(room.flow.screen).toBe('results');
  // The results take presses after a moment.
  steps(room, TICKS_PER_SECOND * 3);
}

/** One tick's input walking the player right. */
export function walk(room: RoomState, sessionId: string, playerId: number): void {
  handleMessage(room, sessionId, {
    type: 'inputs',
    inputs: [
      {
        playerId,
        tick: room.serverTick,
        move: { x: 1, y: 0 },
        interact: false,
        work: false,
        dash: false,
      },
    ],
  });
}
