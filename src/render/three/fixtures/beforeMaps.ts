/**
 * The Garage, Startup and Middle Management maps from before the level
 * redesign (phase 23), for the environment tests only. The environment art
 * of these levels was built while both layouts existed and still fits both;
 * the tests call these the "shipped" maps and keep checking that. They go
 * when the art pass for the new maps removes the old-layout code.
 */

import { type LevelMap, parseLevelMap } from '../../../sim/level';
import garage from './level-01-garage.before.txt?raw';
import openPlan from './level-02-open-plan.before.txt?raw';
import downTheHall from './level-03-scale-up.before.txt?raw';
import seedRound from './level-04-seed-round.before.txt?raw';
import demoDay from './level-05-demo-day.before.txt?raw';
import onCall from './level-06-on-call.before.txt?raw';
import middleManagement from './level-07-middle-management.before.txt?raw';

export const BEFORE_MAPS = {
  garage: parseLevelMap(garage),
  'open-plan': parseLevelMap(openPlan),
  'scale-up': parseLevelMap(downTheHall),
  'seed-round': parseLevelMap(seedRound),
  'demo-day': parseLevelMap(demoDay),
  'on-call': parseLevelMap(onCall),
  'middle-management': parseLevelMap(middleManagement),
} satisfies Record<string, LevelMap>;
