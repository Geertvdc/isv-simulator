import { describe, expect, it } from 'vitest';
import { parseLevelMap } from '../sim/level';
import { isFrontWall, wallPiece } from './mapShape';

const map = parseLevelMap(['##I##', '#1234', '##.##', '#...#', '#####'].join('\n'));

describe('wall pieces', () => {
  it('shows the front face of a back wall with room in front', () => {
    expect(wallPiece(map, 0, 0)).toBe('wall-inner');
    expect(wallPiece(map, 1, 0)).toBe('wall');
  });

  it('cuts down the walls on the front edge and walls with room behind them', () => {
    expect(isFrontWall(map, 2, 4)).toBe(true);
    expect(isFrontWall(map, 1, 2)).toBe(true);
    expect(wallPiece(map, 1, 2)).toBe('wall-front');
  });

  it('is never a front wall for anything but walls', () => {
    expect(isFrontWall(map, 2, 0)).toBe(false);
    expect(isFrontWall(map, 2, 3)).toBe(false);
  });
});
