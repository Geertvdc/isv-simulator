import { describe, expect, it } from 'vitest';
import { PIPELINE_FAIL_TICKS, REPAIR_TICKS, TICKS_PER_SECOND } from './balance';
import { botInput, createBot, findPath, runBots } from './bot';
import { parseLevelMap } from './level';
import { DOWN_THE_HALL, GARAGE, levelWithMap } from './levels';
import { createOrder } from './orders';
import { createGame } from './state';
import { pipelineAt } from './pipeline';
import { COL, addTicket, idle, newTestGame } from './testing';
import { tick } from './tick';

describe('findPath', () => {
  const map = parseLevelMap(['#####', '#1.K#', '#2#.#', '#34.#', '#####'].join('\n'));

  it('finds the shortest walk to a tile next to the target', () => {
    expect(findPath(map, { x: 1, y: 3 }, { x: 3, y: 1 })).toEqual([
      { x: 2, y: 3 },
      { x: 3, y: 3 },
      { x: 3, y: 2 },
    ]);
  });

  it('is empty when already standing next to the target', () => {
    expect(findPath(map, { x: 2, y: 1 }, { x: 3, y: 1 })).toEqual([]);
  });

  it('walks around blocked tiles (a manager) when there is a way around', () => {
    const open = parseLevelMap(['#####', '#1.K#', '#2..#', '#34.#', '#####'].join('\n'));
    const path = findPath(open, { x: 1, y: 2 }, { x: 3, y: 1 }, [], [{ x: 2, y: 2 }]);
    expect(path).not.toBeNull();
    expect(path).not.toContainEqual({ x: 2, y: 2 });
  });

  it('is null when the target cannot be reached', () => {
    const walled = parseLevelMap(['######', '#1#.K#', '#2#.##', '#34###', '######'].join('\n'));
    expect(findPath(walled, { x: 1, y: 1 }, { x: 4, y: 1 })).toBeNull();
  });
});

describe('bot run on the garage', () => {
  it('two bots with a fixed seed earn at least 1 star', () => {
    const run = runBots(GARAGE, 1, 2);
    expect(run.shipped).toBeGreaterThan(5);
    expect(run.result.stars).toBeGreaterThanOrEqual(1);
  });

  it('bots that skip tests ship untested and get more bugs', () => {
    const tested = runBots(GARAGE, 1, 2);
    const skipping = runBots(GARAGE, 1, 2, { skipTests: true });
    expect(tested.shippedUntested).toBe(0);
    expect(skipping.shippedUntested).toBe(skipping.shipped);
    expect(skipping.shippedBugs).toBeGreaterThan(tested.shippedBugs);
  });

  it('is deterministic per seed', () => {
    expect(runBots(GARAGE, 3, 2)).toEqual(runBots(GARAGE, 3, 2));
  });
});

// Every level's 1-star bot runs live in campaign.test.ts.
describe('bot runs', () => {
  it('two bots team up for reviews', () => {
    const run = runBots(DOWN_THE_HALL, 1, 2);
    expect(run.shippedReviewed).toBeGreaterThan(2);
    expect(run.expired).toBeLessThanOrEqual(1);
  });
});

describe('bot and new mechanics', () => {
  it('an invited bot walks to the meeting room and sits the meeting out', () => {
    const map = parseLevelMap(['########', '#1...mm#', '#234.mm#', '########'].join('\n'));
    const meetings = {
      firstTick: 0,
      intervalTicks: 100_000,
      jitterTicks: 0,
      timeLimitTicks: 20 * TICKS_PER_SECOND,
      attendTicks: 4 * TICKS_PER_SECOND,
    };
    const state = createGame(levelWithMap(map, { meetings }), 1, [1]);
    state.nextOrderTick = Number.MAX_SAFE_INTEGER;
    const bot = createBot(1);
    let attended = false;
    for (let i = 0; i < 15 * TICKS_PER_SECOND && !attended; i++) {
      tick(state, [botInput(state, bot, [bot])]);
      attended = state.events.some((e) => e.type === 'meetingAttended');
    }
    expect(attended).toBe(true);
  });

  it('takes the incident hotfix before an older bug', () => {
    const state = newTestGame({
      incidents: { firstTick: 0, intervalTicks: 100_000, jitterTicks: 0, timeLimitTicks: 10_000 },
    });
    state.nextIncidentTick = 1;
    createOrder(state, 'bug', 'Bug: old');
    const bot = createBot(1);
    for (let i = 0; i < 5 * TICKS_PER_SECOND; i++) {
      tick(state, [botInput(state, bot, [bot])]);
      if (state.tickets.some((t) => t.location.kind === 'player')) break;
    }
    const carried = state.tickets.find((t) => t.location.kind === 'player');
    expect(carried?.kind).toBe('incident');
  });
});

describe('bot and a broken pipeline', () => {
  it('takes its ticket out, repairs the pipeline and builds again', () => {
    const state = newTestGame();
    const ticket = addTicket(state, COL.pipeline, { done: 3 });
    idle(state, PIPELINE_FAIL_TICKS);
    expect(pipelineAt(state, COL.pipeline, 1)?.broken).toBe(true);

    const bot = createBot(1);
    bot.ticketId = ticket.id;
    for (let i = 0; i < REPAIR_TICKS + 10 * TICKS_PER_SECOND; i++) {
      tick(state, [botInput(state, bot, [bot])]);
      if (ticket.location.kind === 'tile' && !pipelineAt(state, COL.pipeline, 1)?.broken) break;
    }
    expect(pipelineAt(state, COL.pipeline, 1)?.broken).toBe(false);
    expect(ticket.location).toEqual({ kind: 'tile', x: COL.pipeline, y: 1 });
  });
});
