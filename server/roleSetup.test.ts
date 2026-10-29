import { describe, expect, it } from 'vitest';
import { commandFailureText } from '../src/flow/commands';
import { COUNTDOWN_MS } from '../src/flow/flow';
import { selection } from '../src/flow/roster';
import type { DevicePress } from '../src/input/controller';
import { parseClientMessage, PROTOCOL_VERSION } from '../src/net/protocol';
import {
  createRoomState,
  dropMember,
  handleMessage,
  joinRoom,
  leaveRoom,
  rejoinMember,
  stepRoom,
  TICK_MS,
  type RoomState,
} from './roomLogic';

function join(room: RoomState, sessionId: string): void {
  expect(
    joinRoom(room, sessionId, {
      type: 'hello',
      protocol: PROTOCOL_VERSION,
      userId: sessionId,
      displayName: sessionId,
      localPlayers: 1,
    }).ok,
  ).toBe(true);
}
function menu(
  room: RoomState,
  sessionId: string,
  deviceId: string,
  buttons: Partial<DevicePress>,
): void {
  handleMessage(room, sessionId, {
    type: 'menu',
    presses: [
      {
        deviceId,
        joinGroup: deviceId,
        join: false,
        interact: false,
        menu: false,
        dash: false,
        nav: { x: 0, y: 0 },
        ...buttons,
      },
    ],
  });
  stepRoom(room);
}
function intro(): RoomState {
  const room = createRoomState('ABCD', 9);
  join(room, 'host');
  join(room, 'guest');
  menu(room, 'host', 'pad-0', { join: true });
  menu(room, 'host', 'pad-1', { join: true });
  menu(room, 'guest', 'kb-left', { join: true });
  menu(room, 'guest', 'kb-right', { join: true });
  expect(room.flow.screen).toBe('lobby');
  menu(room, 'host', 'pad-0', { interact: true });
  menu(room, 'host', 'pad-0', { interact: true });
  expect(room.flow.screen).toBe('intro');
  return room;
}
function ready(room: RoomState, sessionId: string, playerId: number): void {
  expect(handleMessage(room, sessionId, { type: 'ready', playerId, ready: true })).toEqual([]);
}
function everyoneReady(room: RoomState): void {
  for (const p of room.flow.lobby.players) {
    const owner = p.deviceId.split(':')[0];
    if (!owner) throw new Error('Missing owner');
    if (room.members.some((m) => m.sessionId === owner && m.connected))
      ready(room, owner, p.playerId);
  }
  stepRoom(room);
}

describe('authoritative role setup', () => {
  it('validates role/player ids and ready booleans, and bumps incompatible protocol', () => {
    expect(PROTOCOL_VERSION).toBe(6);
    for (const raw of [
      { type: 'role', playerId: 1, roleId: 'wizard' },
      { type: 'role', playerId: 0, roleId: 'qa' },
      { type: 'role', playerId: 5, roleId: 'frontend' },
      { type: 'ready', playerId: 2, ready: 1 },
      { type: 'takeover', playerId: 1, deviceId: 'other:pad-1' },
    ])
      expect(parseClientMessage(raw).ok).toBe(false);
    expect(parseClientMessage({ type: 'role', playerId: 2, roleId: 'qa' })).toMatchObject({
      ok: true,
    });
  });

  it('owns all couch slots, supports duplicates, invalidates ready, locks the actual created game', () => {
    const room = intro();
    expect(handleMessage(room, 'guest', { type: 'role', playerId: 1, roleId: 'qa' })).toMatchObject(
      [{ message: { code: 'notOwner' } }],
    );
    for (const id of [1, 2]) {
      expect(
        handleMessage(room, 'host', { type: 'role', playerId: id, roleId: 'frontend' }),
      ).toEqual([]);
      ready(room, 'host', id);
    }
    ready(room, 'guest', 3);
    stepRoom(room);
    expect(room.flow.screen).toBe('intro');
    handleMessage(room, 'host', { type: 'role', playerId: 2, roleId: 'backend' });
    expect(selection(room.flow.lobby, 2).ready).toBe(false);
    ready(room, 'guest', 4);
    stepRoom(room);
    expect(room.flow.screen).toBe('intro');
    const seed = room.game?.seed;
    ready(room, 'host', 2);
    const out = stepRoom(room);
    expect(room.flow.screen).toBe('countdown');
    expect(room.game?.seed).toBe(seed);
    expect(room.game?.players.map((p) => p.roleId)).toEqual([
      'frontend',
      'backend',
      'generalist',
      'generalist',
    ]);
    expect(out.find((o) => o.message.type === 'roundStart')).toMatchObject({
      message: {
        snapshot: {
          state: {
            players: [
              { roleId: 'frontend' },
              { roleId: 'backend' },
              { roleId: 'generalist' },
              { roleId: 'generalist' },
            ],
          },
        },
      },
    });
    expect(
      handleMessage(room, 'host', { type: 'role', playerId: 1, roleId: 'platform' }),
    ).toMatchObject([
      { message: { code: 'roundRunning', message: commandFailureText('rosterLocked') } },
    ]);
    for (let i = 0; i <= COUNTDOWN_MS / TICK_MS + 1; i++) stepRoom(room);
    expect(room.flow.screen).toBe('playing');
    expect(
      handleMessage(room, 'guest', { type: 'ready', playerId: 3, ready: false }),
    ).toMatchObject([{ message: { code: 'roundRunning' } }]);
    menu(room, 'host', 'pad-0', { menu: true });
    menu(room, 'host', 'pad-0', { nav: { x: 0, y: 1 } });
    menu(room, 'host', 'pad-0', { interact: true });
    expect(room.flow.screen).toBe('intro');
    expect(selection(room.flow.lobby, 2)).toEqual({ roleId: 'backend', ready: false });
  });

  it('disconnect clears readiness, connected slots can continue, rejoin preserves locked roles', () => {
    const room = intro();
    handleMessage(room, 'guest', { type: 'role', playerId: 3, roleId: 'qa' });
    ready(room, 'guest', 3);
    dropMember(room, 'guest');
    expect(selection(room.flow.lobby, 3)).toEqual({ roleId: 'qa', ready: false });
    expect(handleMessage(room, 'guest', { type: 'ready', playerId: 4, ready: true })).toEqual([]);
    everyoneReady(room);
    expect(room.flow.screen).toBe('countdown');
    const out = rejoinMember(room, 'guest');
    expect(out.find((o) => o.message.type === 'roundStart')).toMatchObject({
      message: { snapshot: { state: { players: [{}, {}, { roleId: 'qa' }, {}] } } },
    });
    expect(
      handleMessage(room, 'guest', { type: 'role', playerId: 3, roleId: 'backend' }),
    ).toMatchObject([{ message: { code: 'roundRunning' } }]);
  });

  it('reconnect before countdown requires fresh ready, and stale disconnected menu input is discarded', () => {
    const room = intro();
    ready(room, 'guest', 3);
    dropMember(room, 'guest');
    rejoinMember(room, 'guest');
    ready(room, 'host', 1);
    ready(room, 'host', 2);
    ready(room, 'guest', 4);
    stepRoom(room);
    expect(room.flow.screen).toBe('intro');
    ready(room, 'guest', 3);
    stepRoom(room);
    expect(room.flow.screen).toBe('countdown');
  });

  it('reclaims only an owned gamepad slot, preserving role/ready and refusing occupied or foreign devices', () => {
    const room = intro();
    handleMessage(room, 'host', { type: 'role', playerId: 1, roleId: 'platform' });
    ready(room, 'host', 1);
    expect(
      handleMessage(room, 'guest', { type: 'takeover', playerId: 1, deviceId: 'pad-3' }),
    ).toMatchObject([{ message: { code: 'notOwner' } }]);
    expect(
      handleMessage(room, 'host', { type: 'takeover', playerId: 1, deviceId: 'pad-1' }),
    ).toMatchObject([{ message: { code: 'badMessage' } }]);
    expect(
      handleMessage(room, 'host', { type: 'takeover', playerId: 1, deviceId: 'pad-3' }),
    ).toEqual([]);
    expect(room.flow.lobby.players[0]?.deviceId).toBe('host:pad-3');
    expect(selection(room.flow.lobby, 1)).toEqual({ roleId: 'platform', ready: true });
  });

  it('prunes departed players at readiness, renumbers choices by identity and does not deadlock an empty team', () => {
    const room = intro();
    handleMessage(room, 'guest', { type: 'role', playerId: 3, roleId: 'qa' });
    leaveRoom(room, 'host');
    expect(selection(room.flow.lobby, 1).roleId).toBe('qa');
    everyoneReady(room);
    expect(room.game?.players.map((p) => p.roleId)).toEqual(['qa', 'generalist']);
    expect(room.flow.screen).toBe('countdown');
    const empty = intro();
    leaveRoom(empty, 'host');
    leaveRoom(empty, 'guest');
    expect(empty.game).toBeNull();
    expect(empty.flow.screen).toBe('lobby');
  });

  it('late spectators cannot join during confirmation or drive another player even when host', () => {
    const room = intro();
    // Free a reserved seat so a browser can watch without a slot.
    leaveRoom(room, 'guest');
    join(room, 'watcher');
    menu(room, 'watcher', 'kb-left', { join: true, nav: { x: 1, y: 0 } });
    expect(room.flow.lobby.players).toHaveLength(2);
    expect(
      handleMessage(room, 'watcher', { type: 'role', playerId: 1, roleId: 'qa' }),
    ).toMatchObject([{ message: { code: 'notOwner' } }]);
    everyoneReady(room);
    menu(room, 'watcher', 'kb-left', { interact: true });
    expect(room.game?.players.map((p) => p.roleId)).toEqual(['generalist', 'generalist']);
  });
});
