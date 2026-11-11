import { describe, expect, it } from 'vitest';
import type { DevicePress } from '../input/controller';
import { PROTOCOL_VERSION, type LobbyMember } from '../net/protocol';
import { NET_LEAVE_CONFIRM_MS } from '../sim/balance';
import { createFlow, menuItems } from './flow';
import {
  type OnlineState,
  applyServerMessage,
  canJoinNextRound,
  createOnline,
  createRejoin,
  hostIsChoosing,
  isOnlineHost,
  isSpectating,
  leaveArmed,
  localBindings,
  membersWithPlayers,
  onlineConnected,
  onlineErrorFromCode,
  onlineMenuPresses,
  onlineNowMs,
  reconnectingMembers,
  roomMenuOpen,
  setOnlineStatus,
} from './online';

function member(sessionId: string, isHost = false): LobbyMember {
  return { sessionId, displayName: sessionId, localPlayers: 1, isHost, connected: true };
}

function press(extra: Partial<DevicePress> = {}): DevicePress {
  return {
    deviceId: 'kb-left',
    joinGroup: 'keyboard',
    join: false,
    interact: false,
    dash: false,
    menu: false,
    nav: { x: 0, y: 0 },
    ...extra,
  };
}

/** Connected as `me`, in a room with `host` and `me`, on the lobby screen. */
function inRoom(me = 'guest'): OnlineState {
  const state = createOnline(me === 'host' ? 'host' : 'join');
  onlineConnected(state, me, 'ABCD');
  applyServerMessage(state, {
    type: 'lobby',
    joinCode: 'ABCD',
    members: [member('host', true), member('guest')],
    levels: { garage: { bestStars: 2, bestScore: 40, plays: 1 } },
  });
  const flow = createFlow();
  flow.screen = 'lobby';
  flow.online = true;
  applyServerMessage(state, { type: 'snapshot', serverTick: 30, flow, game: null });
  return state;
}

describe('online state', () => {
  it('starts connecting, then knows its session and code', () => {
    const state = createOnline('host');
    expect(state).toMatchObject({ status: 'connecting', sessionId: null, flow: null });
    applyServerMessage(state, {
      type: 'welcome',
      protocol: PROTOCOL_VERSION,
      sessionId: 's1',
      joinCode: 'WXYZ',
      serverTick: 12,
      ticksPerSecond: 60,
      snapshotEveryTicks: 3,
    });
    expect(state).toMatchObject({ sessionId: 's1', joinCode: 'WXYZ', serverTick: 12 });
  });

  it('keeps the members and the room unlocks from the lobby message', () => {
    const state = inRoom();
    expect(state.members.map((m) => m.sessionId)).toEqual(['host', 'guest']);
    expect(state.levels.garage?.bestStars).toBe(2);
    expect(isOnlineHost(state)).toBe(false);
    expect(isOnlineHost(inRoom('host'))).toBe(true);
  });

  it('follows the room flow and server clock from snapshots; same flow, no change', () => {
    const state = inRoom();
    expect(state.flow?.screen).toBe('lobby');
    expect(onlineNowMs(state)).toBe(500);
    const flow = structuredClone(state.flow ?? createFlow());
    expect(applyServerMessage(state, { type: 'snapshot', serverTick: 33, flow, game: null })).toBe(
      false,
    );
    expect(state.serverTick).toBe(33);
    const next = { ...structuredClone(flow), screen: 'levelSelect' as const };
    expect(
      applyServerMessage(state, { type: 'snapshot', serverTick: 36, flow: next, game: null }),
    ).toBe(true);
  });

  it('notes the level of a round that starts', () => {
    const state = inRoom();
    applyServerMessage(state, {
      type: 'roundStart',
      roundId: 1,
      counted: true,
      levelId: 'garage',
      level: { width: 1, height: 1, tiles: [], spawns: [] } as never,
      snapshot: { serverTick: 90, state: {} as never, events: [] },
    });
    expect(state).toMatchObject({ levelId: 'garage', serverTick: 90 });
  });

  it('says the host is choosing on host-only screens, to guests only', () => {
    const guest = inRoom('guest');
    const host = inRoom('host');
    expect(hostIsChoosing(guest)).toBe(false);
    for (const screen of ['levelSelect', 'paused', 'results'] as const) {
      if (guest.flow) guest.flow.screen = screen;
      if (host.flow) host.flow.screen = screen;
      expect(hostIsChoosing(guest)).toBe(true);
      expect(hostIsChoosing(host)).toBe(false);
    }
    if (guest.flow) guest.flow.screen = 'intro';
    expect(hostIsChoosing(guest)).toBe(false);
  });

  it("lists each member's couch players with their own device ids", () => {
    const state = inRoom();
    state.flow?.lobby.players.push(
      { playerId: 1, deviceId: 'guest:pad-0' },
      { playerId: 2, deviceId: 'host:kb-left' },
      { playerId: 3, deviceId: 'guest:kb-right' },
    );
    expect(membersWithPlayers(state)).toEqual([
      {
        member: member('host', true),
        isYou: false,
        players: [{ playerId: 2, deviceId: 'kb-left' }],
      },
      {
        member: member('guest'),
        isYou: true,
        players: [
          { playerId: 1, deviceId: 'pad-0' },
          { playerId: 3, deviceId: 'kb-right' },
        ],
      },
    ]);
  });

  it("binds only this machine's players, with local device ids", () => {
    const state = inRoom();
    expect(localBindings(state)).toEqual([]);
    state.flow?.lobby.players.push(
      { playerId: 1, deviceId: 'host:kb-left' },
      { playerId: 2, deviceId: 'guest:kb-left' },
      { playerId: 3, deviceId: 'guest:pad-1' },
    );
    expect(localBindings(state)).toEqual([
      { playerId: 2, deviceId: 'kb-left' },
      { playerId: 3, deviceId: 'pad-1' },
    ]);
  });

  it('maps refused joins to friendly errors', () => {
    expect(onlineErrorFromCode('roomFull')).toBe('roomFull');
    expect(onlineErrorFromCode('serverFull')).toBe('serverFull');
    expect(onlineErrorFromCode('protocolMismatch')).toBe('protocolMismatch');
    expect(onlineErrorFromCode('wrongCode')).toBe('wrongCode');
    expect(onlineErrorFromCode('badMessage')).toBe('unreachable');
    expect(onlineErrorFromCode('Failed to fetch')).toBe('unreachable');
  });

  it('keeps the error when it closes', () => {
    const state = inRoom();
    setOnlineStatus(state, 'reconnecting');
    expect(state).toMatchObject({ status: 'reconnecting', error: null });
    setOnlineStatus(state, 'closed', 'disconnected');
    expect(state).toMatchObject({ status: 'closed', error: 'disconnected' });
  });
});

describe('online presses', () => {
  it('sends lobby presses to the server; back asks first, a second back leaves', () => {
    const state = inRoom();
    const join = press({ join: true });
    expect(onlineMenuPresses(state, [join], 0)).toEqual({
      send: [join],
      leave: false,
      changed: false,
    });
    expect(onlineMenuPresses(state, [join, press({ menu: true })], 1000)).toEqual({
      send: [join],
      leave: false,
      changed: true,
    });
    expect(leaveArmed(state, 1000)).toBe(true);
    expect(onlineMenuPresses(state, [press({ dash: true })], 2000).leave).toBe(true);
  });

  it('forgets the first back after a moment', () => {
    const state = inRoom();
    onlineMenuPresses(state, [press({ menu: true })], 1000);
    const later = 1000 + NET_LEAVE_CONFIRM_MS;
    expect(onlineMenuPresses(state, [], later)).toEqual({ send: [], leave: false, changed: true });
    expect(state.leaveArmedAtMs).toBeNull();
    expect(onlineMenuPresses(state, [press({ menu: true })], later + 10).leave).toBe(false);
  });

  it('sends everything on other screens, back included (it means back there)', () => {
    const state = inRoom();
    if (state.flow) state.flow.screen = 'levelSelect';
    const back = press({ dash: true });
    expect(onlineMenuPresses(state, [back], 0)).toEqual({
      send: [back],
      leave: false,
      changed: false,
    });
  });

  it('sends nothing until connected, or once closed; back leaves', () => {
    const state = createOnline('host');
    expect(onlineMenuPresses(state, [press({ join: true })], 0)).toMatchObject({
      send: [],
      leave: false,
    });
    expect(onlineMenuPresses(state, [press({ menu: true })], 0).leave).toBe(true);
    const rejoining = createRejoin('join', 'ABCD');
    expect(onlineMenuPresses(rejoining, [press({ menu: true })], 0).leave).toBe(true);
    const closed = inRoom();
    setOnlineStatus(closed, 'closed', 'disconnected');
    expect(onlineMenuPresses(closed, [press({ dash: true })], 0)).toMatchObject({
      send: [],
      leave: true,
    });
  });

  it("neither sends nor leaves while reconnecting (Esc to pause mustn't walk out)", () => {
    const state = inRoom();
    if (state.flow) state.flow.screen = 'playing';
    setOnlineStatus(state, 'reconnecting');
    expect(onlineMenuPresses(state, [press({ menu: true })], 0)).toEqual({
      send: [],
      leave: false,
      changed: false,
    });
  });
});

describe('leaving from the menus', () => {
  /** In the room as `me` on `screen`. */
  function on(screen: 'playing' | 'paused' | 'results', me = 'guest'): OnlineState {
    const state = inRoom(me);
    if (state.flow) state.flow.screen = screen;
    return state;
  }

  it("lets the host leave from the room's pause menu, and only that browser", () => {
    const state = on('paused', 'host');
    const flow = state.flow;
    if (!flow) throw new Error('no flow');
    expect(menuItems(flow)).toContain('leaveRoom');
    flow.menuIndex = menuItems(flow).indexOf('resume');
    expect(onlineMenuPresses(state, [press({ interact: true })], 0).leave).toBe(false);
    flow.menuIndex = menuItems(flow).indexOf('leaveRoom');
    expect(onlineMenuPresses(state, [press({ interact: true })], 0)).toEqual({
      send: [],
      leave: true,
      changed: false,
    });
  });

  it('offers Leave room on the online results too, not offline', () => {
    const state = on('results', 'host');
    const flow = state.flow;
    if (!flow) throw new Error('no flow');
    expect(menuItems(flow).at(-1)).toBe('leaveRoom');
    expect(menuItems({ ...flow, online: false })).not.toContain('leaveRoom');
  });

  it("opens a guest's own room menu on Esc or Start, sending nothing", () => {
    const state = on('playing');
    expect(onlineMenuPresses(state, [press({ menu: true })], 0)).toEqual({
      send: [],
      leave: false,
      changed: true,
    });
    expect(roomMenuOpen(state)).toBe(true);
    // Moving and confirming stay in the menu: Keep playing closes it.
    expect(onlineMenuPresses(state, [press({ nav: { x: 0, y: 1 } })], 0).send).toEqual([]);
    expect(state.roomMenu).toBe(1);
    expect(onlineMenuPresses(state, [press({ nav: { x: 0, y: -1 } })], 0).changed).toBe(true);
    onlineMenuPresses(state, [press({ interact: true })], 0);
    expect(roomMenuOpen(state)).toBe(false);
  });

  it('leaves from the room menu, and back closes it', () => {
    const state = on('playing');
    onlineMenuPresses(state, [press({ menu: true })], 0);
    onlineMenuPresses(state, [press({ dash: true })], 0);
    expect(roomMenuOpen(state)).toBe(false);
    onlineMenuPresses(state, [press({ menu: true })], 0);
    onlineMenuPresses(state, [press({ nav: { x: 0, y: 1 } })], 0);
    expect(onlineMenuPresses(state, [press({ join: true })], 0).leave).toBe(true);
  });

  it("sends the host's Esc to the server: it pauses the room", () => {
    const state = on('playing', 'host');
    const esc = press({ menu: true });
    expect(onlineMenuPresses(state, [esc], 0).send).toEqual([esc]);
    expect(roomMenuOpen(state)).toBe(false);
  });
});

describe('resilience', () => {
  it('starts a reloaded page rejoining its room', () => {
    expect(createRejoin('host', 'WXYZ')).toMatchObject({
      role: 'host',
      status: 'rejoining',
      joinCode: 'WXYZ',
      flow: null,
    });
  });

  it('lists the others whose connection dropped', () => {
    const state = inRoom('host');
    expect(reconnectingMembers(state)).toEqual([]);
    applyServerMessage(state, {
      type: 'lobby',
      joinCode: 'ABCD',
      members: [member('host', true), { ...member('guest'), connected: false }],
      levels: {},
    });
    expect(reconnectingMembers(state).map((m) => m.sessionId)).toEqual(['guest']);
  });

  it('says why the room closed when the server told us', () => {
    const state = inRoom();
    applyServerMessage(state, { type: 'closing', reason: 'shutdown' });
    setOnlineStatus(state, 'closed', 'disconnected');
    expect(state.error).toBe('serverShutdown');
    const idle = inRoom();
    applyServerMessage(idle, { type: 'closing', reason: 'idle' });
    setOnlineStatus(idle, 'closed', 'disconnected');
    expect(idle.error).toBe('roomClosed');
  });

  it('knows when this browser only watches the round, and when it can join the next', () => {
    const state = inRoom();
    const flow = state.flow;
    if (!flow) throw new Error('no flow');
    flow.lobby.players = [{ playerId: 1, deviceId: 'host:kb-left' }];
    flow.screen = 'playing';
    expect(isSpectating(state)).toBe(true);
    expect(canJoinNextRound(state)).toBe(false);
    flow.screen = 'results';
    expect(isSpectating(state)).toBe(false);
    expect(canJoinNextRound(state)).toBe(true);
    flow.lobby.players.push({ playerId: 2, deviceId: 'guest:pad-0' });
    expect(canJoinNextRound(state)).toBe(false);
    flow.screen = 'playing';
    expect(isSpectating(state)).toBe(false);
  });
});
