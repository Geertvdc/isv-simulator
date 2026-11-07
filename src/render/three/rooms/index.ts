import type { FloorTheme, WallTheme } from '../../mapLook';
import { GARAGE_ROOM } from './garage';
import { LOFT_ROOM } from './loft';
import { OFFICE_PARK_ROOM } from './officePark';
import type { FloorDressing, RoomDressing } from './types';
import { WAREHOUSE_ROOM } from './warehouse';

/**
 * How each wall theme dresses its room, for `MapView`; themes not listed
 * are built the default way. A new theme adds its file and one line.
 */
export const ROOMS: Partial<Record<WallTheme, RoomDressing>> = {
  garage: GARAGE_ROOM,
  officePark: OFFICE_PARK_ROOM,
  warehouse: WAREHOUSE_ROOM,
  loft: LOFT_ROOM,
};

/**
 * The floor for `theme` in a room dressed by `own`: its own floor if it is
 * for this theme, else the first room's that is (so a floor looks the same
 * whatever walls it has), else none (the theme's plain floor).
 */
export function floorDressing(
  theme: FloorTheme,
  own: RoomDressing | undefined,
): FloorDressing | undefined {
  if (own?.floor?.theme === theme) return own.floor;
  return Object.values(ROOMS).find((r) => r.floor?.theme === theme)?.floor;
}
