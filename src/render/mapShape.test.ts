import { describe, expect, it } from 'vitest';
import { parseLevelMap } from '../sim/level';
import { WALL_DECOS, WALL_DECO_SPREAD, isFrontWall, wallDeco, wallPiece } from './mapShape';

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

describe('wallDeco', () => {
  it('never hangs the same decoration twice close by along a wall', () => {
    for (const theme of ['plaster', 'wood', 'glass'] as const) {
      for (let y = 0; y < 12; y++) {
        const row = Array.from({ length: 60 }, (_, x) => wallDeco(x, y, theme));
        row.forEach((deco, x) => {
          if (!deco) return;
          const before = row.slice(Math.max(0, x - WALL_DECO_SPREAD), x);
          expect(before, `${theme} ${x},${y}`).not.toContain(deco);
        });
      }
    }
  });

  it('uses every decoration of a theme', () => {
    for (const theme of ['plaster', 'wood', 'glass'] as const) {
      const seen = new Set<string | null>();
      for (let y = 0; y < 20; y++) for (let x = 0; x < 40; x++) seen.add(wallDeco(x, y, theme));
      for (const deco of WALL_DECOS[theme]) expect(seen).toContain(deco);
    }
  });
});
