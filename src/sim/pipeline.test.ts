import { describe, expect, it } from 'vitest';
import {
  PIPELINE_BUILD_TICKS,
  PIPELINE_FAIL_TICKS,
  PIPELINE_WARN_TICKS,
  REPAIR_TICKS,
} from './balance';
import { type Pipeline, pipelineAt, pipelineWarning } from './pipeline';
import type { GameState } from './state';
import {
  COL,
  addTicket,
  give,
  holdWork,
  idle,
  newTestGame as newGame,
  press,
  standAt,
} from './testing';
import { tick } from './tick';
import type { Ticket } from './tickets';

function pipeline(state: GameState): Pipeline {
  const p = pipelineAt(state, COL.pipeline, 1);
  if (!p) throw new Error('test map has a pipeline');
  return p;
}

function buildProgress(ticket: Ticket): number | undefined {
  return ticket.steps.find((s) => s.kind === 'pipeline')?.progress;
}

/** A game with a finished build sitting in the pipeline since this tick. */
function finishedBuild(): { state: GameState; ticket: Ticket } {
  const state = newGame();
  const ticket = addTicket(state, COL.pipeline, { done: 3 });
  return { state, ticket };
}

/** A game with a broken pipeline and its ticket still on it. */
function brokenPipeline(): { state: GameState; ticket: Ticket } {
  const { state, ticket } = finishedBuild();
  idle(state, PIPELINE_FAIL_TICKS);
  return { state, ticket };
}

describe('pipeline failure: timing', () => {
  it('warns PIPELINE_WARN_TICKS before failing', () => {
    const { state } = finishedBuild();
    idle(state, PIPELINE_FAIL_TICKS - PIPELINE_WARN_TICKS - 1);
    expect(pipelineWarning(pipeline(state))).toBe(false);
    idle(state, 1);
    expect(pipelineWarning(pipeline(state))).toBe(true);
    expect(pipeline(state).broken).toBe(false);
  });

  it('breaks after PIPELINE_FAIL_TICKS with an event', () => {
    const { state, ticket } = finishedBuild();
    idle(state, PIPELINE_FAIL_TICKS - 1);
    expect(pipeline(state).broken).toBe(false);
    tick(state, []);
    expect(pipeline(state).broken).toBe(true);
    expect(pipelineWarning(pipeline(state))).toBe(false);
    expect(state.events).toEqual([
      { type: 'pipelineBroke', x: COL.pipeline, y: 1, ticketId: ticket.id },
    ]);
  });

  it('counts from when the build finishes, not when the ticket went in', () => {
    const state = newGame();
    addTicket(state, COL.pipeline, { done: 2 });
    idle(state, PIPELINE_BUILD_TICKS + PIPELINE_FAIL_TICKS - 1);
    expect(pipeline(state).broken).toBe(false);
    idle(state, 1);
    expect(pipeline(state).broken).toBe(true);
  });

  it('a build picked up in time never fails', () => {
    const { state, ticket } = finishedBuild();
    idle(state, PIPELINE_FAIL_TICKS - 2);
    standAt(state, 1, COL.pipeline);
    press(state);
    expect(ticket.location).toEqual({ kind: 'player', playerId: 1 });
    idle(state, PIPELINE_FAIL_TICKS * 2);
    expect(pipeline(state).broken).toBe(false);
    expect(buildProgress(ticket)).toBe(1);
  });

  it('an empty pipeline never fails', () => {
    const state = newGame();
    idle(state, PIPELINE_FAIL_TICKS * 2);
    expect(pipeline(state).broken).toBe(false);
  });
});

describe('pipeline failure: the ticket', () => {
  it('resets only the pipeline step and stays on the pipeline', () => {
    const { ticket } = brokenPipeline();
    expect(ticket.steps.map((s) => s.progress)).toEqual([1, 1, 0]);
    expect(ticket.location).toEqual({ kind: 'tile', x: COL.pipeline, y: 1 });
  });

  it('a broken pipeline does not build its ticket', () => {
    const { state, ticket } = brokenPipeline();
    idle(state, PIPELINE_BUILD_TICKS * 2);
    expect(buildProgress(ticket)).toBe(0);
  });

  it('gives back the ticket on it', () => {
    const { state, ticket } = brokenPipeline();
    standAt(state, 1, COL.pipeline);
    press(state);
    expect(ticket.location).toEqual({ kind: 'player', playerId: 1 });
  });

  it("won't take a ticket while broken", () => {
    const { state, ticket } = brokenPipeline();
    standAt(state, 1, COL.pipeline);
    press(state);
    press(state);
    expect(ticket.location).toEqual({ kind: 'player', playerId: 1 });
  });
});

describe('pipeline repair', () => {
  /** A broken, empty pipeline; player 1 holds the ticket and faces the pipeline. */
  function emptied(): { state: GameState; ticket: Ticket } {
    const { state, ticket } = brokenPipeline();
    standAt(state, 1, COL.pipeline);
    press(state);
    return { state, ticket };
  }

  it('takes REPAIR_TICKS of work, with an event', () => {
    const { state } = emptied();
    holdWork(state, REPAIR_TICKS - 1);
    expect(pipeline(state).broken).toBe(true);
    holdWork(state, 1);
    expect(pipeline(state).broken).toBe(false);
    expect(state.events).toEqual([{ type: 'pipelineRepaired', x: COL.pipeline, y: 1 }]);
  });

  it('needs the work button', () => {
    const { state } = emptied();
    idle(state, REPAIR_TICKS * 2);
    expect(pipeline(state).broken).toBe(true);
    expect(pipeline(state).repair).toBe(0);
  });

  it('needs the pipeline empty', () => {
    const { state } = brokenPipeline();
    standAt(state, 1, COL.pipeline);
    holdWork(state, REPAIR_TICKS * 2);
    expect(pipeline(state).broken).toBe(true);
    expect(pipeline(state).repair).toBe(0);
  });

  it('keeps its progress when you stop', () => {
    const { state } = emptied();
    holdWork(state, REPAIR_TICKS / 2);
    idle(state, REPAIR_TICKS * 2);
    expect(pipeline(state).repair).toBeCloseTo(0.5);
    holdWork(state, REPAIR_TICKS / 2);
    expect(pipeline(state).broken).toBe(false);
  });

  it('two players repairing together are no faster', () => {
    const { state } = emptied();
    standAt(state, 2, COL.pipeline);
    holdWork(state, REPAIR_TICKS - 1, [1, 2]);
    expect(pipeline(state).broken).toBe(true);
  });

  it('builds again afterwards', () => {
    const { state, ticket } = emptied();
    holdWork(state, REPAIR_TICKS);
    press(state);
    expect(ticket.location).toEqual({ kind: 'tile', x: COL.pipeline, y: 1 });
    idle(state, PIPELINE_BUILD_TICKS);
    expect(buildProgress(ticket)).toBe(1);
    expect(pipeline(state).broken).toBe(false);
  });

  it('work on a working pipeline does nothing', () => {
    const state = newGame();
    const ticket = addTicket(state, COL.counter, { done: 2 });
    give(1, ticket);
    standAt(state, 1, COL.pipeline);
    holdWork(state, 10);
    expect(pipeline(state)).toEqual({
      x: COL.pipeline,
      y: 1,
      doneTicks: 0,
      broken: false,
      repair: 0,
    });
  });
});

describe('build done', () => {
  it('is reported once, on the tick the build finishes', () => {
    const state = newGame();
    const ticket = addTicket(state, COL.pipeline, { done: 2 });
    const done: number[] = [];
    for (let i = 0; i < PIPELINE_BUILD_TICKS * 2; i++) {
      tick(state, []);
      if (state.events.some((e) => e.type === 'buildDone')) done.push(state.tick);
    }
    expect(done).toEqual([PIPELINE_BUILD_TICKS]);
    expect(buildProgress(ticket)).toBe(1);
    expect(state.events).not.toContainEqual(expect.objectContaining({ type: 'buildDone' }));
  });
});
