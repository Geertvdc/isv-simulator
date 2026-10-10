import { type Level, settingsForPlayers } from '../sim/levels';
import { INTRO_RECIPE_NAMES } from '../sim/content';
import { REVIEWED_FEATURE_STEPS, type StepKind, TICKET_STEPS } from '../sim/tickets';

export interface Recipe {
  name: string;
  steps: readonly StepKind[];
}

/**
 * The orders a round of `level` with `playerCount` players can bring, for
 * the intro card: features (and reviewed ones when the level has reviews
 * for this many players), bug fixes, and hotfixes on levels with incidents.
 */
export function levelRecipes(level: Level, playerCount: number): Recipe[] {
  const settings = settingsForPlayers(level, playerCount);
  const recipes: Recipe[] = [{ name: INTRO_RECIPE_NAMES.feature, steps: TICKET_STEPS.feature }];
  if (settings.reviewShare > 0) {
    recipes.push({ name: INTRO_RECIPE_NAMES.reviewed, steps: REVIEWED_FEATURE_STEPS });
  }
  recipes.push({ name: INTRO_RECIPE_NAMES.bug, steps: TICKET_STEPS.bug });
  if (settings.incidents) {
    recipes.push({ name: INTRO_RECIPE_NAMES.incident, steps: TICKET_STEPS.incident });
  }
  return recipes;
}
