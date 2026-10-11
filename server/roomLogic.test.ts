import { describe, expect, it } from 'vitest';
import { COUNTDOWN_MS } from '../src/flow/flow';
import type { DevicePress } from '../src/input/controller';
import {
  type HelloMessage,
  PROTOCOL_VERSION,
  type ServerMessage,
  type SnapshotMessage,
} from '../src/net/protocol';
import { NET_SERVER_MAX_CATCHUP_TICKS, NET_SNAPSHOT_EVERY_TICKS } from '../src/sim/balance';
import { MAX_PLAYERS } from '../src/sim/level';
import {
  type Outgoing,
  type RoomState,
  TICK_MS,
  advanceRoom,
  createRoomState,
  handleMessage,
  hostOf,
  joinRoom,
  leaveRoom,
  playerIdsOf,
  stepRoom,
} from './roomLogic';

function hello(localPlayers = 1, name = 'Ada'): HelloMessage {
  return {
    type: 'hello',
    protocol: PROTOCOL_VERSION,
    userId: `user-${name}`,
    displayName: name,
    localPlayers,
  };
}

function press(deviceId: string, buttons: Partial<DevicePress> = {}): DevicePress {
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

function join(room: RoomState, sessionId: string, localPlayers = 1): Outgoing[] {
  const result = joinRoom(room, sessionId, hello(localPlayers, sessionId));
  if (!result.ok) throw new Error(result.reason);
  return result.out;
}

function menu(room: RoomState, sessionId: string, ...presses: DevicePress[]): Outgoing[] {
  const out = handleMessage(room, sessionId, { type: 'menu', presses });
  return [...out, ...stepRoom(room)];
}

function steps(room: RoomState, n: number): Outgoing[] {
  const out: Outgoing[] = [];
  for (let i = 0; i < n; i++) out.push(...stepRoom(room));
  return out;
}

function messages<T extends ServerMessage['type']>(
  out: readonly Outgoing[],
  type: T,
): Extract<ServerMessage, { type: T }>[] {
  return out
    .map((o) => o.message)
    .filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type);
}

/** A room with one member on the keyboard, playing the first level. */
function playingRoom(): RoomState {
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

describe('joining', () => {
  it('welcomes the newcomer and tells everyone who is in', () => {
    const room = createRoomState('ABCD', 1);
    const out = join(room, 'a');
    expect(out[0]).toMatchObject({
      to: 'a',
      message: { type: 'welcome', sessionId: 'a', joinCode: 'ABCD' },
    });
    const lobby = messages(out, 'lobby')[0];
    expect(lobby?.members).toEqual([
      { sessionId: 'a', displayName: 'a', localPlayers: 1, isHost: true, connected: true },
    ]);
    // User ids never leave the server.
    expect(JSON.stringify(out)).not.toContain('user-');
  });

  it('makes the first member the host', () => {
    const room = createRoomState('ABCD', 1);
    join(room, 'a');
    const out = join(room, 'b');
    expect(hostOf(room)?.sessionId).toBe('a');
    expect(messages(out, 'lobby')[0]?.members.map((m) => m.isHost)).toEqual([true, false]);
  });

  it('counts couch players against the room size', () => {
    const room = createRoomState('ABCD', 1);
    join(room, 'a', 3);
    expect(joinRoom(room, 'b', hello(2))).toMatchObject({ ok: false, code: 'roomFull' });
    join(room, 'c', 1);
    expect(room.members.reduce((n, m) => n + m.localPlayers, 0)).toBe(MAX_PLAYERS);
    expect(joinRoom(room, 'd', hello(1))).toMatchObject({ ok: false, code: 'roomFull' });
  });

  it('refuses other protocol versions and bad hellos', () => {
    const room = createRoomState('ABCD', 1);
    expect(joinRoom(room, 'a', { ...hello(), protocol: PROTOCOL_VERSION + 1 })).toMatchObject({
      ok: false,
      code: 'protocolMismatch',
    });
    expect(joinRoom(room, 'a', { ...hello(), userId: 'no spaces' })).toMatchObject({
      ok: false,
      code: 'badMessage',
    });
    expect(joinRoom(room, 'a', { type: 'ping', id: 1, clientTimeMs: 0 })).toMatchObject({
      ok: false,
      code: 'badMessage',
    });
    expect(joinRoom(room, 'a', undefined)).toMatchObject({ ok: false, code: 'badMessage' });
    expect(room.members).toEqual([]);
  });

  it('sends the round to someone joining while it is loaded', () => {
    const room = playingRoom();
    const out = join(room, 'late');
    const start = messages(out, 'roundStart')[0];
    expect(start?.levelId).toBe(room.game?.levelId);
    expect(out.find((o) => o.message.type === 'roundStart')?.to).toBe('late');
  });

  it('updates name and couch players on a later hello, if they fit', () => {
    const room = createRoomState('ABCD', 1);
    join(room, 'a');
    join(room, 'b', 2);
    const out = handleMessage(room, 'a', hello(2, 'Grace'));
    expect(messages(out, 'lobby')[0]?.members[0]).toMatchObject({
      displayName: 'Grace',
      localPlayers: 2,
    });
    expect(messages(handleMessage(room, 'a', hello(3)), 'error')[0]?.code).toBe('roomFull');
  });
});

describe('leaving', () => {
  it('moves the host to the earliest joined member left', () => {
    const room = createRoomState('ABCD', 1);
    join(room, 'a');
    join(room, 'b');
    join(room, 'c');
    const out = leaveRoom(room, 'a');
    expect(hostOf(room)?.sessionId).toBe('b');
    expect(messages(out, 'lobby')[0]?.members.map((m) => [m.sessionId, m.isHost])).toEqual([
      ['b', true],
      ['c', false],
    ]);
    expect(leaveRoom(room, 'c').length).toBe(1);
    expect(leaveRoom(room, 'b')).toEqual([]);
    expect(leaveRoom(room, 'nobody')).toEqual([]);
  });

  it('drops the leaver from the lobby and renumbers the others', () => {
    const room = createRoomState('ABCD', 1);
    join(room, 'a');
    join(room, 'b', 2);
    menu(room, 'a', press('kb-left', { join: true }));
    menu(room, 'b', press('pad-0', { join: true }), press('pad-1', { join: true }));
    expect(room.flow.lobby.players.map((p) => p.playerId)).toEqual([1, 2, 3]);
    leaveRoom(room, 'a');
    expect(room.flow.lobby.players).toEqual([
      { playerId: 1, deviceId: 'b:pad-0' },
      { playerId: 2, deviceId: 'b:pad-1' },
    ]);
  });
});

describe('messages', () => {
  it('answers a ping with the server tick', () => {
    const room = createRoomState('ABCD', 1);
    join(room, 'a');
    steps(room, 5);
    expect(handleMessage(room, 'a', { type: 'ping', id: 7, clientTimeMs: 123.5 })).toEqual([
      { to: 'a', message: { type: 'pong', id: 7, clientTimeMs: 123.5, serverTick: 5 } },
    ]);
  });

  it('answers bad messages with an error and ignores strangers', () => {
    const room = createRoomState('ABCD', 1);
    join(room, 'a');
    expect(handleMessage(room, 'a', { type: 'nope' })).toMatchObject([
      { to: 'a', message: { type: 'error', code: 'badMessage' } },
    ]);
    expect(handleMessage(room, 'stranger', { type: 'ping', id: 1, clientTimeMs: 0 })).toEqual([]);
  });

  it('makes device ids room-unique, so two machines can both use kb-left', () => {
    const room = createRoomState('ABCD', 1);
    join(room, 'a');
    join(room, 'b');
    handleMessage(room, 'a', { type: 'menu', presses: [press('kb-left', { join: true })] });
    handleMessage(room, 'b', { type: 'menu', presses: [press('kb-left', { join: true })] });
    stepRoom(room);
    expect(room.flow.lobby.players).toEqual([
      { playerId: 1, deviceId: 'a:kb-left' },
      { playerId: 2, deviceId: 'b:kb-left' },
    ]);
    expect(playerIdsOf(room, 'b')).toEqual([2]);
  });

  it("can't bind more devices than the couch players a member announced", () => {
    const room = createRoomState('ABCD', 1);
    join(room, 'a', 1);
    menu(
      room,
      'a',
      press('kb-left', { join: true }),
      press('pad-0', { join: true }),
      press('pad-1', { join: true }),
    );
    expect(playerIdsOf(room, 'a')).toEqual([1]);
    menu(room, 'a', press('pad-2', { join: true }));
    expect(playerIdsOf(room, 'a')).toEqual([1]);
  });
});

describe('the clock', () => {
  it('runs one tick per 1000/60 ms over a long run of ragged frames', () => {
    const room = createRoomState('ABCD', 1);
    const frames = [16, 17, 16.7, 3, 30, 16, 0, 50, 1];
    let elapsed = 0;
    for (let i = 0; i < 6000; i++) {
      const dt = frames[i % frames.length] ?? 16;
      elapsed += dt;
      advanceRoom(room, dt);
    }
    expect(room.serverTick).toBe(Math.floor(elapsed / TICK_MS + 1e-6));
  });

  it('runs exactly the ticks due for whole tick times', () => {
    const room = createRoomState('ABCD', 1);
    for (let i = 0; i < 600; i++) advanceRoom(room, TICK_MS);
    expect(room.serverTick).toBe(600);
  });

  it('drops the backlog after a stall', () => {
    const room = createRoomState('ABCD', 1);
    advanceRoom(room, 10_000);
    expect(room.serverTick).toBe(NET_SERVER_MAX_CATCHUP_TICKS);
    advanceRoom(room, 0);
    expect(room.serverTick).toBe(NET_SERVER_MAX_CATCHUP_TICKS + 1);
  });

  it('sends a snapshot every few ticks, with the flow', () => {
    const room = createRoomState('ABCD', 1);
    join(room, 'a');
    const out = steps(room, NET_SNAPSHOT_EVERY_TICKS * 4);
    const snapshots = messages(out, 'snapshot');
    expect(snapshots.map((s) => s.serverTick)).toEqual([3, 6, 9, 12]);
    expect(snapshots[0]?.flow.screen).toBe('lobby');
    expect(snapshots[0]?.game).toBeNull();
    expect(out.every((o) => o.to === null)).toBe(true);
  });
});

describe('a round', () => {
  it('starts from the lobby with a roundStart holding the map', () => {
    const room = createRoomState('ABCD', 1);
    join(room, 'a');
    menu(room, 'a', press('kb-left', { join: true }));
    menu(room, 'a', press('kb-left', { interact: true }));
    const out = menu(room, 'a', press('kb-left', { interact: true }));
    const start = messages(out, 'roundStart')[0];
    expect(start?.levelId).toBe('garage');
    expect(start?.level.width).toBeGreaterThan(0);
    expect(start?.snapshot.state.players.map((p) => p.id)).toEqual([1]);
  });

  it('moves a player with their inputs, and only theirs', () => {
    const room = playingRoom();
    join(room, 'other');
    const startX = room.game?.players[0]?.pos.x ?? 0;
    const startTick = room.game?.tick ?? 0;
    let out: Outgoing[] = [];
    for (let i = 0; i < 30; i++) {
      const input = {
        playerId: 1,
        tick: room.serverTick,
        move: { x: 1, y: 0 },
        interact: false,
        work: false,
        dash: false,
      };
      // Not theirs to move: ignored.
      handleMessage(room, 'other', {
        type: 'inputs',
        inputs: [{ ...input, move: { x: -1, y: 0 } }],
      });
      handleMessage(room, 'host', { type: 'inputs', inputs: [input] });
      out = [...out, ...stepRoom(room)];
    }
    expect(room.game?.tick).toBe(startTick + 30);
    expect(room.game?.players[0]?.pos.x).toBeGreaterThan(startX);

    const snapshots: SnapshotMessage[] = messages(out, 'snapshot');
    expect(snapshots).toHaveLength(10);
    const last = snapshots[snapshots.length - 1];
    expect(last?.game?.state.players[0]?.pos.x).toBeGreaterThan(startX);
    expect(last?.game?.serverTick).toBe(last?.serverTick);
    expect(last?.game?.state).not.toHaveProperty('level');
  });

  it('stops the sim while paused, and the clock keeps going', () => {
    const room = playingRoom();
    const simTick = room.game?.tick;
    menu(room, 'host', press('kb-left', { menu: true }));
    expect(room.flow.screen).toBe('paused');
    const serverTick = room.serverTick;
    steps(room, 10);
    expect(room.serverTick).toBe(serverTick + 10);
    expect(room.game?.tick).toBe((simTick ?? 0) + 0);
  });

  it('ends on the results screen when the round is over', () => {
    const room = playingRoom();
    const game = room.game;
    if (!game) throw new Error('no game');
    steps(room, game.settings.durationTicks + 10);
    expect(game.result).not.toBeNull();
    expect(room.flow.screen).toBe('results');
    expect(room.flow.results?.score).toBe(game.result?.score);
  });

  it('drops the round when the players go back to the level select', () => {
    const room = playingRoom();
    menu(room, 'host', press('kb-left', { menu: true }));
    // Paused menu: resume, restart, settings, level select.
    menu(room, 'host', press('kb-left', { nav: { x: 0, y: 1 } }));
    menu(room, 'host', press('kb-left', { nav: { x: 0, y: 1 } }));
    menu(room, 'host', press('kb-left', { nav: { x: 0, y: 1 } }));
    menu(room, 'host', press('kb-left', { interact: true }));
    expect(room.flow.screen).toBe('levelSelect');
    expect(room.game).toBeNull();
    expect(room.buffers).toEqual([]);
  });
});
