/**
 * Levels: an ASCII map plus the settings that make it a 3-minute round.
 */

import garageMap from '../../maps/level-01-garage.txt?raw';
import openPlanMap from '../../maps/level-02-open-plan.txt?raw';
import scaleUpMap from '../../maps/level-03-scale-up.txt?raw';
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

/** When production incidents happen. Only one is open at a time. */
export interface IncidentSchedule {
  /** Tick of the first incident. */
  firstTick: number;
  /** Average ticks from one incident opening to the next. */
  intervalTicks: number;
  /** Each interval is randomly up to this many ticks shorter or longer. */
  jitterTicks: number;
  /** Ticks an incident order lasts. */
  timeLimitTicks: number;
}

export interface LevelSettings {
  durationTicks: number;
  orderSchedule: OrderSchedule;
  /** Score needed for 1, 2 and 3 stars. */
  starThresholds: [number, number, number];
  /** Share of feature orders that need a code review (0 to 1). Always 0 solo: a review needs two. */
  reviewShare: number;
  /** Production incidents, or `null` for none. The same for any number of players. */
  incidents: IncidentSchedule | null;
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
  incidents: null,
};

export const GARAGE: Level = {
  id: 'garage',
  name: LEVEL_NAMES.garage ?? 'garage',
  map: parseLevelMap(garageMap),
  ...GARAGE_SETTINGS,
};

/** Split down the middle by a counter wall: code on the left, test and ship on the right. */
export const OPEN_PLAN: Level = {
  id: 'open-plan',
  name: LEVEL_NAMES['open-plan'] ?? 'open-plan',
  map: parseLevelMap(openPlanMap),
  ...GARAGE_SETTINGS,
  // Tuned with `npm run sim`: perfect bots average ~160 solo, ~270 with two.
  starThresholds: [45, 90, 135],
  reviewShare: 0.3,
};

/** The review station sits at the end of a long corridor, and half the features need a review. */
export const SCALE_UP: Level = {
  id: 'scale-up',
  name: LEVEL_NAMES['scale-up'] ?? 'scale-up',
  map: parseLevelMap(scaleUpMap),
  ...GARAGE_SETTINGS,
  // Tuned with `npm run sim` for two or more: perfect bots average ~270 with two.
  // Solo has no reviews and scores more (~215).
  starThresholds: [45, 90, 135],
  reviewShare: 0.5,
};

/** Every level, in level select order. */
export const LEVELS: readonly Level[] = [GARAGE, OPEN_PLAN, SCALE_UP];

export function levelById(id: string): Level | undefined {
  return LEVELS.find((l) => l.id === id);
}

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
    incidents: level.incidents,
  };
}

/** A level around any map, with the garage's solo settings unless overridden. Handy for tests. */
export function levelWithMap(map: LevelMap, settings: Partial<LevelSettings> = {}): Level {
  return { id: 'custom', name: 'Custom', map, ...GARAGE_SETTINGS, ...settings };
}
