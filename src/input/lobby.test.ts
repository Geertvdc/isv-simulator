import { describe, expect, it } from 'vitest';
import { type DevicePress, PressTracker } from './controller';
import { claimOrphanedPlayer, createLobby, updateLobby } from './lobby';

const KB = 'keyboard';

/** What pressing Enter looks like: a join press on both keyboard schemes. */
const enter = (): DevicePress[] => [
  { deviceId: 'kb-left', joinGroup: KB, join: true, interact: false },
  { deviceId: 'kb-right', joinGroup: KB, join: true, interact: false },
];
const padA = (i: number): DevicePress => ({
  deviceId: `pad-${i}`,
  joinGroup: `pad-${i}`,
  join: true,
  interact: true,
});
const interact = (deviceId: string): DevicePress => ({
  deviceId,
  joinGroup: deviceId.startsWith('kb') ? KB : deviceId,
  join: false,
  interact: true,
});

describe('updateLobby', () => {
  it('starts empty', () => {
    expect(createLobby()).toEqual({ players: [], started: false });
  });

  it('joins in press order and hands out player ids (and so spawns) 1, 2, 3, 4', () => {
    const lobby = createLobby();
    expect(updateLobby(lobby, [padA(2)])).toBe(true);
    updateLobby(lobby, enter());
    updateLobby(lobby, [padA(0)]);
    updateLobby(lobby, enter());
    expect(lobby.players).toEqual([
      { playerId: 1, deviceId: 'pad-2' },
      { playerId: 2, deviceId: 'kb-left' },
      { playerId: 3, deviceId: 'pad-0' },
      { playerId: 4, deviceId: 'kb-right' },
    ]);
    expect(lobby.started).toBe(false);
  });

  it('joins the left keyboard scheme first, then the right, one per Enter', () => {
    const lobby = createLobby();
    updateLobby(lobby, enter());
    expect(lobby.players.map((p) => p.deviceId)).toEqual(['kb-left']);
    updateLobby(lobby, enter());
    expect(lobby.players.map((p) => p.deviceId)).toEqual(['kb-left', 'kb-right']);
  });

  it('never joins one device twice', () => {
    const lobby = createLobby();
    updateLobby(lobby, enter());
    updateLobby(lobby, [padA(1)]);
    updateLobby(lobby, enter()); // kb-right
    expect(updateLobby(lobby, [{ ...padA(1), interact: false }])).toBe(false);
    expect(lobby.players.map((p) => p.deviceId)).toEqual(['kb-left', 'pad-1', 'kb-right']);
  });

  it('joins at most four players', () => {
    const lobby = createLobby();
    for (let i = 0; i < 4; i++) updateLobby(lobby, [padA(i)]);
    updateLobby(lobby, enter());
    expect(lobby.players).toHaveLength(4);
    expect(lobby.players.some((p) => p.deviceId.startsWith('kb'))).toBe(false);
  });

  it('does not start from the press that joins player 1', () => {
    const lobby = createLobby();
    updateLobby(lobby, [padA(0)]);
    expect(lobby.started).toBe(false);
  });

  it('starts when player 1 presses A on their pad', () => {
    const lobby = createLobby();
    updateLobby(lobby, [padA(0)]);
    updateLobby(lobby, [padA(1)]);
    expect(lobby.started).toBe(false);
    expect(updateLobby(lobby, [padA(0)])).toBe(true);
    expect(lobby.started).toBe(true);
  });

  it('only lets player 1 start', () => {
    const lobby = createLobby();
    updateLobby(lobby, [padA(0)]);
    updateLobby(lobby, [padA(1)]);
    updateLobby(lobby, [padA(1), interact('kb-left')]);
    expect(lobby.started).toBe(false);
  });

  it('lets a keyboard player 1 start with their interact key', () => {
    const lobby = createLobby();
    updateLobby(lobby, enter());
    updateLobby(lobby, [interact('kb-left')]);
    expect(lobby.started).toBe(true);
    expect(lobby.players).toHaveLength(1);
  });

  it('lets a keyboard player 1 start with Enter once both schemes are taken', () => {
    const lobby = createLobby();
    updateLobby(lobby, enter());
    updateLobby(lobby, enter());
    expect(lobby.started).toBe(false);
    updateLobby(lobby, enter());
    expect(lobby.started).toBe(true);
  });

  it('does not start from Enter when player 1 is on a pad', () => {
    const lobby = createLobby();
    updateLobby(lobby, [padA(0)]);
    updateLobby(lobby, enter());
    updateLobby(lobby, enter());
    updateLobby(lobby, enter());
    expect(lobby.started).toBe(false);
  });

  it('ignores presses once started', () => {
    const lobby = createLobby();
    updateLobby(lobby, enter());
    updateLobby(lobby, [interact('kb-left')]);
    expect(updateLobby(lobby, [padA(0)])).toBe(false);
    expect(lobby.players).toHaveLength(1);
  });
});

describe('PressTracker', () => {
  it('reports a button once, on the frame it goes down', () => {
    const tracker = new PressTracker();
    const reading = (join: boolean) => [
      {
        deviceId: 'pad-0',
        joinGroup: 'pad-0',
        state: { move: { x: 0, y: 0 }, interact: join, work: false, join },
      },
    ];
    expect(tracker.update(reading(true))).toHaveLength(1);
    expect(tracker.update(reading(true))).toHaveLength(0);
    expect(tracker.update(reading(false))).toHaveLength(0);
    expect(tracker.update(reading(true))).toHaveLength(1);
  });

  it('presses again after a device disappears and comes back with the button held', () => {
    const tracker = new PressTracker();
    const held = [
      {
        deviceId: 'pad-0',
        joinGroup: 'pad-0',
        state: { move: { x: 0, y: 0 }, interact: true, work: false, join: true },
      },
    ];
    tracker.update(held);
    tracker.update([]);
    expect(tracker.update(held)).toHaveLength(1);
  });
});

describe('claimOrphanedPlayer', () => {
  it('gives a disconnected pad player to a new pad that presses A', () => {
    const players = [
      { playerId: 1, deviceId: 'kb-left' },
      { playerId: 2, deviceId: 'pad-0' },
      { playerId: 3, deviceId: 'pad-1' },
    ];
    const connected = new Set(['kb-left', 'pad-1', 'pad-2']);
    expect(claimOrphanedPlayer(players, [padA(2)], connected)).toBe(true);
    expect(players[1]).toEqual({ playerId: 2, deviceId: 'pad-2' });
  });

  it('leaves players alone while their pads are connected or for bound pads', () => {
    const players = [
      { playerId: 1, deviceId: 'pad-0' },
      { playerId: 2, deviceId: 'pad-1' },
    ];
    const before = structuredClone(players);
    expect(claimOrphanedPlayer(players, [padA(2)], new Set(['pad-0', 'pad-1', 'pad-2']))).toBe(
      false,
    );
    expect(claimOrphanedPlayer(players, [padA(1)], new Set(['pad-1']))).toBe(false);
    expect(players).toEqual(before);
  });

  it('never hands a keyboard player to a pad, nor a pad player to Enter', () => {
    const players = [
      { playerId: 1, deviceId: 'kb-left' },
      { playerId: 2, deviceId: 'pad-0' },
    ];
    const before = structuredClone(players);
    expect(claimOrphanedPlayer(players, enter(), new Set(['kb-left', 'kb-right']))).toBe(false);
    expect(players).toEqual(before);
  });
});
