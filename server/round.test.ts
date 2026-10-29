/** The server tick: the clock, the round, snapshots, results for the profiles and idle rooms. */

import { describe, expect, it } from 'vitest';
import { COUNTDOWN_MS } from '../src/flow/flow';
import { countdownEndTick } from '../src/net/prediction';
import type { SnapshotMessage } from '../src/net/protocol';
import {
  NET_ROOM_IDLE_MS,
  NET_SERVER_MAX_CATCHUP_TICKS,
  NET_SNAPSHOT_EVERY_TICKS,
} from '../src/sim/balance';
import { leaveRoom } from './membership';
import { type Outgoing, TICK_MS, createRoomState } from './room';
import { handleMessage } from './roomLogic';
import { advanceRoom, stepRoom, takeProfileWrites } from './round';
import {
  ADA,
  GRACE,
  LATE,
  finish,
  join,
  joinAs,
  menu,
  messages,
  play,
  playingRoom,
  press,
  steps,
  twoPlayers,
} from './testing';

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
describe('finished rounds', () => {
  it('records a finished round for every member, once per user', () => {
    const room = createRoomState('ABCD', 1);
    joinAs(room, 'host', ADA);
    joinAs(room, 'guest', GRACE);
    joinAs(room, 'twin', GRACE);
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
      { userId: ADA, displayName: 'host', levelId: 'garage', result },
      { userId: GRACE, displayName: 'guest', levelId: 'garage', result },
    ]);
    expect(takeProfileWrites(room)).toEqual([]);
    for (const member of room.members) {
      expect(member.levels.garage?.plays).toBe(1);
    }
    expect(room.save.levels.garage?.plays).toBe(1);
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
