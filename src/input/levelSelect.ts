/** Picking a level after the lobby: any joined player moves the cursor or picks. */

import type { DeviceId, DevicePress } from './controller';

export interface LevelSelect {
  /** The highlighted level, an index into the level list. */
  index: number;
  /** Set once a player picked the highlighted level. */
  chosen: boolean;
}

export function createLevelSelect(index = 0): LevelSelect {
  return { index, chosen: false };
}

/**
 * Applies this frame's presses from joined devices: left/up and right/down
 * move the cursor (stopping at the ends), interact or join picks. Returns
 * whether anything changed.
 */
export function updateLevelSelect(
  select: LevelSelect,
  presses: readonly DevicePress[],
  joined: ReadonlySet<DeviceId>,
  levelCount: number,
): boolean {
  if (select.chosen) return false;
  let changed = false;
  for (const press of presses) {
    if (!joined.has(press.deviceId)) continue;
    if (press.interact || press.join) {
      select.chosen = true;
      return true;
    }
    const step = press.nav.x !== 0 ? press.nav.x : press.nav.y;
    const index = Math.min(Math.max(select.index + step, 0), levelCount - 1);
    if (index !== select.index) {
      select.index = index;
      changed = true;
    }
  }
  return changed;
}
