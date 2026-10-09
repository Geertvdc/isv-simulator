import { describe, expect, it } from 'vitest';
import { ORDER_RATE_BY_PLAYERS } from './balance';
import { GARAGE, orderRate, settingsForPlayers } from './levels';
import { createGame } from './state';

describe('settingsForPlayers', () => {
  it('keeps the level settings for one player', () => {
    const { durationTicks, orderSchedule, starThresholds } = GARAGE;
    expect(settingsForPlayers(GARAGE, 1)).toEqual({
      durationTicks,
      orderSchedule,
      starThresholds,
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

  it('clamps the player count to the table', () => {
    expect(orderRate(0)).toBe(orderRate(1));
    expect(orderRate(9)).toBe(orderRate(ORDER_RATE_BY_PLAYERS.length));
  });

  it('createGame uses the settings for its number of players', () => {
    expect(createGame(GARAGE, 1, [1, 2, 3]).settings).toEqual(settingsForPlayers(GARAGE, 3));
  });
});
