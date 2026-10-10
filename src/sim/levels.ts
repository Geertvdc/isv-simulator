/**
 * Levels: an ASCII map plus the settings that make it a 3-minute round.
 */

import garageMap from '../../maps/level-01-garage.txt?raw';
import openPlanMap from '../../maps/level-02-open-plan.txt?raw';
import downTheHallMap from '../../maps/level-03-scale-up.txt?raw';
import seedRoundMap from '../../maps/level-04-seed-round.txt?raw';
import demoDayMap from '../../maps/level-05-demo-day.txt?raw';
import onCallMap from '../../maps/level-06-on-call.txt?raw';
import middleManagementMap from '../../maps/level-07-middle-management.txt?raw';
import hypergrowthMap from '../../maps/level-08-hypergrowth.txt?raw';
import hotDeskingMap from '../../maps/level-09-hot-desking.txt?raw';
import backToBackMap from '../../maps/level-10-back-to-back.txt?raw';
import synergyMap from '../../maps/level-11-synergy.txt?raw';
import theReorgMap from '../../maps/level-12-the-reorg.txt?raw';
import {
  CHAPTER_STAR_GATES,
  ORDER_RATE_BY_PLAYERS,
  REVIEWERS_NEEDED,
  TICKS_PER_SECOND,
} from './balance';
import { CHAPTER_NAMES, LEVEL_NAMES } from './content';
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

/** When calendar invites go out. Players have one invite at most. */
export interface MeetingSchedule {
  /** Tick of the first invite. */
  firstTick: number;
  /** Average ticks between two invites, solo; more players get them more often. */
  intervalTicks: number;
  /** Each interval is randomly up to this many ticks shorter or longer. */
  jitterTicks: number;
  /** Ticks an invite lasts before it's missed. */
  timeLimitTicks: number;
  /** Ticks the invited player must stand in the meeting room. */
  attendTicks: number;
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
  /** Calendar invites, or `null` for none. Needs meeting tiles (`m`) on the map. */
  meetings: MeetingSchedule | null;
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
  meetings: null,
};

/** A level from its id, map text and settings; the name comes from `content.ts`. */
function level(id: string, mapText: string, settings: LevelSettings): Level {
  return { id, name: LEVEL_NAMES[id] ?? id, map: parseLevelMap(mapText), ...settings };
}

// ---- Garage ----

export const GARAGE: Level = level('garage', garageMap, GARAGE_SETTINGS);

/** Split down the middle by a counter wall: code on the left, test and ship on the right. */
export const OPEN_PLAN: Level = level('open-plan', openPlanMap, {
  ...GARAGE_SETTINGS,
  // Tuned with `npm run sim`: perfect bots average ~160 solo, ~270 with two.
  starThresholds: [45, 90, 135],
  reviewShare: 0.3,
});

/**
 * The review station sits at the end of a long corridor, and half the
 * features need a review. Was "The Scale-Up" before the Scale-Up chapter;
 * keeps its id so saves still count.
 */
export const DOWN_THE_HALL: Level = level('scale-up', downTheHallMap, {
  ...GARAGE_SETTINGS,
  // Tuned with `npm run sim` for two or more: perfect bots average ~270 with two.
  // Solo has no reviews and scores more (~215).
  starThresholds: [45, 90, 135],
  reviewShare: 0.5,
});

// ---- Startup: production incidents ----

/** Incidents on a calm schedule, for the level that teaches them. */
const CALM_INCIDENTS: IncidentSchedule = {
  firstTick: 30 * SECOND,
  intervalTicks: 60 * SECOND,
  jitterTicks: 10 * SECOND,
  timeLimitTicks: 35 * SECOND,
};

const INCIDENTS: IncidentSchedule = {
  firstTick: 25 * SECOND,
  intervalTicks: 45 * SECOND,
  jitterTicks: 10 * SECOND,
  timeLimitTicks: 30 * SECOND,
};

/** Open loft, a desk island in the middle: incidents and nothing else new. */
export const SEED_ROUND: Level = level('seed-round', seedRoundMap, {
  ...GARAGE_SETTINGS,
  // Perfect bots average ~235 solo, ~395 with two (`npm run sim`).
  starThresholds: [65, 130, 200],
  incidents: CALM_INCIDENTS,
});

/** A counter wall across the room, one gap on the right: throw it over. Reviews too. */
export const DEMO_DAY: Level = level('demo-day', demoDayMap, {
  ...GARAGE_SETTINGS,
  // Perfect bots average ~190 solo, ~305 with two (`npm run sim`).
  starThresholds: [50, 100, 155],
  reviewShare: 0.3,
  incidents: INCIDENTS,
});

/** A ring corridor around the review room: long walks while production burns. */
export const ON_CALL: Level = level('on-call', onCallMap, {
  ...GARAGE_SETTINGS,
  // Perfect bots average ~155 solo, ~255 with two (`npm run sim`).
  starThresholds: [45, 90, 130],
  reviewShare: 0.4,
  incidents: INCIDENTS,
});

// ---- Scale-Up: the wandering manager ----

/** Wide aisles, one manager: the manager and nothing else new. */
export const MIDDLE_MANAGEMENT: Level = level('middle-management', middleManagementMap, {
  ...GARAGE_SETTINGS,
  // Perfect bots average ~195 solo, ~370 with two (`npm run sim`).
  starThresholds: [55, 115, 170],
});

/** Two rooms joined by two narrow doors, a manager who likes standing in them, and incidents. */
export const HYPERGROWTH: Level = level('hypergrowth', hypergrowthMap, {
  ...GARAGE_SETTINGS,
  // Perfect bots average ~180 solo, ~385 with two (`npm run sim`).
  starThresholds: [50, 100, 155],
  incidents: INCIDENTS,
});

/** Rows of desks, two managers in the aisles, reviews and incidents. */
export const HOT_DESKING: Level = level('hot-desking', hotDeskingMap, {
  ...GARAGE_SETTINGS,
  // Perfect bots average ~175 solo, ~330 with two (`npm run sim`).
  starThresholds: [50, 100, 155],
  reviewShare: 0.3,
  incidents: INCIDENTS,
});

// ---- Enterprise: meetings ----

/** Invites on a calm schedule, for the level that teaches them. */
const CALM_MEETINGS: MeetingSchedule = {
  firstTick: 20 * SECOND,
  intervalTicks: 45 * SECOND,
  jitterTicks: 8 * SECOND,
  timeLimitTicks: 25 * SECOND,
  attendTicks: 4 * SECOND,
};

const MEETINGS: MeetingSchedule = {
  firstTick: 20 * SECOND,
  intervalTicks: 35 * SECOND,
  jitterTicks: 8 * SECOND,
  timeLimitTicks: 20 * SECOND,
  attendTicks: 4 * SECOND,
};

/** A meeting room in the corner of a calm office: meetings and nothing else new. */
export const BACK_TO_BACK: Level = level('back-to-back', backToBackMap, {
  ...GARAGE_SETTINGS,
  // Perfect bots average ~155 solo, ~335 with two (`npm run sim`).
  starThresholds: [50, 100, 145],
  meetings: CALM_MEETINGS,
});

/** The meeting room is up a corridor, a manager wanders it, and production still breaks. */
export const SYNERGY: Level = level('synergy', synergyMap, {
  ...GARAGE_SETTINGS,
  // Perfect bots average ~160 solo, ~295 with two (`npm run sim`).
  starThresholds: [45, 90, 135],
  incidents: INCIDENTS,
  meetings: MEETINGS,
});

/** Everything at once: reviews, incidents, a manager and meetings. */
export const THE_REORG: Level = level('the-reorg', theReorgMap, {
  ...GARAGE_SETTINGS,
  // Perfect bots average ~180 solo, ~305 with two (`npm run sim`).
  starThresholds: [45, 90, 140],
  reviewShare: 0.3,
  incidents: INCIDENTS,
  meetings: MEETINGS,
});

/** A stage of the company: three levels, open from a total number of stars. */
export interface Chapter {
  id: string;
  name: string;
  levels: readonly Level[];
  /** Best stars over all levels needed to open it. */
  starGate: number;
}

function chapter(id: string, index: number, levels: readonly Level[]): Chapter {
  return { id, name: CHAPTER_NAMES[id] ?? id, levels, starGate: CHAPTER_STAR_GATES[index] ?? 0 };
}

/** The campaign, in order. */
export const CHAPTERS: readonly Chapter[] = [
  chapter('garage', 0, [GARAGE, OPEN_PLAN, DOWN_THE_HALL]),
  chapter('startup', 1, [SEED_ROUND, DEMO_DAY, ON_CALL]),
  chapter('scale-up', 2, [MIDDLE_MANAGEMENT, HYPERGROWTH, HOT_DESKING]),
  chapter('enterprise', 3, [BACK_TO_BACK, SYNERGY, THE_REORG]),
];

/** Every level, in level select order: chapter by chapter. */
export const LEVELS: readonly Level[] = CHAPTERS.flatMap((c) => c.levels);

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
    meetings: level.meetings && {
      ...level.meetings,
      intervalTicks: Math.round(level.meetings.intervalTicks / rate),
      jitterTicks: Math.round(level.meetings.jitterTicks / rate),
    },
  };
}

/** A level around any map, with the garage's solo settings unless overridden. Handy for tests. */
export function levelWithMap(map: LevelMap, settings: Partial<LevelSettings> = {}): Level {
  return { id: 'custom', name: 'Custom', map, ...GARAGE_SETTINGS, ...settings };
}
