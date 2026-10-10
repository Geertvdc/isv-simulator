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

/** Each player's hat, so players don't tell apart by color alone: player `n` gets `PLAYER_SHAPES[n - 1]`. */
export const PLAYER_SHAPES = ['circle', 'triangle', 'square', 'diamond'] as const;

export type PlayerShape = (typeof PLAYER_SHAPES)[number];

export function playerShape(id: PlayerId): PlayerShape {
  return PLAYER_SHAPES[(id - 1) % PLAYER_SHAPES.length] ?? 'circle';
}

/** A shape's outline as points around (0, 0), `size` across, for drawing it anywhere. */
export function shapePoints(
  shape: Exclude<PlayerShape, 'circle'>,
  size: number,
): { x: number; y: number }[] {
  const h = size / 2;
  switch (shape) {
    case 'triangle':
      return [
        { x: 0, y: -h * 1.15 },
        { x: h, y: h * 0.85 },
        { x: -h, y: h * 0.85 },
      ];
    case 'square':
      return [
        { x: -h * 0.85, y: -h * 0.85 },
        { x: h * 0.85, y: -h * 0.85 },
        { x: h * 0.85, y: h * 0.85 },
        { x: -h * 0.85, y: h * 0.85 },
      ];
    case 'diamond':
      return [
        { x: 0, y: -h * 1.1 },
        { x: h, y: 0 },
        { x: 0, y: h * 1.1 },
        { x: -h, y: 0 },
      ];
  }
}
