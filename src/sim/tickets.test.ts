import { describe, expect, it } from 'vitest';
import { WORK_RATE } from './balance';
import { COL, addTicket, newTestGame } from './testing';
import {
  TICKET_STEPS,
  advanceStep,
  currentStep,
  enqueueTicket,
  isFinished,
  isShippable,
  queuedTickets,
  skippedShare,
  workableSteps,
} from './tickets';

describe('ticket steps', () => {
  it('features need code, test, pipeline; bugs need test first', () => {
    expect(TICKET_STEPS.feature).toEqual(['code', 'test', 'pipeline']);
    expect(TICKET_STEPS.bug).toEqual(['test', 'code', 'test', 'pipeline']);
  });

  it('the current step is the first unfinished one', () => {
    const state = newTestGame();
    const bug = addTicket(state, COL.counter, { kind: 'bug', done: 2, progress: 0.5 });
    expect(currentStep(bug)).toBe(bug.steps[2]);
    expect(isFinished(bug)).toBe(false);
    for (const s of bug.steps) s.progress = 1;
    expect(currentStep(bug)).toBeUndefined();
    expect(isFinished(bug)).toBe(true);
  });

  it('advanceStep reaches exactly 1 after 1 / amount steps', () => {
    const step = { kind: 'code' as const, progress: 0 };
    const n = Math.ceil(1 / WORK_RATE);
    for (let i = 0; i < n - 1; i++) advanceStep(step, WORK_RATE);
    expect(step.progress).toBeLessThan(1);
    advanceStep(step, WORK_RATE);
    expect(step.progress).toBe(1);
  });
});

describe('optional tests', () => {
  it('workable steps run up to the first unfinished required step', () => {
    const state = newTestGame();
    const feature = addTicket(state, COL.counter);
    expect(workableSteps(feature).map((s) => s.kind)).toEqual(['code']);
    const coded = addTicket(state, COL.counter, { done: 1 });
    expect(workableSteps(coded).map((s) => s.kind)).toEqual(['test', 'pipeline']);
    const bug = addTicket(state, COL.counter, { kind: 'bug' });
    expect(workableSteps(bug).map((s) => s.kind)).toEqual(['test', 'code']);
  });

  it('a test is skipped for good once a later step was worked on', () => {
    const state = newTestGame();
    const t = addTicket(state, COL.counter, { done: 1 });
    const pipeline = t.steps[2];
    if (pipeline) pipeline.progress = 0.1;
    expect(workableSteps(t).map((s) => s.kind)).toEqual(['pipeline']);
    // A half-done test can still be abandoned for the next step.
    const half = addTicket(state, COL.counter, { done: 1, progress: 0.5 });
    expect(workableSteps(half).map((s) => s.kind)).toEqual(['test', 'pipeline']);
  });

  it('shippable once code and pipeline are done, tests or not', () => {
    const state = newTestGame();
    const t = addTicket(state, COL.counter, { done: 1 });
    expect(isShippable(t)).toBe(false);
    const pipeline = t.steps[2];
    if (pipeline) pipeline.progress = 1;
    expect(isShippable(t)).toBe(true);
    expect(isFinished(t)).toBe(false);
    expect(skippedShare(t)).toBe(1);
    const test = t.steps[1];
    if (test) test.progress = 1;
    expect(skippedShare(t)).toBe(0);
  });
});

describe('queues', () => {
  it('enqueues fresh tickets of the right kind, oldest first', () => {
    const state = newTestGame();
    const a = enqueueTicket(state, 'feature', 'A');
    const bug = enqueueTicket(state, 'bug', 'B');
    const c = enqueueTicket(state, 'feature', 'C');
    expect(a.steps).toEqual(TICKET_STEPS.feature.map((kind) => ({ kind, progress: 0 })));
    expect(bug.steps).toHaveLength(4);
    expect(queuedTickets(state, 'feature')).toEqual([a, c]);
    expect(queuedTickets(state, 'bug')).toEqual([bug]);
    expect(new Set([a.id, bug.id, c.id]).size).toBe(3);
  });
});
