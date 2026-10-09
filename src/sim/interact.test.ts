import { describe, expect, it } from 'vitest';
import { PIPELINE_BUILD_TICKS, WORK_RATE } from './balance';
import { getPlayer, targetTile } from './state';
import {
  COL,
  addTicket,
  cmd,
  give,
  holdWork,
  idle,
  newTestGame as newGame,
  press,
  standAt,
} from './testing';
import { tick } from './tick';
import {
  type StepKind,
  type Ticket,
  enqueueTicket,
  ticketCarriedBy,
  ticketOnTile,
} from './tickets';

/** Progress of a feature ticket's step. */
function getStep(ticket: Ticket, kind: StepKind): { progress: number } | undefined {
  return ticket.steps.find((s) => s.kind === kind);
}

describe('interact: carrying', () => {
  it('picks a ticket up from a counter, a keyboard and a test bench', () => {
    for (const x of [COL.counter, COL.keyboard, COL.testBench]) {
      const state = newGame();
      const t = addTicket(state, x);
      standAt(state, 1, x);
      press(state);
      expect(t.location).toEqual({ kind: 'player', playerId: 1 });
    }
  });

  it('puts a ticket down on an empty counter, keyboard or test bench', () => {
    for (const x of [COL.counter, COL.keyboard, COL.testBench]) {
      const state = newGame();
      const t = addTicket(state, COL.counter2);
      standAt(state, 1, COL.counter2);
      press(state);
      standAt(state, 1, x);
      press(state);
      expect(t.location).toEqual({ kind: 'tile', x, y: 1 });
      expect(ticketCarriedBy(state, 1)).toBeUndefined();
    }
  });

  it('hands a ticket over via a counter', () => {
    const state = newGame();
    const t = addTicket(state, COL.counter2);
    standAt(state, 1, COL.counter2);
    press(state, 1);
    standAt(state, 1, COL.counter);
    press(state, 1);
    standAt(state, 2, COL.counter);
    press(state, 2);
    expect(t.location).toEqual({ kind: 'player', playerId: 2 });
  });

  it('carries at most one ticket: interacting at a full counter while carrying does nothing', () => {
    const state = newGame();
    const carried = addTicket(state, COL.counter);
    const other = addTicket(state, COL.counter2);
    standAt(state, 1, COL.counter);
    press(state);
    standAt(state, 1, COL.counter2);
    const before = structuredClone(state.tickets);
    press(state);
    expect(state.tickets).toEqual(before);
    expect(carried.location).toEqual({ kind: 'player', playerId: 1 });
    expect(other.location).toEqual({ kind: 'tile', x: COL.counter2, y: 1 });
  });

  it('holds at most one ticket per counter or station', () => {
    for (const x of [COL.counter, COL.keyboard, COL.testBench]) {
      const state = newGame();
      addTicket(state, x);
      const carried = addTicket(state, COL.counter2);
      standAt(state, 1, COL.counter2);
      press(state);
      standAt(state, 1, x);
      press(state);
      expect(carried.location).toEqual({ kind: 'player', playerId: 1 });
      expect(
        state.tickets.filter((t) => t.location.kind === 'tile' && t.location.x === x),
      ).toHaveLength(1);
    }
  });

  it('destroys a carried ticket at the bin', () => {
    const state = newGame();
    const t = addTicket(state, COL.counter);
    standAt(state, 1, COL.counter);
    press(state);
    standAt(state, 1, COL.bin);
    press(state);
    expect(state.tickets).not.toContain(t);
    expect(ticketCarriedBy(state, 1)).toBeUndefined();
  });

  it('cannot grab a ticket another player carries', () => {
    const state = newGame();
    const t = addTicket(state, COL.counter);
    standAt(state, 1, COL.counter);
    press(state, 1);
    standAt(state, 2, COL.counter);
    press(state, 2);
    expect(t.location).toEqual({ kind: 'player', playerId: 1 });
    expect(ticketCarriedBy(state, 2)).toBeUndefined();
  });
});

describe('interact: edge-triggered', () => {
  it('holding interact picks up once and never puts down again', () => {
    const state = newGame();
    const t = addTicket(state, COL.counter);
    standAt(state, 1, COL.counter);
    for (let i = 0; i < 30; i++) tick(state, [cmd(state, 1, { interact: true })]);
    expect(t.location).toEqual({ kind: 'player', playerId: 1 });
  });

  it('acts again after a release', () => {
    const state = newGame();
    const t = addTicket(state, COL.counter);
    standAt(state, 1, COL.counter);
    tick(state, [cmd(state, 1, { interact: true })]);
    tick(state, [cmd(state, 1, { interact: true })]);
    tick(state, [cmd(state, 1, {})]);
    tick(state, [cmd(state, 1, { interact: true })]);
    expect(t.location).toEqual({ kind: 'tile', x: COL.counter, y: 1 });
  });

  it('treats a missing input as a release', () => {
    const state = newGame();
    const t = addTicket(state, COL.counter);
    standAt(state, 1, COL.counter);
    tick(state, [cmd(state, 1, { interact: true })]);
    tick(state, []);
    tick(state, [cmd(state, 1, { interact: true })]);
    expect(t.location).toEqual({ kind: 'tile', x: COL.counter, y: 1 });
  });
});

describe('interact: nothing happens', () => {
  const cases: [string, number][] = [
    ['empty counter', COL.counter],
    ['empty inbox', COL.inbox],
    ['empty bug queue', COL.bugQueue],
    ['pipeline', COL.pipeline],
    ['ship', COL.ship],
    ['review', COL.review],
    ['wall', COL.wall],
    ['bin', COL.bin],
  ];
  for (const [name, x] of cases) {
    it(`empty-handed at the ${name}`, () => {
      const state = newGame();
      addTicket(state, COL.counter2);
      standAt(state, 1, x);
      const before = structuredClone(state.tickets);
      press(state);
      expect(state.tickets).toEqual(before);
    });
  }

  for (const [name, x] of [
    ['inbox', COL.inbox],
    ['bug queue', COL.bugQueue],
    ['pipeline', COL.pipeline],
    ['ship', COL.ship],
    ['review', COL.review],
    ['wall', COL.wall],
    ['floor', COL.floor],
  ] as const) {
    it(`carrying at the ${name}`, () => {
      const state = newGame();
      const t = addTicket(state, COL.counter2);
      standAt(state, 1, COL.counter2);
      press(state);
      if (name === 'floor') {
        const p = getPlayer(state, 1);
        if (p) p.pos = { x: COL.floor, y: 2 };
      } else {
        standAt(state, 1, x);
      }
      press(state);
      expect(t.location).toEqual({ kind: 'player', playerId: 1 });
    });
  }
});

describe('work', () => {
  it('advances the code step at the keyboard by WORK_RATE per tick', () => {
    const state = newGame();
    const t = addTicket(state, COL.keyboard);
    standAt(state, 1, COL.keyboard);
    holdWork(state, 10);
    expect(getStep(t, 'code')?.progress).toBeCloseTo(10 * WORK_RATE);
    expect(getStep(t, 'test')?.progress).toBe(0);
    expect(getStep(t, 'pipeline')?.progress).toBe(0);
  });

  it('finishes a step in exactly 1 / WORK_RATE ticks and caps it at 1', () => {
    const state = newGame();
    const t = addTicket(state, COL.keyboard);
    standAt(state, 1, COL.keyboard);
    const ticks = Math.ceil(1 / WORK_RATE);
    holdWork(state, ticks - 1);
    expect(getStep(t, 'code')?.progress).toBeLessThan(1);
    holdWork(state, 1);
    expect(getStep(t, 'code')?.progress).toBe(1);
    holdWork(state, 50);
    expect(getStep(t, 'code')?.progress).toBe(1);
  });

  it('keeps progress after letting go and after the ticket moves', () => {
    const state = newGame();
    const t = addTicket(state, COL.keyboard);
    standAt(state, 1, COL.keyboard);
    holdWork(state, 20);
    const progress = getStep(t, 'code')?.progress;
    tick(state, [cmd(state, 1, {})]);
    press(state);
    standAt(state, 1, COL.counter);
    press(state);
    expect(getStep(t, 'code')?.progress).toBe(progress);
    standAt(state, 1, COL.counter);
    press(state);
    standAt(state, 1, COL.keyboard);
    press(state);
    holdWork(state, 5);
    expect(getStep(t, 'code')?.progress).toBeCloseTo(25 * WORK_RATE);
  });

  it('blocks the test bench until code is done', () => {
    const state = newGame();
    const t = addTicket(state, COL.testBench, { progress: 0.5 });
    standAt(state, 1, COL.testBench);
    holdWork(state, 30);
    expect(getStep(t, 'test')?.progress).toBe(0);
    const code = getStep(t, 'code');
    if (code) code.progress = 1;
    holdWork(state, 30);
    expect(getStep(t, 'test')?.progress).toBeCloseTo(30 * WORK_RATE);
    expect(getStep(t, 'code')?.progress).toBe(1);
  });

  it('does nothing at an empty station, a counter or while not holding work', () => {
    const state = newGame();
    const t = addTicket(state, COL.counter);
    standAt(state, 1, COL.keyboard);
    holdWork(state, 10);
    standAt(state, 1, COL.counter);
    holdWork(state, 10);
    expect(t.steps.every((s) => s.progress === 0)).toBe(true);
    const k = addTicket(state, COL.keyboard);
    standAt(state, 1, COL.keyboard);
    for (let i = 0; i < 10; i++) tick(state, [cmd(state, 1, {})]);
    expect(getStep(k, 'code')?.progress).toBe(0);
  });

  it('two players working one station do not stack', () => {
    const state = newGame();
    const t = addTicket(state, COL.keyboard);
    // Player 1 below the keyboard, player 2 diagonally next to them, both facing it.
    standAt(state, 1, COL.keyboard);
    const p2 = getPlayer(state, 2);
    if (!p2) throw new Error('No player 2');
    p2.pos = { x: COL.keyboard + 1, y: 2 };
    p2.facing = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };
    expect(targetTile(state, 2)).toEqual({ x: COL.keyboard, y: 1 });
    holdWork(state, 10, [1, 2]);
    expect(targetTile(state, 2)).toEqual({ x: COL.keyboard, y: 1 });
    expect(getStep(t, 'code')?.progress).toBeCloseTo(10 * WORK_RATE);
  });

  it('works carried tickets nowhere: the ticket must be on the station', () => {
    const state = newGame();
    const t = addTicket(state, COL.counter);
    standAt(state, 1, COL.counter);
    press(state);
    standAt(state, 1, COL.keyboard);
    holdWork(state, 10);
    expect(getStep(t, 'code')?.progress).toBe(0);
    expect(ticketOnTile(state, COL.keyboard, 1)).toBeUndefined();
  });
});

describe('queues', () => {
  it('takes the oldest ticket from the inbox, and never puts one back', () => {
    const state = newGame();
    const first = enqueueTicket(state, 'feature', 'First');
    const second = enqueueTicket(state, 'feature', 'Second');
    standAt(state, 1, COL.inbox);
    press(state);
    expect(first.location).toEqual({ kind: 'player', playerId: 1 });
    expect(second.location).toEqual({ kind: 'queue', queue: 'feature' });
    press(state);
    expect(first.location).toEqual({ kind: 'player', playerId: 1 });
    standAt(state, 2, COL.inbox);
    press(state, 2);
    expect(second.location).toEqual({ kind: 'player', playerId: 2 });
  });

  it('holds any number of tickets', () => {
    const state = newGame();
    for (let i = 0; i < 10; i++) enqueueTicket(state, 'feature', `T${i}`);
    expect(state.tickets.filter((t) => t.location.kind === 'queue')).toHaveLength(10);
  });

  it('keeps bugs and features apart', () => {
    const state = newGame();
    const feature = enqueueTicket(state, 'feature', 'Feature');
    const bug = enqueueTicket(state, 'bug', 'Bug');
    standAt(state, 1, COL.bugQueue);
    press(state);
    expect(bug.location).toEqual({ kind: 'player', playerId: 1 });
    expect(feature.location.kind).toBe('queue');
  });
});

describe('steps in order', () => {
  it('a bug is tested first, then coded, then tested again', () => {
    const state = newGame();
    const bug = addTicket(state, COL.testBench, { kind: 'bug' });
    standAt(state, 1, COL.testBench);
    holdWork(state, Math.ceil(1 / WORK_RATE) + 10);
    expect(bug.steps.map((s) => s.progress)).toEqual([1, 0, 0, 0]);

    bug.location = { kind: 'tile', x: COL.keyboard, y: 1 };
    standAt(state, 1, COL.keyboard);
    holdWork(state, Math.ceil(1 / WORK_RATE));
    expect(bug.steps.map((s) => s.progress)).toEqual([1, 1, 0, 0]);

    bug.location = { kind: 'tile', x: COL.testBench, y: 1 };
    standAt(state, 1, COL.testBench);
    holdWork(state, Math.ceil(1 / WORK_RATE));
    expect(bug.steps.map((s) => s.progress)).toEqual([1, 1, 1, 0]);
  });
});

describe('pipeline', () => {
  it('refuses tickets that still need code', () => {
    for (const kind of ['feature', 'bug'] as const) {
      const state = newGame();
      // A bug with only its reproduction test done still needs code.
      const t = addTicket(state, COL.counter, { kind, done: kind === 'bug' ? 1 : 0 });
      give(1, t);
      standAt(state, 1, COL.pipeline);
      press(state);
      expect(t.location).toEqual({ kind: 'player', playerId: 1 });
    }
  });

  it('refuses a ticket whose build is already done', () => {
    const state = newGame();
    const t = addTicket(state, COL.counter, { done: 3 });
    give(1, t);
    standAt(state, 1, COL.pipeline);
    press(state);
    expect(t.location).toEqual({ kind: 'player', playerId: 1 });
  });

  it('builds on its own in PIPELINE_BUILD_TICKS, then hands the ticket back', () => {
    const state = newGame();
    const t = addTicket(state, COL.counter, { done: 2 });
    give(1, t);
    standAt(state, 1, COL.pipeline);
    press(state);
    expect(t.location).toEqual({ kind: 'tile', x: COL.pipeline, y: 1 });
    // The put-down tick already built once; the release tick too.
    idle(state, PIPELINE_BUILD_TICKS - 3);
    expect(getStep(t, 'pipeline')?.progress).toBeLessThan(1);
    press(state);
    expect(t.location).toEqual({ kind: 'tile', x: COL.pipeline, y: 1 });
    idle(state, 1);
    expect(getStep(t, 'pipeline')?.progress).toBe(1);
    press(state);
    expect(t.location).toEqual({ kind: 'player', playerId: 1 });
  });

  it('does not build with the work button', () => {
    const state = newGame();
    const t = addTicket(state, COL.pipeline, { done: 2 });
    standAt(state, 1, COL.pipeline);
    holdWork(state, 10);
    expect(getStep(t, 'pipeline')?.progress).toBeCloseTo(10 / PIPELINE_BUILD_TICKS);
  });
});

describe('skipping tests', () => {
  it('a feature can go from code straight to the pipeline', () => {
    const state = newGame();
    const t = addTicket(state, COL.counter, { done: 1 });
    give(1, t);
    standAt(state, 1, COL.pipeline);
    press(state);
    expect(t.location).toEqual({ kind: 'tile', x: COL.pipeline, y: 1 });
    idle(state, PIPELINE_BUILD_TICKS);
    expect(t.steps.map((s) => s.progress)).toEqual([1, 0, 1]);
  });

  it('a bug can be coded without reproducing it first', () => {
    const state = newGame();
    const bug = addTicket(state, COL.keyboard, { kind: 'bug' });
    standAt(state, 1, COL.keyboard);
    holdWork(state, Math.ceil(1 / WORK_RATE));
    expect(bug.steps.map((s) => s.progress)).toEqual([0, 1, 0, 0]);
  });

  it('a skipped test can still be done after the pipeline', () => {
    const state = newGame();
    const t = addTicket(state, COL.testBench, { done: 1 });
    const test = t.steps[1];
    const pipeline = t.steps[2];
    if (!test || !pipeline) throw new Error('feature has 3 steps');
    pipeline.progress = 1;
    standAt(state, 1, COL.testBench);
    holdWork(state, 30);
    expect(test.progress).toBeCloseTo(30 * WORK_RATE);
  });

  it('testing still works before the pipeline', () => {
    const state = newGame();
    const t = addTicket(state, COL.testBench, { done: 1 });
    standAt(state, 1, COL.testBench);
    holdWork(state, 30);
    expect(getStep(t, 'test')?.progress).toBeCloseTo(30 * WORK_RATE);
  });
});
