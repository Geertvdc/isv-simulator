/**
 * Levels: an ASCII map plus the settings that make it a 3-minute round.
 */

import garageMap from '../../maps/level-01-garage.txt?raw';
import { TICKS_PER_SECOND } from './balance';
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
    intervalTicks: 12 * SECOND,
    jitterTicks: 3 * SECOND,
    maxOpenOrders: 4,
    timeLimitTicks: 60 * SECOND,
    bugTimeLimitTicks: 36 * SECOND,
  },
  // Tuned with `npm run sim`: one perfect bot averages ~170, two ~355.
  starThresholds: [100, 210, 310],
};

export const GARAGE: Level = {
  id: 'garage',
  name: LEVEL_NAMES.garage ?? 'garage',
  map: parseLevelMap(garageMap),
  ...GARAGE_SETTINGS,
};

/** A level around any map, with the garage's settings unless overridden. Handy for tests. */
export function levelWithMap(map: LevelMap, settings: Partial<LevelSettings> = {}): Level {
  return { id: 'custom', name: 'Custom', map, ...GARAGE_SETTINGS, ...settings };
}
