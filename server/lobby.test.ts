/** The roster: roles and ready, device bindings, joining players and who drives the menus. */

import { describe, expect, it } from 'vitest';
import { commandFailureText } from '../src/flow/commands';
import { COUNTDOWN_MS } from '../src/flow/flow';
import { selection } from '../src/flow/roster';
import type { DevicePress } from '../src/input/controller';
import { parseClientMessage, PROTOCOL_VERSION } from '../src/net/protocol';
import { MAX_PLAYERS } from '../src/sim/level';
import { playerIdsOf } from './lobby';
import { dropMember, leaveRoom, rejoinMember } from './membership';
import { type RoomState, TICK_MS, createRoomState, hostOf } from './room';
import { handleMessage } from './roomLogic';
import { stepRoom } from './round';
import { finish, join, joinAs, menu, messages, play, press, steps, twoPlayers } from './testing';

function pressOn(
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
  pressOn(room, 'host', 'pad-0', { join: true });
  pressOn(room, 'host', 'pad-1', { join: true });
  pressOn(room, 'guest', 'kb-left', { join: true });
  pressOn(room, 'guest', 'kb-right', { join: true });
  expect(room.flow.screen).toBe('lobby');
  pressOn(room, 'host', 'pad-0', { interact: true });
  pressOn(room, 'host', 'pad-0', { interact: true });
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
    pressOn(room, 'host', 'pad-0', { menu: true });
    pressOn(room, 'host', 'pad-0', { nav: { x: 0, y: 1 } });
    pressOn(room, 'host', 'pad-0', { interact: true });
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
    pressOn(room, 'watcher', 'kb-left', { join: true, nav: { x: 1, y: 0 } });
    expect(room.flow.lobby.players).toHaveLength(2);
    expect(
      handleMessage(room, 'watcher', { type: 'role', playerId: 1, roleId: 'qa' }),
    ).toMatchObject([{ message: { code: 'notOwner' } }]);
    everyoneReady(room);
    pressOn(room, 'watcher', 'kb-left', { interact: true });
    expect(room.game?.players.map((p) => p.roleId)).toEqual(['generalist', 'generalist']);
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
describe('joining players', () => {
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

describe('joining between rounds', () => {
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
});
