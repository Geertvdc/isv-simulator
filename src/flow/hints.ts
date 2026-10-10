/**
 * First-level hints: the first time the Garage is played, labels point at
 * the inbox, the keyboard and the ship hatch until each has been used once.
 * Once all three were used the save remembers it and they never show again.
 * Pure: the scene feeds in the sim's events and state every frame.
 */

import type { GameEvent } from '../sim/orders';
import type { GameState } from '../sim/state';
import type { SaveData } from './save';

export type HintId = 'inbox' | 'keyboard' | 'ship';

/** In the order a ticket meets them. */
export const HINT_IDS: readonly HintId[] = ['inbox', 'keyboard', 'ship'];

/** The level that teaches the basics. */
export const TUTORIAL_LEVEL_ID = 'garage';

/** The hints a fresh round of `levelId` starts with: all of them, or none. */
export function startHints(levelId: string, save: SaveData): HintId[] {
  return levelId === TUTORIAL_LEVEL_ID && !save.tutorialDone ? [...HINT_IDS] : [];
}

/** Whether what happened shows hint `id` was followed. */
function used(
  id: HintId,
  events: readonly GameEvent[],
  state: Pick<GameState, 'tickets'>,
): boolean {
  switch (id) {
    // The first ticket anyone holds came from a queue.
    case 'inbox':
      return events.some((e) => e.type === 'pickedUp');
    // No event for work; any code progress on any ticket means someone coded.
    case 'keyboard':
      return state.tickets.some((t) => t.steps.some((s) => s.kind === 'code' && s.progress > 0));
    case 'ship':
      return events.some((e) => e.type === 'orderShipped');
  }
}

export interface HintUpdate {
  /** The hints still showing. */
  open: HintId[];
  /** The last hint was just followed: set `tutorialDone` and save. */
  finished: boolean;
}

/** Drops the hints this frame's events and state show were followed. */
export function updateHints(
  open: readonly HintId[],
  events: readonly GameEvent[],
  state: Pick<GameState, 'tickets'>,
): HintUpdate {
  if (open.length === 0) return { open: [], finished: false };
  const left = open.filter((id) => !used(id, events, state));
  return { open: left, finished: left.length === 0 };
}
