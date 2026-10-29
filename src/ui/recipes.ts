import { type Level, settingsForPlayers } from '../sim/levels';
import { INTRO_RECIPE_NAMES } from '../sim/content';
import {
  DESIGNED_FEATURE_STEPS,
  REVIEWED_FEATURE_STEPS,
  type StepKind,
  TICKET_STEPS,
  type TicketKind,
} from '../sim/tickets';

export interface Recipe {
  name: string;
  steps: readonly StepKind[];
  kind?: TicketKind;
}

/**
 * The orders a round of `level` with `playerCount` players can bring, for
 * the intro card: features (and reviewed ones when the level has reviews
 * for this many players), bug fixes, and hotfixes on levels with incidents.
 */
export function levelRecipes(level: Level, playerCount: number): Recipe[] {
  const settings = settingsForPlayers(level, playerCount);
  const recipes: Recipe[] = [{ name: INTRO_RECIPE_NAMES.feature, steps: TICKET_STEPS.feature }];
  if ((settings.designShare ?? 0) > 0) {
    recipes.push({ name: INTRO_RECIPE_NAMES.designed, steps: DESIGNED_FEATURE_STEPS });
  }
  if ((settings.fullstackShare ?? 0) > 0) {
    recipes.push({
      name: INTRO_RECIPE_NAMES.fullstack,
      steps: TICKET_STEPS.fullstack,
      kind: 'fullstack',
    });
  }
  if (settings.reviewShare > 0) {
    recipes.push({ name: INTRO_RECIPE_NAMES.reviewed, steps: REVIEWED_FEATURE_STEPS });
  }
  recipes.push({ name: INTRO_RECIPE_NAMES.bug, steps: TICKET_STEPS.bug });
  if (settings.incidents) {
    recipes.push({ name: INTRO_RECIPE_NAMES.incident, steps: TICKET_STEPS.incident });
  }
  return recipes;
}
