import { describe, expect, it } from 'vitest';
import { GARAGE } from '../sim/levels';
import type { GameEvent } from '../sim/orders';
import { createGame } from '../sim/state';
import { addPong, createClockSync } from './clock';
import { renderTickFor } from './interpolation';
import {
  continueOnlineRound,
  pushRoundSnapshot,
  roundRenderTick,
  sampleRound,
  startOnlineRound,
  takeDueEvents,
} from './onlineRound';
import type { RoundStartMessage } from './protocol';
import { type Snapshot, encodeSnapshot } from './snapshot';

const game = createGame(GARAGE, 1, [1, 2]);

function snapshot(serverTick: number, events: GameEvent[] = [], x?: number): Snapshot {
  const state = structuredClone(game);
  state.tick = serverTick;
  const p = state.players[0];
  if (p && x !== undefined) p.pos = { x, y: p.pos.y };
  return encodeSnapshot(state, serverTick, events);
}

function roundStart(serverTick = 10, roundId = 1): RoundStartMessage {
  return {
    type: 'roundStart',
    roundId,
    counted: true,
    levelId: game.levelId,
    level: game.level,
    snapshot: snapshot(serverTick),
  };
}

const dash = (playerId: number): GameEvent => ({ type: 'dashed', playerId });

describe('online round', () => {
  it('decodes snapshots with the round map', () => {
    const round = startOnlineRound(roundStart());
    const frame = sampleRound(round, null);
    expect(frame?.state.level).toBe(round.level);
    expect(frame?.state.players.map((p) => p.id)).toEqual([1, 2]);
  });

  it('interpolates players between snapshots', () => {
    const round = startOnlineRound(roundStart(10));
    pushRoundSnapshot(round, snapshot(12, [], 2));
    pushRoundSnapshot(round, snapshot(15, [], 3));
    expect(sampleRound(round, 13.5)?.players[1]?.x).toBeCloseTo(2.5);
  });

  it('plays events when render time reaches their snapshot, in order, once', () => {
    const round = startOnlineRound(roundStart(10));
    pushRoundSnapshot(round, snapshot(12, [dash(1)]));
    pushRoundSnapshot(round, snapshot(15, [dash(2), dash(1)]));
    pushRoundSnapshot(round, snapshot(18, [dash(2)]));
    expect(takeDueEvents(round, 11.9)).toEqual([]);
    expect(takeDueEvents(round, 12)).toEqual([dash(1)]);
    expect(takeDueEvents(round, 13)).toEqual([]);
    // A long frame: everything due comes out at once, oldest first.
    expect(takeDueEvents(round, 19)).toEqual([dash(2), dash(1), dash(2)]);
    expect(takeDueEvents(round, 40)).toEqual([]);
  });

  it('ignores duplicate and out-of-order snapshots and their events', () => {
    const round = startOnlineRound(roundStart(10));
    expect(pushRoundSnapshot(round, snapshot(15, [dash(1)]))).toBe(true);
    expect(pushRoundSnapshot(round, snapshot(15, [dash(1)]))).toBe(false);
    expect(pushRoundSnapshot(round, snapshot(12, [dash(2)]))).toBe(false);
    expect(takeDueEvents(round, 100)).toEqual([dash(1)]);
  });

  it('plays everything before the clock is synced', () => {
    const round = startOnlineRound(roundStart(10));
    pushRoundSnapshot(round, snapshot(12, [dash(1)]));
    expect(takeDueEvents(round, null)).toEqual([dash(1)]);
  });

  it('starts every round clean', () => {
    const first = startOnlineRound(roundStart(10));
    pushRoundSnapshot(first, snapshot(12, [dash(1)]));
    const second = startOnlineRound(roundStart(500));
    expect(takeDueEvents(second, 1000)).toEqual([]);
    expect(second.buffer.entries.map((e) => e.serverTick)).toEqual([500]);
  });

  it('carries on with the same round after a reconnect, and starts over for a new one', () => {
    const round = startOnlineRound(roundStart(10));
    pushRoundSnapshot(round, snapshot(12, [dash(1)]));
    const again = continueOnlineRound(round, { ...roundStart(90), counted: false });
    expect(again).toBe(round);
    expect(again.counted).toBe(false);
    expect(round.buffer.entries.map((e) => e.serverTick)).toEqual([10, 12, 90]);
    expect(takeDueEvents(round, 100)).toEqual([dash(1)]);
    const next = continueOnlineRound(round, roundStart(200, 2));
    expect(next).not.toBe(round);
    expect(next.roundId).toBe(2);
    expect(continueOnlineRound(null, roundStart(5, 3)).roundId).toBe(3);
  });

  it('knows whether it saw the round being played', () => {
    const round = startOnlineRound(roundStart(10));
    expect(round.sawPlaying).toBe(true);
    const ended = structuredClone(game);
    ended.result = { score: 10, stars: 1 };
    const late = startOnlineRound({ ...roundStart(10), snapshot: encodeSnapshot(ended, 10, []) });
    expect(late.sawPlaying).toBe(false);
  });

  it('draws half a round trip further back than the interpolation delay', () => {
    const clock = createClockSync();
    expect(roundRenderTick(clock, 0)).toBeNull();
    // A 200 ms round trip, answered at server tick 600.
    addPong(clock, { clientTimeMs: 0, serverTick: 600 }, 200);
    const now = 200 + 1000;
    const estimate = 600 + 0.5 + 6 + 60; // answered 100 ms ago, plus a second
    expect(roundRenderTick(clock, now)).toBeCloseTo(renderTickFor(estimate - 6));
  });
});
