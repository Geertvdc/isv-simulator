/**
 * Which sound effects play for what happened in the sim. Phaser-free so it
 * can be tested; `SoundPlayer` does the playing.
 */

import type { GameEvent } from '../sim/orders';
import type { GameState } from '../sim/state';

/** Every sound effect, by key; the file is `assets/sfx/<key>.ogg`. */
export const SOUND_KEYS = [
  'pick-up',
  'put-down',
  'work',
  'ship',
  'order-expired',
  'pipeline-broke',
  'dash',
  'shove',
  'throw',
  'level-end',
] as const;

export type SoundKey = (typeof SOUND_KEYS)[number];

export function soundUrl(key: SoundKey): string {
  return `assets/sfx/${key}.ogg`;
}

/** The sound for one sim event, if it has one. */
export function soundFor(event: GameEvent): SoundKey | null {
  switch (event.type) {
    case 'pickedUp':
    case 'caught':
      return 'pick-up';
    case 'putDown':
    case 'landed':
    case 'binned':
      return 'put-down';
    case 'orderShipped':
      return 'ship';
    case 'orderExpired':
      return 'order-expired';
    case 'pipelineBroke':
      return 'pipeline-broke';
    case 'dashed':
      return 'dash';
    case 'shoved':
      return 'shove';
    case 'thrown':
      return 'throw';
    case 'levelEnded':
      return 'level-end';
    default:
      return null;
  }
}

/** Sounds for a frame's events, each at most once so a burst doesn't get loud. */
export function soundsFor(events: readonly GameEvent[]): SoundKey[] {
  const keys = new Set<SoundKey>();
  for (const event of events) {
    const key = soundFor(event);
    if (key) keys.add(key);
  }
  return [...keys];
}

/**
 * All the progress players make by hand: code, review and test steps of
 * tickets on stations, and pipeline repairs. It goes up while anyone works.
 */
export function handWork(state: GameState): number {
  let total = 0;
  for (const ticket of state.tickets) {
    if (ticket.location.kind !== 'tile') continue;
    for (const step of ticket.steps) if (step.kind !== 'pipeline') total += step.progress;
  }
  for (const pipeline of state.pipelines) total += pipeline.repair;
  return total;
}
