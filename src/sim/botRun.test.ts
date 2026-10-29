import { describe, expect, it } from 'vitest';
import { runBots } from './botRun';
import { getTile } from './level';
import { DOWN_THE_HALL, GARAGE, levelById } from './levels';

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

  it('accounts for created, shipped, expired, and remaining orders in benchmark metrics', () => {
    const run = runBots(GARAGE, 9, 2);
    const createdByRecipe = Object.entries(run.ordersByRecipeDomain)
      .filter(([key]) => key.startsWith('created:'))
      .reduce((total, [, count]) => total + count, 0);

    expect(createdByRecipe).toBe(run.ordersCreated);
    expect(run.ordersCreated).toBe(run.shipped + run.expired + run.openOrdersAtEnd);
  });

  it('reports resolved station work and utilization within available station capacity', () => {
    const run = runBots(GARAGE, 5, 2);
    const stationTypes = {
      code: 'keyboard',
      test: 'testBench',
      design: 'whiteboard',
      review: 'review',
      repair: 'pipeline',
    } as const;
    for (const task of ['code', 'test', 'design', 'review', 'repair'] as const) {
      let stationCount = 0;
      for (let y = 0; y < GARAGE.map.height; y++) {
        for (let x = 0; x < GARAGE.map.width; x++) {
          if (getTile(GARAGE.map, x, y) === stationTypes[task]) stationCount++;
        }
      }
      const capacity = stationCount * GARAGE.durationTicks;
      expect(run.stationWorkTicks[task]).toBeGreaterThanOrEqual(run.stationBusyTicks[task]);
      expect(run.stationBusyTicks[task]).toBeLessThanOrEqual(capacity);
      expect(run.stationUtilization[task]).toBeCloseTo(
        capacity === 0 ? 0 : (100 * run.stationBusyTicks[task]) / capacity,
      );
    }
  });

  it('does not strand the three-player mixed role-aware team behind queue heads', () => {
    const level = levelById('lab-roles');
    if (!level) throw new Error('Missing role lab');
    const run = runBots(level, 1, 3, {
      roles: ['generalist', 'frontend', 'qa'],
      assignmentPolicy: 'role-aware',
    });

    expect(run.queueWaitTicks).toBe(0);
  });

  it('accepts explicit role compositions and a role-aware task assignment policy', () => {
    const options = {
      roles: ['frontend', 'qa'] as const,
      assignmentPolicy: 'role-aware' as const,
    };
    expect(runBots(GARAGE, 13, 2, options)).toEqual(runBots(GARAGE, 13, 2, options));
    expect(() => runBots(GARAGE, 13, 2, { roles: ['qa'] })).toThrow(/Expected 2 role ids/);
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
