/** Joining, leaving, dropping and rejoining, profiles coming in and the message budget. */

import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '../src/net/protocol';
import {
  NET_MAX_MESSAGES_PER_SECOND,
  NET_MESSAGE_BURST,
  TICKS_PER_SECOND,
} from '../src/sim/balance';
import { MAX_PLAYERS } from '../src/sim/level';
import { playerIdsOf } from './lobby';
import { dropMember, joinRoom, leaveRoom, rejoinMember, setMemberProfile } from './membership';
import { type RoomState, createRoomState, hostOf } from './room';
import { handleMessage } from './roomLogic';
import { stepRoom } from './round';
import {
  ADA,
  GRACE,
  finish,
  hello,
  join,
  joinAs,
  menu,
  messages,
  play,
  playingRoom,
  press,
  steps,
  twoPlayers,
  walk,
} from './testing';

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
describe('profiles', () => {
  const opened = { garage: { bestStars: 3, bestScore: 100, plays: 2 } };

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
    joinAs(locked, 'host', ADA);
    onSecondLevel(locked);
    menu(locked, 'host', press('kb-left', { interact: true }));
    expect(locked.flow.screen).toBe('levelSelect');

    const room = createRoomState('ABCD', 1);
    joinAs(room, 'host', ADA);
    setMemberProfile(room, 'host', opened);
    expect(room.save.levels).toEqual(opened);
    onSecondLevel(room);
    const out = menu(room, 'host', press('kb-left', { interact: true }));
    expect(room.flow.screen).toBe('intro');
    expect(messages(out, 'roundStart')[0]?.levelId).toBe('open-plan');
  });

  it("ignores a guest's profile for unlocks, until the guest becomes host", () => {
    const room = createRoomState('ABCD', 1);
    joinAs(room, 'host', ADA);
    joinAs(room, 'guest', GRACE);
    setMemberProfile(room, 'guest', opened);
    expect(room.save.levels).toEqual({});
    leaveRoom(room, 'host');
    expect(room.save.levels).toEqual(opened);
  });

  it('keeps rounds played before the profile came in', () => {
    const room = createRoomState('ABCD', 1);
    joinAs(room, 'host', ADA);
    const host = hostOf(room);
    if (!host) throw new Error('no host');
    host.levels = { garage: { bestStars: 1, bestScore: 500, plays: 1 } };
    setMemberProfile(room, 'host', opened);
    expect(room.save.levels).toEqual({ garage: { bestStars: 3, bestScore: 500, plays: 2 } });
  });

  it("sends the room's unlocks in the lobby message, again when the host's profile comes in", () => {
    const room = createRoomState('ABCD', 1);
    const result = joinRoom(room, 'host', { ...hello(1, 'host'), userId: ADA });
    if (!result.ok) throw new Error(result.reason);
    expect(messages(result.out, 'lobby')[0]?.levels).toEqual({});
    joinAs(room, 'guest', GRACE);
    expect(setMemberProfile(room, 'guest', opened)).toEqual([]);
    const out = setMemberProfile(room, 'host', opened);
    expect(messages(out, 'lobby')[0]?.levels).toEqual(opened);
    // A copy: later changes to the room don't change a message already out.
    expect(messages(out, 'lobby')[0]?.levels).not.toBe(room.save.levels);
  });
});
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
