/** Tick-level glue: what `tick` itself guarantees, beyond the systems it calls. */

import { describe, expect, it } from 'vitest';
import { COL, addTicket, cmd, holdWork, newTestGame, standAt } from './testing';
import { tick } from './tick';

describe('tick', () => {
  it('keeps only the events and work feedback of the latest tick', () => {
    const state = newTestGame();
    standAt(state, 1, COL.keyboard);
    addTicket(state, COL.keyboard);
    tick(state, [cmd(state, 1, { interact: true })]);
    expect(state.events.map((e) => e.type)).toContain('pickedUp');
    tick(state, [cmd(state, 1, {})]);
    expect(state.events).toEqual([]);

    const worked = newTestGame();
    standAt(worked, 1, COL.keyboard);
    addTicket(worked, COL.keyboard);
    holdWork(worked, 1);
    expect(worked.workFeedback).not.toEqual([]);
    tick(worked, []);
    expect(worked.workFeedback).toEqual([]);
  });

  it('freezes once the level has ended: no ticks, moves, work or events', () => {
    const state = newTestGame({ durationTicks: 5 });
    standAt(state, 1, COL.keyboard);
    const ticket = addTicket(state, COL.keyboard);
    for (let i = 0; i < 5; i++) tick(state, []);
    expect(state.result).not.toBeNull();
    expect(state.events.map((e) => e.type)).toContain('levelEnded');

    const before = structuredClone(state);
    tick(state, [cmd(state, 1, { move: { x: 1, y: 0 }, work: true, interact: true, dash: true })]);
    expect(state.tick).toBe(before.tick);
    expect(state.players).toEqual(before.players);
    expect(state.tickets).toEqual(before.tickets);
    expect(ticket.steps[0]?.progress).toBe(0);
    expect(state.events).toEqual([]);
    expect(state.workFeedback).toEqual([]);
  });

  it('matches inputs to players by id, whatever their order', () => {
    const a = newTestGame();
    const b = newTestGame();
    for (let i = 0; i < 60; i++) {
      const one = { move: { x: 1, y: 0.2 } };
      const two = { move: { x: -0.5, y: -1 }, dash: i === 10 };
      tick(a, [cmd(a, 1, one), cmd(a, 2, two)]);
      tick(b, [cmd(b, 2, two), cmd(b, 1, one)]);
    }
    expect(a).toEqual(b);
    expect(a.players[0]?.pos).not.toEqual(a.players[1]?.pos);
  });

  it('tracks the interact press per player', () => {
    const state = newTestGame();
    standAt(state, 1, COL.keyboard);
    standAt(state, 2, COL.testBench);
    const code = addTicket(state, COL.keyboard);
    const test = addTicket(state, COL.testBench);
    // Player 1 presses and keeps holding; player 2 presses a tick later.
    tick(state, [cmd(state, 1, { interact: true })]);
    tick(state, [cmd(state, 1, { interact: true }), cmd(state, 2, { interact: true })]);
    expect(code.location).toEqual({ kind: 'player', playerId: 1 });
    expect(test.location).toEqual({ kind: 'player', playerId: 2 });
    // Still holding: nobody puts anything back down.
    tick(state, [cmd(state, 1, { interact: true }), cmd(state, 2, { interact: true })]);
    expect(code.location).toEqual({ kind: 'player', playerId: 1 });
    expect(test.location).toEqual({ kind: 'player', playerId: 2 });
  });
});
