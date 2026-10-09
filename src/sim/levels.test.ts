import { describe, expect, it } from 'vitest';
import { ORDER_RATE_BY_PLAYERS } from './balance';
import { MAX_PLAYERS, getTile } from './level';
import { GARAGE, LEVELS, levelById, orderRate, settingsForPlayers } from './levels';
import { createGame } from './state';

describe('settingsForPlayers', () => {
  it('keeps the level settings for one player', () => {
    const { durationTicks, orderSchedule, starThresholds, reviewShare } = GARAGE;
    expect(settingsForPlayers(GARAGE, 1)).toEqual({
      durationTicks,
      orderSchedule,
      starThresholds,
      reviewShare,
    });
  });

  it('more players get orders faster, more open orders and higher stars', () => {
    let previous = settingsForPlayers(GARAGE, 1);
    for (const count of [2, 3, 4]) {
      const next = settingsForPlayers(GARAGE, count);
      expect(next.orderSchedule.intervalTicks).toBeLessThan(previous.orderSchedule.intervalTicks);
      expect(next.orderSchedule.maxOpenOrders).toBeGreaterThanOrEqual(
        previous.orderSchedule.maxOpenOrders,
      );
      expect(next.starThresholds[2]).toBeGreaterThan(previous.starThresholds[2]);
      expect(next.durationTicks).toBe(GARAGE.durationTicks);
      expect(next.orderSchedule.timeLimitTicks).toBe(GARAGE.orderSchedule.timeLimitTicks);
      previous = next;
    }
  });

  it('scales the interval by the order rate for the player count', () => {
    const rate = ORDER_RATE_BY_PLAYERS[1] ?? 1;
    expect(settingsForPlayers(GARAGE, 2).orderSchedule.intervalTicks).toBe(
      Math.round(GARAGE.orderSchedule.intervalTicks / rate),
    );
  });

  it('drops reviews solo, since a review needs two', () => {
    const level = { ...GARAGE, reviewShare: 0.4 };
    expect(settingsForPlayers(level, 1).reviewShare).toBe(0);
    expect(settingsForPlayers(level, 2).reviewShare).toBe(0.4);
    expect(settingsForPlayers(level, 4).reviewShare).toBe(0.4);
  });

  it('clamps the player count to the table', () => {
    expect(orderRate(0)).toBe(orderRate(1));
    expect(orderRate(9)).toBe(orderRate(ORDER_RATE_BY_PLAYERS.length));
  });

  it('createGame uses the settings for its number of players', () => {
    expect(createGame(GARAGE, 1, [1, 2, 3]).settings).toEqual(settingsForPlayers(GARAGE, 3));
  });
});

describe('levels', () => {
  it('have unique ids and can be found by id', () => {
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LEVELS.length);
    for (const level of LEVELS) expect(levelById(level.id)).toBe(level);
    expect(levelById('nope')).toBeUndefined();
  });

  for (const level of LEVELS) {
    it(`${level.name} parses with a spawn per player and one of each must-have tile`, () => {
      expect(level.map.spawns).toHaveLength(MAX_PLAYERS);
      for (const tile of [
        'inbox',
        'bugQueue',
        'keyboard',
        'testBench',
        'pipeline',
        'ship',
        'bin',
      ]) {
        expect(level.map.tiles).toContain(tile);
      }
      expect(level.map.width).toBe(14);
      expect(level.map.height).toBe(10);
    });

    it(`${level.name}: every review station can be worked from two sides`, () => {
      const { map } = level;
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          if (getTile(map, x, y) !== 'review') continue;
          const open = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ].filter(([dx = 0, dy = 0]) => getTile(map, x + dx, y + dy) === 'floor');
          expect(open.length).toBeGreaterThanOrEqual(2);
        }
      }
      if (level.reviewShare > 0) expect(map.tiles).toContain('review');
    });
  }
});
