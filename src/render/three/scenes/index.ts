import type { LevelMap } from '../../../sim/level';
import { demoDayScene } from './demoDay';
import { downTheHallScene } from './downTheHall';
import { garageScene } from './garage';
import { middleManagementScene } from './middleManagement';
import { onCallScene } from './onCall';
import { openPlanScene } from './openPlan';
import { seedRoundScene } from './seedRound';
import type { Scene } from './types';

/**
 * The hand-built worlds, by scene id (a level's `MapLook.scene`, the same as
 * its level id). Each builds its scene round the level's map: pure and
 * deterministic. `Surroundings` looks a level's scene up here; a new scene
 * adds its file and one line.
 */
export const SCENES: Readonly<Record<string, (map: LevelMap) => Scene>> = {
  garage: garageScene,
  'open-plan': openPlanScene,
  'scale-up': downTheHallScene,
  'seed-round': seedRoundScene,
  'demo-day': demoDayScene,
  'on-call': onCallScene,
  'middle-management': middleManagementScene,
};
