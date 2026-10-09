import type { PlayerId } from '../sim/state';

/** Placeholder player colors until the art pass: player `n` gets `PLAYER_COLORS[n - 1]`. */
export const PLAYER_COLORS: readonly number[] = [0xff6b6b, 0x4fc3f7, 0xffd166, 0x9ccc65];

export function playerColor(id: PlayerId): number {
  return PLAYER_COLORS[(id - 1) % PLAYER_COLORS.length] ?? 0xffffff;
}

/** The same color as a CSS string, for the DOM overlay. */
export function playerCssColor(id: PlayerId): string {
  return `#${playerColor(id).toString(16).padStart(6, '0')}`;
}
