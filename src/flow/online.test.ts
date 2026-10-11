import { describe, expect, it } from 'vitest';
import type { DevicePress } from '../input/controller';
import { PROTOCOL_VERSION, type LobbyMember } from '../net/protocol';
import { createFlow } from './flow';
import {
  type OnlineState,
  applyServerMessage,
  createOnline,
  hostIsChoosing,
  isOnlineHost,
  localBindings,
  membersWithPlayers,
  onlineConnected,
  onlineErrorFromCode,
  onlineMenuPresses,
  onlineNowMs,
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
    for (const screen of ['levelSelect', 'intro', 'paused', 'results'] as const) {
      if (guest.flow) guest.flow.screen = screen;
      if (host.flow) host.flow.screen = screen;
      expect(hostIsChoosing(guest)).toBe(true);
      expect(hostIsChoosing(host)).toBe(false);
    }
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
  it('sends lobby presses to the server, and leaves on back', () => {
    const state = inRoom();
    const join = press({ join: true });
    expect(onlineMenuPresses(state, [join])).toEqual({ send: [join], leave: false });
    expect(onlineMenuPresses(state, [join, press({ menu: true })])).toEqual({
      send: [join],
      leave: true,
    });
    expect(onlineMenuPresses(state, [press({ dash: true })]).leave).toBe(true);
  });

  it('sends everything on other screens, back included (it means back there)', () => {
    const state = inRoom();
    if (state.flow) state.flow.screen = 'levelSelect';
    const back = press({ dash: true });
    expect(onlineMenuPresses(state, [back])).toEqual({ send: [back], leave: false });
  });

  it('sends nothing until connected, or once closed; back leaves', () => {
    const state = createOnline('host');
    expect(onlineMenuPresses(state, [press({ join: true })])).toEqual({ send: [], leave: false });
    expect(onlineMenuPresses(state, [press({ menu: true })]).leave).toBe(true);
    const closed = inRoom();
    setOnlineStatus(closed, 'closed', 'disconnected');
    expect(onlineMenuPresses(closed, [press({ dash: true })])).toEqual({ send: [], leave: true });
  });
});
