import { describe, expect, it } from 'vitest';
import { addTicket, cmd, newTestGame, standAt } from './testing';
import { tick } from './tick';
import { decodeSnapshot, encodeSnapshot } from '../net/snapshot';
import { getPlayer, newPlayer, type GameState } from './state';

function player(state: GameState, id: number) {
  const found = getPlayer(state, id);
  if (!found) throw new Error(`Missing player ${id}`);
  return found;
}

describe('resolved work feedback', () => {
  it('only the strongest tester contributes, then idle input clears the rate', () => {
    const state = newTestGame();
    player(state, 1).roleId = 'frontend';
    player(state, 2).roleId = 'qa';
    standAt(state, 1, 3);
    standAt(state, 2, 3);
    addTicket(state, 3, { done: 1 });
    tick(
      state,
      state.players.map((p) => cmd(state, p.id, { work: true })),
    );
    expect(state.workFeedback).toEqual([{ playerId: 2, task: 'test', ticketId: 1, rate: 2 }]);
    const restored = decodeSnapshot(encodeSnapshot(state, 6, []), state.level);
    expect(restored.workFeedback).toEqual(state.workFeedback);
    expect(restored.players.map((p) => p.roleId)).toEqual(['frontend', 'qa']);
    tick(state, []);
    expect(state.workFeedback).toEqual([]);
  });

  it('reports designed pair contributions and actual total, not the generalist pairing constant', () => {
    const state = newTestGame({ pairing: true });
    state.players.forEach((p) => {
      p.roleId = 'frontend';
    });
    standAt(state, 1, 2);
    standAt(state, 2, 2);
    const ticket = addTicket(state, 2);
    ticket.domain = 'frontend';
    ticket.steps.unshift({ kind: 'design', progress: 1 });
    tick(
      state,
      state.players.map((p) => cmd(state, p.id, { work: true })),
    );
    expect(state.workFeedback).toHaveLength(2);
    for (const work of state.workFeedback) {
      expect(work.rate).toBeCloseTo(3.04);
      expect(work.teamRate).toBeCloseTo(6.08);
      expect(work.task).toBe('code');
    }
  });

  it('excludes a weaker third coder and never claims idle contenders are productive', () => {
    const state = newTestGame({ pairing: true });
    state.players.push(newPlayer(3, { x: 4, y: 3 }, 'qa'));
    player(state, 1).roleId = 'frontend';
    player(state, 2).roleId = 'frontend';
    for (const p of state.players) standAt(state, p.id, 2);
    addTicket(state, 2).domain = 'frontend';
    tick(
      state,
      state.players.map((p) => cmd(state, p.id, { work: true })),
    );
    expect(state.workFeedback.map((w) => w.playerId)).toEqual([1, 2]);
    expect(state.workFeedback[0]?.teamRate).toBeCloseTo(3.8);
  });

  it('repair is strongest-only and review keeps quorum rather than a QA bonus', () => {
    const state = newTestGame();
    player(state, 1).roleId = 'qa';
    player(state, 2).roleId = 'platform';
    const pipeline = state.pipelines[0];
    if (!pipeline) throw new Error('Missing pipeline');
    pipeline.broken = true;
    for (const p of state.players) standAt(state, p.id, 7);
    tick(
      state,
      state.players.map((p) => cmd(state, p.id, { work: true })),
    );
    expect(state.workFeedback).toEqual([{ playerId: 2, task: 'repair', rate: 1.5 }]);
    const ticket = addTicket(state, 9);
    ticket.steps = [{ kind: 'review', progress: 0 }];
    for (const p of state.players) standAt(state, p.id, 9);
    tick(state, [cmd(state, 1, { work: true })]);
    expect(state.workFeedback).toEqual([]);
    tick(
      state,
      state.players.map((p) => cmd(state, p.id, { work: true })),
    );
    expect(state.workFeedback.map((w) => [w.task, w.rate])).toEqual([
      ['review', 1],
      ['review', 1],
    ]);
  });
});
