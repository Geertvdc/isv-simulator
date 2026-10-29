import { describe, expect, it } from 'vitest';
import { COUNTDOWN_MS } from '../src/flow/flow';
import type { DevicePress } from '../src/input/controller';
import { countdownEndTick } from '../src/net/prediction';
import {
  type HelloMessage,
  PROTOCOL_VERSION,
  type ServerMessage,
  type SnapshotMessage,
} from '../src/net/protocol';
import {
  NET_MAX_MESSAGES_PER_SECOND,
  NET_MESSAGE_BURST,
  NET_ROOM_IDLE_MS,
  NET_SERVER_MAX_CATCHUP_TICKS,
  NET_SNAPSHOT_EVERY_TICKS,
  TICKS_PER_SECOND,
} from '../src/sim/balance';
import { MAX_PLAYERS } from '../src/sim/level';
import {
  type Outgoing,
  type RoomState,
  TICK_MS,
  advanceRoom,
  createRoomState,
  dropMember,
  handleMessage,
  hostOf,
  joinRoom,
  leaveRoom,
  playerIdsOf,
  rejoinMember,
  setMemberProfile,
  stepRoom,
  takeProfileWrites,
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

describe('countdown end (client-side prediction relies on it)', () => {
  it("the round's first sim tick is the server tick countdownEndTick says", () => {
    const room = createRoomState('ABCD', 1);
    join(room, 'host');
    menu(room, 'host', press('kb-left', { join: true }));
    menu(room, 'host', press('kb-left', { interact: true }));
    menu(room, 'host', press('kb-left', { interact: true }));
    menu(room, 'host', press('kb-left', { interact: true }));
    expect(room.flow.screen).toBe('countdown');
    const end = countdownEndTick(room.flow.countdownStartMs);
    let firstSimTick: number | null = null;
    for (let i = 0; i < 200 && firstSimTick === null; i++) {
      const before = room.game?.tick ?? 0;
      const serverTick = room.serverTick;
      stepRoom(room);
      if ((room.game?.tick ?? 0) > before) firstSimTick = serverTick;
    }
    expect(firstSimTick).toBe(end);
  });
});

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

  it('makes room for more couch players as they join, while the room has space', () => {
    const room = createRoomState('ABCD', 1);
    join(room, 'a', 1);
    join(room, 'b', 1);
    const out = menu(
      room,
      'a',
      press('kb-left', { join: true }),
      press('pad-0', { join: true }),
      press('pad-1', { join: true }),
    );
    expect(playerIdsOf(room, 'a')).toEqual([1, 2, 3]);
    expect(room.members.map((m) => m.localPlayers)).toEqual([3, 1]);
    expect(
      messages(out, 'lobby')
        .at(-1)
        ?.members.map((m) => m.localPlayers),
    ).toEqual([3, 1]);
    // b's seat is kept for b: a can't take it.
    menu(room, 'a', press('pad-2', { join: true }));
    expect(playerIdsOf(room, 'a')).toEqual([1, 2, 3]);
    menu(room, 'b', press('pad-0', { join: true }));
    expect(playerIdsOf(room, 'b')).toEqual([4]);
    expect(room.members.reduce((n, m) => n + m.localPlayers, 0)).toBe(MAX_PLAYERS);
  });
});

describe('renaming', () => {
  it('changes the name everyone sees, without touching the couch players', () => {
    const room = createRoomState('ABCD', 1);
    join(room, 'a');
    join(room, 'b');
    menu(room, 'a', press('kb-left', { join: true }), press('pad-0', { join: true }));
    const out = handleMessage(room, 'a', { type: 'rename', displayName: '  Grace ' });
    const lobby = messages(out, 'lobby').at(-1);
    expect(lobby?.members.map((m) => m.displayName)).toEqual(['Grace', 'b']);
    expect(lobby?.members[0]?.localPlayers).toBe(2);
    expect(playerIdsOf(room, 'a')).toEqual([1, 2]);
  });

  it('works mid-round and sends nothing when the name is the same', () => {
    const room = playingRoom();
    const [first] = room.members;
    if (!first) throw new Error('no member');
    expect(
      handleMessage(room, first.sessionId, { type: 'rename', displayName: 'Lin' }),
    ).toHaveLength(1);
    expect(first.displayName).toBe('Lin');
    expect(handleMessage(room, first.sessionId, { type: 'rename', displayName: 'Lin' })).toEqual(
      [],
    );
  });

  it('refuses an empty name', () => {
    const room = createRoomState('ABCD', 1);
    join(room, 'a');
    expect(handleMessage(room, 'a', { type: 'rename', displayName: ' ' })).toMatchObject([
      { message: { type: 'error', code: 'badMessage' } },
    ]);
    expect(room.members[0]?.displayName).toBe('a');
  });
});

describe('who drives the menus', () => {
  /** Host and guest joined with a keyboard each; the guest joined first, so is player 1. */
  function lobbyRoom(): RoomState {
    const room = createRoomState('ABCD', 1);
    join(room, 'host');
    join(room, 'guest');
    menu(room, 'guest', press('kb-left', { join: true }));
    menu(room, 'host', press('kb-left', { join: true }));
    expect(playerIdsOf(room, 'guest')).toEqual([1]);
    return room;
  }

  it('lets only the host start, even when a guest is player 1', () => {
    const room = lobbyRoom();
    menu(room, 'guest', press('kb-left', { interact: true }));
    menu(room, 'guest', press('kb-left', { join: true }));
    expect(room.flow.screen).toBe('lobby');
    menu(room, 'host', press('kb-left', { interact: true }));
    expect(room.flow.screen).toBe('levelSelect');
  });

  it('ignores back in the lobby: nobody sends the room to a title screen', () => {
    const room = lobbyRoom();
    menu(room, 'host', press('kb-left', { menu: true }), press('kb-right', { dash: true }));
    expect(room.flow.screen).toBe('lobby');
    expect(room.flow.lobby.players).toHaveLength(2);
  });

  it('lets only the host pick a level, pause and choose on the results', () => {
    const room = lobbyRoom();
    menu(room, 'host', press('kb-left', { interact: true }));
    menu(room, 'guest', press('kb-left', { nav: { x: 1, y: 0 } }));
    menu(room, 'guest', press('kb-left', { interact: true }));
    expect(room.flow).toMatchObject({ screen: 'levelSelect', levelIndex: 0 });
    menu(room, 'host', press('kb-left', { interact: true }));
    expect(room.flow.screen).toBe('intro');
    menu(room, 'guest', press('kb-left', { interact: true }));
    expect(room.flow.screen).toBe('intro');
    menu(room, 'host', press('kb-left', { interact: true }));
    steps(room, Math.ceil(COUNTDOWN_MS / TICK_MS) + 1);
    expect(room.flow.screen).toBe('playing');
    menu(room, 'guest', press('kb-left', { menu: true }));
    expect(room.flow.screen).toBe('playing');
    menu(room, 'host', press('kb-left', { menu: true }));
    expect(room.flow.screen).toBe('paused');
    // Paused for everyone: the round stands still.
    const tick = room.game?.tick;
    steps(room, 10);
    expect(room.game?.tick).toBe(tick);
    menu(room, 'guest', press('kb-left', { interact: true }));
    expect(room.flow.screen).toBe('paused');
    menu(room, 'host', press('kb-left', { dash: true }));
    expect(room.flow.screen).toBe('playing');
  });

  it('hands the menus to the next host when the host leaves', () => {
    const room = lobbyRoom();
    menu(room, 'host', press('kb-left', { interact: true }));
    leaveRoom(room, 'host');
    menu(room, 'guest', press('kb-left', { interact: true }));
    expect(room.flow.screen).toBe('intro');
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

  it('lasts as long as the room says, when it says so', () => {
    const room = createRoomState('ABCD', 1, { roundTicks: 120 });
    join(room, 'host');
    menu(room, 'host', press('kb-left', { join: true }));
    menu(room, 'host', press('kb-left', { interact: true }));
    menu(room, 'host', press('kb-left', { interact: true }));
    expect(room.game?.settings.durationTicks).toBe(120);
    menu(room, 'host', press('kb-left', { interact: true }));
    steps(room, Math.ceil(COUNTDOWN_MS / TICK_MS) + 121);
    expect(room.flow.screen).toBe('results');
  });

  it('drops the round when the players go back to the level select', () => {
    const room = playingRoom();
    menu(room, 'host', press('kb-left', { menu: true }));
    // Paused menu online: resume, restart, level select.
    menu(room, 'host', press('kb-left', { nav: { x: 0, y: 1 } }));
    menu(room, 'host', press('kb-left', { nav: { x: 0, y: 1 } }));
    menu(room, 'host', press('kb-left', { interact: true }));
    expect(room.flow.screen).toBe('levelSelect');
    expect(room.game).toBeNull();
    expect(room.buffers).toEqual([]);
  });
});

describe('profiles', () => {
  const HOST_ID = '3f2b8c1e-9d4a-4e6b-8a1c-2b3c4d5e6f70';
  const GUEST_ID = 'a1b2c3d4-e5f6-4a7b-9c8d-0e1f2a3b4c5d';
  const opened = { garage: { bestStars: 3, bestScore: 100, plays: 2 } };

  function joinAs(room: RoomState, sessionId: string, userId: string): void {
    const result = joinRoom(room, sessionId, { ...hello(1, sessionId), userId });
    if (!result.ok) throw new Error(result.reason);
  }

  /** A room on the level select with the cursor on the second level. */
  function onSecondLevel(room: RoomState): void {
    menu(room, 'host', press('kb-left', { join: true }));
    menu(room, 'host', press('kb-left', { interact: true }));
    expect(room.flow.screen).toBe('levelSelect');
    menu(room, 'host', press('kb-left', { nav: { x: 1, y: 0 } }));
    expect(room.flow.levelIndex).toBe(1);
  }

  it("uses the host's profile for unlocks", () => {
    const locked = createRoomState('ABCD', 1);
    joinAs(locked, 'host', HOST_ID);
    onSecondLevel(locked);
    menu(locked, 'host', press('kb-left', { interact: true }));
    expect(locked.flow.screen).toBe('levelSelect');

    const room = createRoomState('ABCD', 1);
    joinAs(room, 'host', HOST_ID);
    setMemberProfile(room, 'host', opened);
    expect(room.save.levels).toEqual(opened);
    onSecondLevel(room);
    const out = menu(room, 'host', press('kb-left', { interact: true }));
    expect(room.flow.screen).toBe('intro');
    expect(messages(out, 'roundStart')[0]?.levelId).toBe('open-plan');
  });

  it("ignores a guest's profile for unlocks, until the guest becomes host", () => {
    const room = createRoomState('ABCD', 1);
    joinAs(room, 'host', HOST_ID);
    joinAs(room, 'guest', GUEST_ID);
    setMemberProfile(room, 'guest', opened);
    expect(room.save.levels).toEqual({});
    leaveRoom(room, 'host');
    expect(room.save.levels).toEqual(opened);
  });

  it('keeps rounds played before the profile came in', () => {
    const room = createRoomState('ABCD', 1);
    joinAs(room, 'host', HOST_ID);
    const host = hostOf(room);
    if (!host) throw new Error('no host');
    host.levels = { garage: { bestStars: 1, bestScore: 500, plays: 1 } };
    setMemberProfile(room, 'host', opened);
    expect(room.save.levels).toEqual({ garage: { bestStars: 3, bestScore: 500, plays: 2 } });
  });

  it('records a finished round for every member, once per user', () => {
    const room = createRoomState('ABCD', 1);
    joinAs(room, 'host', HOST_ID);
    joinAs(room, 'guest', GUEST_ID);
    joinAs(room, 'twin', GUEST_ID);
    join(room, 'anon');
    menu(room, 'host', press('kb-left', { join: true }));
    menu(room, 'host', press('kb-left', { interact: true }));
    menu(room, 'host', press('kb-left', { interact: true }));
    menu(room, 'host', press('kb-left', { interact: true }));
    steps(room, Math.ceil(COUNTDOWN_MS / TICK_MS) + 2);
    expect(room.flow.screen).toBe('playing');
    expect(takeProfileWrites(room)).toEqual([]);

    const game = room.game;
    if (!game) throw new Error('no game');
    steps(room, game.settings.durationTicks + 10);
    const result = game.result;
    if (!result) throw new Error('no result');
    const writes = takeProfileWrites(room);
    expect(writes).toEqual([
      { userId: HOST_ID, displayName: 'host', levelId: 'garage', result },
      { userId: GUEST_ID, displayName: 'guest', levelId: 'garage', result },
    ]);
    expect(takeProfileWrites(room)).toEqual([]);
    for (const member of room.members) {
      expect(member.levels.garage?.plays).toBe(1);
    }
    expect(room.save.levels.garage?.plays).toBe(1);
  });

  it("sends the room's unlocks in the lobby message, again when the host's profile comes in", () => {
    const room = createRoomState('ABCD', 1);
    const result = joinRoom(room, 'host', { ...hello(1, 'host'), userId: HOST_ID });
    if (!result.ok) throw new Error(result.reason);
    expect(messages(result.out, 'lobby')[0]?.levels).toEqual({});
    joinAs(room, 'guest', GUEST_ID);
    expect(setMemberProfile(room, 'guest', opened)).toEqual([]);
    const out = setMemberProfile(room, 'host', opened);
    expect(messages(out, 'lobby')[0]?.levels).toEqual(opened);
    // A copy: later changes to the room don't change a message already out.
    expect(messages(out, 'lobby')[0]?.levels).not.toBe(room.save.levels);
  });

  it('sends the new unlocks after a round', () => {
    const room = playingRoom();
    const game = room.game;
    if (!game) throw new Error('no game');
    const out = steps(room, game.settings.durationTicks + 10);
    expect(room.flow.screen).toBe('results');
    const levels = messages(out, 'lobby').at(-1)?.levels;
    expect(levels?.garage?.plays).toBe(1);
  });
});

describe('resilience', () => {
  const ADA = '3f2b8c1e-9d4a-4e6b-8a1c-2b3c4d5e6f70';
  const GRACE = 'a1b2c3d4-e5f6-4a7b-9c8d-0e1f2a3b4c5d';
  const LATE = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';

  function joinAs(room: RoomState, sessionId: string, userId?: string): void {
    const result = joinRoom(room, sessionId, {
      ...hello(1, sessionId),
      userId: userId ?? sessionId,
    });
    if (!result.ok) throw new Error(result.reason);
  }

  /** Host and guest each with a keyboard player (host is player 1), on the level select. */
  function twoPlayers(): RoomState {
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
  function play(room: RoomState, by = 'host', device = 'kb-left'): void {
    menu(room, by, press(device, { interact: true }));
    expect(room.flow.screen).toBe('intro');
    for (const binding of room.flow.lobby.players) {
      const [sessionId, deviceId] = binding.deviceId.split(':');
      if (sessionId && deviceId) menu(room, sessionId, press(deviceId, { interact: true }));
    }
    steps(room, Math.ceil(COUNTDOWN_MS / TICK_MS) + 1);
    expect(room.flow.screen).toBe('playing');
  }

  function finish(room: RoomState): void {
    const game = room.game;
    if (!game) throw new Error('no round');
    steps(room, game.settings.durationTicks - game.tick + 5);
    expect(room.flow.screen).toBe('results');
    // The results take presses after a moment.
    steps(room, TICKS_PER_SECOND * 3);
  }

  function walk(room: RoomState, sessionId: string, playerId: number): void {
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

  describe('dropping and reconnecting', () => {
    it('keeps a dropped member and their players, marked as not connected', () => {
      const room = twoPlayers();
      play(room);
      const out = dropMember(room, 'guest');
      expect(room.members.map((m) => m.sessionId)).toEqual(['host', 'guest']);
      expect(playerIdsOf(room, 'guest')).toEqual([2]);
      const lobby = messages(out, 'lobby')[0];
      expect(lobby?.members.map((m) => [m.displayName, m.connected])).toEqual([
        ['host', true],
        ['guest', false],
      ]);
      // Their player stands still while they are away; the round goes on.
      const before = room.game?.players[1]?.pos;
      const tick = room.game?.tick ?? 0;
      steps(room, 60);
      expect(room.game?.tick).toBe(tick + 60);
      expect(room.game?.players[1]?.pos).toEqual(before);
    });

    it('sends a reconnected member the welcome, the room and the same round again', () => {
      const room = twoPlayers();
      play(room);
      const roundId = room.roundId;
      dropMember(room, 'guest');
      steps(room, 30);
      const out = rejoinMember(room, 'guest');
      expect(out.map((o) => [o.to, o.message.type])).toEqual([
        ['guest', 'welcome'],
        [null, 'lobby'],
        ['guest', 'roundStart'],
      ]);
      expect(messages(out, 'roundStart')[0]).toMatchObject({ roundId, counted: true });
      expect(messages(out, 'lobby')[0]?.members.every((m) => m.connected)).toBe(true);
      // Their inputs move their player again.
      const x = room.game?.players[1]?.pos.x ?? 0;
      for (let i = 0; i < 20; i++) {
        walk(room, 'guest', 2);
        stepRoom(room);
      }
      expect(room.game?.players[1]?.pos.x).toBeGreaterThan(x);
    });

    it('hands the menus to the next connected member while the host is away, and back', () => {
      const room = twoPlayers();
      dropMember(room, 'host');
      expect(hostOf(room)?.sessionId).toBe('guest');
      menu(room, 'guest', press('kb-left', { interact: true }));
      expect(room.flow.screen).toBe('intro');
      rejoinMember(room, 'host');
      expect(hostOf(room)?.sessionId).toBe('host');
      menu(room, 'guest', press('kb-left', { interact: true }));
      expect(room.flow.screen).toBe('intro');
      menu(room, 'host', press('kb-left', { interact: true }));
      expect(room.flow.screen).toBe('countdown');
    });

    it('ignores a drop or rejoin of someone not in the room', () => {
      const room = twoPlayers();
      expect(dropMember(room, 'nobody')).toEqual([]);
      expect(rejoinMember(room, 'nobody')).toEqual([]);
      dropMember(room, 'guest');
      expect(dropMember(room, 'guest')).toEqual([]);
    });
  });

  describe('a host without a player', () => {
    it('drives host menus but cannot ready someone else from a spectator device', () => {
      // The host leaves after the lobby; the guest becomes host, and drops: a
      // member who only watched is the host now, with no player of their own.
      const room = twoPlayers();
      joinAs(room, 'watcher');
      leaveRoom(room, 'host');
      dropMember(room, 'guest');
      expect(hostOf(room)?.sessionId).toBe('watcher');
      expect(playerIdsOf(room, 'watcher')).toEqual([]);
      menu(room, 'watcher', press('kb-left', { nav: { x: 1, y: 0 } }));
      expect(room.flow.levelIndex).toBe(1);
      menu(room, 'watcher', press('kb-left', { nav: { x: -1, y: 0 } }));
      menu(room, 'watcher', press('kb-left', { interact: true }));
      expect(room.flow.screen).toBe('intro');
      menu(room, 'watcher', press('kb-left', { interact: true }));
      expect(room.flow.screen).toBe('intro');
      rejoinMember(room, 'guest');
      menu(room, 'guest', press('kb-left', { interact: true }));
      steps(room, Math.ceil(COUNTDOWN_MS / TICK_MS) + 1);
      // Guest is the earliest connected member again.
      expect(room.flow.screen).toBe('playing');
      dropMember(room, 'guest');
      menu(room, 'watcher', press('kb-left', { menu: true }));
      expect(room.flow.screen).toBe('paused');
      menu(room, 'watcher', press('kb-left', { dash: true }));
      expect(room.flow.screen).toBe('playing');
      finish(room);
      const roundId = room.roundId;
      menu(room, 'watcher', press('kb-left', { interact: true }));
      expect(room.roundId).toBe(roundId + 1);
    });
  });

  describe('leaving for good', () => {
    it("keeps a leaver's character until the round ends, then renumbers", () => {
      const room = twoPlayers();
      joinAs(room, 'third');
      // 'third' joins a player between rounds (see late join), so there are three.
      menu(room, 'third', press('kb-left', { join: true }));
      expect(playerIdsOf(room, 'third')).toEqual([3]);
      play(room);
      leaveRoom(room, 'guest');
      expect(room.flow.lobby.players.map((p) => p.playerId)).toEqual([1, 2, 3]);
      expect(room.game?.players).toHaveLength(3);
      finish(room);
      expect(room.flow.lobby.players).toHaveLength(3);
      // Retry (or Next): a fresh round without the leaver.
      menu(room, 'host', press('kb-left', { interact: true }));
      expect(playerIdsOf(room, 'host')).toEqual([1]);
      expect(playerIdsOf(room, 'third')).toEqual([2]);
      expect(room.game?.players.map((p) => p.id)).toEqual([1, 2]);
    });

    it("drops a leaver's players right away between rounds", () => {
      const room = twoPlayers();
      leaveRoom(room, 'host');
      expect(room.flow.lobby.players).toEqual([{ playerId: 1, deviceId: 'guest:kb-left' }]);
      expect(room.flow.screen).toBe('levelSelect');
    });

    it('goes back to the lobby when no players are left', () => {
      const room = twoPlayers();
      joinAs(room, 'watcher');
      leaveRoom(room, 'host');
      leaveRoom(room, 'guest');
      expect(room.flow.screen).toBe('lobby');
      expect(room.flow.lobby).toEqual({ players: [], started: false });
    });

    it('goes back to the lobby when the round ends with nobody left who plays', () => {
      const room = twoPlayers();
      joinAs(room, 'watcher');
      play(room);
      leaveRoom(room, 'host');
      leaveRoom(room, 'guest');
      expect(room.game).not.toBeNull();
      finish(room);
      menu(room, 'watcher', press('kb-left', { interact: true }));
      expect(room.flow.screen).toBe('lobby');
      expect(room.game).toBeNull();
    });
  });

  describe('joining while a round runs', () => {
    it('sends the round to watch, not counted', () => {
      const room = twoPlayers();
      play(room);
      const result = joinRoom(room, 'late', hello(1, 'late'));
      if (!result.ok) throw new Error(result.reason);
      expect(messages(result.out, 'roundStart')[0]).toMatchObject({
        roundId: room.roundId,
        counted: false,
      });
    });

    it('lets them join a player on the results and the level select, not during the round', () => {
      const room = twoPlayers();
      play(room);
      joinAs(room, 'late');
      menu(room, 'late', press('kb-left', { join: true }));
      expect(playerIdsOf(room, 'late')).toEqual([]);
      finish(room);
      const out = menu(room, 'late', press('kb-left', { join: true, interact: true }));
      expect(playerIdsOf(room, 'late')).toEqual([3]);
      expect(messages(out, 'lobby')).toHaveLength(1);
      // The press only joined: the results are still up.
      expect(room.flow.screen).toBe('results');
      // A second press doesn't add another player.
      menu(room, 'late', press('kb-right', { join: true }));
      expect(playerIdsOf(room, 'late')).toEqual([3]);
      // The next round has them.
      menu(room, 'host', press('kb-left', { interact: true }));
      expect(room.game?.players.map((p) => p.id)).toEqual([1, 2, 3]);
    });

    it('lets a member who watched join on the level select', () => {
      const room = twoPlayers();
      joinAs(room, 'watcher');
      menu(room, 'watcher', press('pad-0', { join: true }));
      expect(playerIdsOf(room, 'watcher')).toEqual([3]);
      // Players already in can't add more here (Change players is for that).
      menu(room, 'host', press('kb-right', { join: true }));
      expect(playerIdsOf(room, 'host')).toEqual([1]);
    });

    it('records the round for members who were there at the start, also when they left', () => {
      const room = twoPlayers();
      play(room);
      joinAs(room, 'late', LATE);
      leaveRoom(room, 'guest');
      finish(room);
      const writes = takeProfileWrites(room);
      expect(writes.map((w) => [w.userId, w.displayName])).toEqual([
        [ADA, 'host'],
        [GRACE, 'guest'],
      ]);
      const late = room.members.find((m) => m.sessionId === 'late');
      expect(late?.levels).toEqual({});
    });
  });

  describe('message budget', () => {
    it('drops a flood and lets messages through again once it refills', () => {
      const room = twoPlayers();
      const ping = { type: 'ping', id: 1, clientTimeMs: 0 };
      let answered = 0;
      for (let i = 0; i < NET_MESSAGE_BURST + 40; i++) {
        answered += handleMessage(room, 'guest', ping).length;
      }
      expect(answered).toBe(NET_MESSAGE_BURST);
      const guest = room.members.find((m) => m.sessionId === 'guest');
      expect(guest?.dropped).toBe(40);
      // A second's worth of ticks refills the budget (up to the burst).
      steps(room, TICKS_PER_SECOND);
      answered = 0;
      for (let i = 0; i < NET_MESSAGE_BURST + 40; i++) {
        answered += handleMessage(room, 'guest', ping).length;
      }
      expect(answered).toBe(Math.min(NET_MESSAGE_BURST, NET_MAX_MESSAGES_PER_SECOND));
      // Others aren't affected.
      expect(handleMessage(room, 'host', ping)).toHaveLength(1);
    });

    it('keeps up with a client sending every tick', () => {
      const room = twoPlayers();
      let answered = 0;
      for (let i = 0; i < TICKS_PER_SECOND * 5; i++) {
        answered += handleMessage(room, 'guest', { type: 'ping', id: i, clientTimeMs: 0 }).length;
        stepRoom(room);
      }
      expect(answered).toBe(TICKS_PER_SECOND * 5);
    });
  });

  describe('idle rooms', () => {
    const idleTicks = Math.ceil(NET_ROOM_IDLE_MS / TICK_MS);

    it('closes after a long time without a press or a move', () => {
      const room = twoPlayers();
      const start = room.serverTick;
      let out: Outgoing[] = [];
      while (room.closing === null && room.serverTick < start + idleTicks + 10) {
        out = stepRoom(room);
      }
      expect(room.closing).toBe('idle');
      expect(messages(out, 'closing')).toEqual([{ type: 'closing', reason: 'idle' }]);
      expect(room.serverTick - start).toBeLessThanOrEqual(idleTicks);
    });

    it("stays open while someone does something, pings alone don't count", () => {
      const room = twoPlayers();
      steps(room, idleTicks - 100);
      handleMessage(room, 'host', { type: 'ping', id: 1, clientTimeMs: 0 });
      menu(room, 'host', press('kb-left', { nav: { x: 1, y: 0 } }));
      steps(room, 200);
      expect(room.closing).toBeNull();
    });
  });
});
