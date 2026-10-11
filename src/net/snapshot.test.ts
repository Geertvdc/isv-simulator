import { describe, expect, it } from 'vitest';
import { NET_SNAPSHOT_EVERY_TICKS, TICKS_PER_SECOND } from '../sim/balance';
import { botInput, createBot } from '../sim/bot';
import { MIDDLE_MANAGEMENT } from '../sim/levels';
import { type GameState, createGame } from '../sim/state';
import { tick } from '../sim/tick';
import {
  type Snapshot,
  createSnapshotLog,
  decodeSnapshot,
  encodeSnapshot,
  isSnapshotTick,
  recordTick,
  takeSnapshot,
} from './snapshot';

/** A 4-player round with managers, tickets and orders, `seconds` in. */
function busyGame(seconds: number): GameState {
  const state = createGame(MIDDLE_MANAGEMENT, 7, [1, 2, 3, 4]);
  const bots = state.players.map((p) => createBot(p.id));
  for (let i = 0; i < seconds * TICKS_PER_SECOND; i++) {
    tick(
      state,
      bots.map((b) => botInput(state, b, bots)),
    );
  }
  return state;
}

/** What actually goes over the wire. */
function wire(snapshot: Snapshot): Snapshot {
  return JSON.parse(JSON.stringify(snapshot)) as Snapshot;
}

describe('snapshot codec', () => {
  const state = busyGame(40);

  it('has something worth sending', () => {
    expect(state.managers.length).toBeGreaterThan(0);
    expect(state.tickets.length).toBeGreaterThan(0);
    expect(state.orders.length).toBeGreaterThan(0);
  });

  it('round-trips through JSON back to the same state', () => {
    const snapshot = wire(encodeSnapshot(state, 5000, state.events));
    expect(snapshot.serverTick).toBe(5000);
    expect(decodeSnapshot(snapshot, state.level)).toEqual(state);
  });

  it('leaves the level map out', () => {
    const snapshot = encodeSnapshot(state, 0, []);
    expect('level' in snapshot.state).toBe(false);
    expect(JSON.stringify(snapshot)).not.toContain('"tiles"');
  });

  it('copies: later changes to the state do not reach the snapshot, and back', () => {
    const copy = structuredClone(state);
    const snapshot = encodeSnapshot(copy, 0, []);
    const player = copy.players[0];
    if (!player) throw new Error('no player');
    player.pos.x += 3;
    copy.score += 100;
    expect(snapshot.state.players[0]?.pos).toEqual(state.players[0]?.pos);
    expect(snapshot.state.score).toBe(state.score);

    const decoded = decodeSnapshot(snapshot, copy.level);
    decoded.score += 1;
    expect(snapshot.state.score).toBe(state.score);
    expect(decoded.level).not.toBe(copy.level);
  });

  it('stays small with 4 players mid-round', () => {
    const bytes = JSON.stringify(encodeSnapshot(state, 0, state.events)).length;
    // About 3 KB; 20 a second is ~60 KB/s per client before compression.
    expect(bytes).toBeLessThan(16_000);
  });
});

describe('snapshot log', () => {
  it('collects the events of every tick since the last snapshot', () => {
    const state = createGame(MIDDLE_MANAGEMENT, 3, [1]);
    const log = createSnapshotLog();
    const seen: string[] = [];
    let snapshots = 0;
    let sent = 0;
    for (let serverTick = 1; serverTick <= 30 * TICKS_PER_SECOND; serverTick++) {
      tick(state, [
        {
          playerId: 1,
          tick: state.tick,
          move: { x: 0, y: 0 },
          interact: false,
          work: false,
          dash: serverTick % 50 === 0,
        },
      ]);
      recordTick(log, state);
      seen.push(...state.events.map((e) => e.type));
      if (isSnapshotTick(serverTick)) {
        const snapshot = takeSnapshot(log, state, serverTick);
        expect(snapshot.serverTick).toBe(serverTick);
        snapshots++;
        sent += snapshot.events.length;
        expect(log.events).toEqual([]);
        seen.splice(0, snapshot.events.length).forEach((type, i) => {
          expect(snapshot.events[i]?.type).toBe(type);
        });
      }
    }
    expect(seen).toEqual([]);
    expect(sent).toBeGreaterThan(0);
    expect(snapshots).toBe((30 * TICKS_PER_SECOND) / NET_SNAPSHOT_EVERY_TICKS);
  });

  it('snapshots every NET_SNAPSHOT_EVERY_TICKS server ticks', () => {
    const n = NET_SNAPSHOT_EVERY_TICKS;
    const ticks = Array.from({ length: 3 * n + 1 }, (_, i) => i).filter(isSnapshotTick);
    expect(ticks).toEqual([0, n, 2 * n, 3 * n]);
  });
});
