/**
 * Levels: an ASCII map plus the settings that make it a 3-minute round.
 */

import garageMap from '../../maps/level-01-garage.txt?raw';
import { ORDER_RATE_BY_PLAYERS, REVIEWERS_NEEDED, TICKS_PER_SECOND } from './balance';
import { LEVEL_NAMES } from './content';
import { type LevelMap, parseLevelMap } from './level';

/** When feature orders appear and how long they last. Bugs come from shipping instead. */
export interface OrderSchedule {
  /** Tick of the first feature order. */
  firstOrderTick: number;
  /** Average ticks between two feature orders. */
  intervalTicks: number;
  /** Each interval is randomly up to this many ticks shorter or longer. */
  jitterTicks: number;
  /** A due order waits while this many feature orders are open. */
  maxOpenOrders: number;
  /** Ticks a feature order lasts. */
  timeLimitTicks: number;
  /** Ticks a bug order lasts: shorter than features. */
  bugTimeLimitTicks: number;
}

export interface LevelSettings {
  durationTicks: number;
  orderSchedule: OrderSchedule;
  /** Score needed for 1, 2 and 3 stars. */
  starThresholds: [number, number, number];
  /** Share of feature orders that need a code review (0 to 1). Always 0 solo: a review needs two. */
  reviewShare: number;
}

export interface Level extends LevelSettings {
  id: string;
  name: string;
  map: LevelMap;
}

const SECOND = TICKS_PER_SECOND;

const GARAGE_SETTINGS: LevelSettings = {
  durationTicks: 180 * SECOND,
  orderSchedule: {
    firstOrderTick: 0,
    intervalTicks: 20 * SECOND,
    jitterTicks: 4 * SECOND,
    maxOpenOrders: 3,
    timeLimitTicks: 75 * SECOND,
    bugTimeLimitTicks: 45 * SECOND,
  },
  // Solo numbers; `settingsForPlayers` scales them. Tuned with `npm run sim`:
  // perfect bots average ~205 solo, ~355 with two, ~510 with three, ~635 with four.
  starThresholds: [60, 120, 180],
  reviewShare: 0,
};

export const GARAGE: Level = {
  id: 'garage',
  name: LEVEL_NAMES.garage ?? 'garage',
  map: parseLevelMap(garageMap),
  ...GARAGE_SETTINGS,
};

/** Order rate multiplier for a number of players. */
export function orderRate(playerCount: number): number {
  const i = Math.min(Math.max(playerCount, 1), ORDER_RATE_BY_PLAYERS.length) - 1;
  return ORDER_RATE_BY_PLAYERS[i] ?? 1;
}

/**
 * The level's solo settings scaled for `playerCount` players: feature orders
 * come faster, more may be open at once and stars need more points.
 */
export function settingsForPlayers(level: LevelSettings, playerCount: number): LevelSettings {
  const rate = orderRate(playerCount);
  const { orderSchedule: s } = level;
  return {
    durationTicks: level.durationTicks,
    orderSchedule: {
      ...s,
      intervalTicks: Math.round(s.intervalTicks / rate),
      jitterTicks: Math.round(s.jitterTicks / rate),
      maxOpenOrders: Math.round(s.maxOpenOrders * rate),
    },
    starThresholds: level.starThresholds.map((t) => Math.round((t * rate) / 10) * 10) as [
      number,
      number,
      number,
    ],
    reviewShare: playerCount >= REVIEWERS_NEEDED ? level.reviewShare : 0,
  };
}

/** A level around any map, with the garage's solo settings unless overridden. Handy for tests. */
export function levelWithMap(map: LevelMap, settings: Partial<LevelSettings> = {}): Level {
  return { id: 'custom', name: 'Custom', map, ...GARAGE_SETTINGS, ...settings };
}
