import { describe, expect, it } from 'vitest';
import { parseLevelMap } from '../../sim/level';
import { CHAPTERS } from '../../sim/levels';
import { levelSalt } from '../mapShape';
import { Surroundings, placeSetPieces } from './surroundings';
import { SETTINGS, WALL_TOP_PROPS } from './setDressing';

describe('placeSetPieces', () => {
  for (const setting of Object.keys(SETTINGS)) {
    it(`keeps every ${setting} prop off the level's slab`, () => {
      const width = 14;
      const height = 10;
      for (const p of placeSetPieces(setting, width, height)) {
        // A quarter turn swaps the prop's width and depth.
        const turned = Math.abs(Math.sin(p.yaw)) > 0.5;
        const [sx, sz] = p.piece.size;
        const halfX = (turned ? sz : sx) / 2;
        const halfZ = (turned ? sx : sz) / 2;
        const overlapsX = p.at.x + halfX > -0.5 && p.at.x - halfX < width - 0.5;
        const overlapsZ = p.at.z + halfZ > -0.5 && p.at.z - halfZ < height - 0.5;
        expect(overlapsX && overlapsZ).toBe(false);
      }
    });
  }

  for (const setting of Object.keys(SETTINGS)) {
    it(`never stands two ${setting} props in each other`, () => {
      const placed = placeSetPieces(setting, 14, 10);
      const rect = (p: (typeof placed)[number]) => {
        const turned = Math.abs(Math.sin(p.yaw)) > 0.5;
        const [sx, sz] = p.piece.size;
        // Slightly inset: props may touch, and loose ones turn a little.
        const hx = (turned ? sz : sx) / 2 - 0.15;
        const hz = (turned ? sx : sz) / 2 - 0.15;
        return { x0: p.at.x - hx, x1: p.at.x + hx, z0: p.at.z - hz, z1: p.at.z + hz };
      };
      for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) {
          const a = placed[i];
          const b = placed[j];
          if (!a || !b) continue;
          const ra = rect(a);
          const rb = rect(b);
          const overlap = ra.x0 < rb.x1 && rb.x0 < ra.x1 && ra.z0 < rb.z1 && rb.z0 < ra.z1;
          expect(overlap, `${i} and ${j} overlap`).toBe(false);
        }
      }
    });
  }

  it('shows each rare prop once', () => {
    const rare = SETTINGS.garage?.rare ?? [];
    const placed = placeSetPieces('garage', 14, 10);
    for (const piece of rare) expect(placed.filter((p) => p.piece === piece)).toHaveLength(1);
  });

  it('does not repeat the same short pattern down a row', () => {
    const left = placeSetPieces('enterprise', 14, 30)
      .filter((p) => p.side === 'left' && p.row === 'near')
      .map((p) => p.piece);
    // Not one sequence of 4 over and over, and never the same piece twice running.
    const periodic = left.slice(4).every((piece, i) => piece === left[i]);
    expect(periodic).toBe(false);
    for (let i = 1; i < left.length; i++) expect(left[i]).not.toBe(left[i - 1]);
  });

  it('puts the rare props where the camera sees them: in the side far rows', () => {
    const placed = placeSetPieces('garage', 14, 10);
    const rare = SETTINGS.garage?.rare ?? [];
    for (const piece of rare) {
      const p = placed.find((q) => q.piece === piece);
      expect(p?.side).not.toBe('back');
    }
  });

  it('places the same props in the same places every time', () => {
    expect(placeSetPieces('garage', 14, 10)).toEqual(placeSetPieces('garage', 14, 10));
  });

  it('fills both sides and the back', () => {
    const at = placeSetPieces('enterprise', 14, 10).map((p) => p.at);
    expect(at.some((p) => p.x < -0.5)).toBe(true);
    expect(at.some((p) => p.x > 13.5)).toBe(true);
    expect(at.some((p) => p.z < -0.5 && p.x > 0 && p.x < 13)).toBe(true);
  });

  /** The placements of each row, in order. */
  const rows = (setting: string, width = 14, height = 10) => {
    const placed = placeSetPieces(setting, width, height);
    const out = new Map<string, typeof placed>();
    for (const p of placed) {
      const key = `${p.row}:${p.side}`;
      out.set(key, [...(out.get(key) ?? []), p]);
    }
    return [...out.values()];
  };

  for (const setting of Object.keys(SETTINGS)) {
    it(`never stands a ${setting} prop next to its own kind, nor the same look within four`, () => {
      for (const row of rows(setting, 16, 24)) {
        row.forEach((p, i) => {
          const before = row.slice(Math.max(0, i - 2), i).map((q) => q.piece);
          expect(before).not.toContain(p.piece);
          const looks = row.slice(Math.max(0, i - 4), i);
          expect(looks.some((q) => q.piece === p.piece && q.variant === p.variant)).toBe(false);
        });
      }
    });

    it(`shows many different ${setting} props and looks`, () => {
      const placed = placeSetPieces(setting, 14, 10);
      const pieces = new Set(placed.map((p) => p.piece));
      const looks = new Set(placed.map((p) => `${[...pieces].indexOf(p.piece)}:${p.variant}`));
      expect(pieces.size).toBeGreaterThanOrEqual(9);
      expect(looks.size).toBeGreaterThanOrEqual(18);
      // Most of what stands outside is a look nobody else in the level has.
      expect(looks.size / placed.length).toBeGreaterThan(0.5);
    });

    it(`varies every ${setting} prop a little, within its footprint`, () => {
      const placed = placeSetPieces(setting, 14, 10);
      for (const p of placed) {
        expect(p.variant).toBeGreaterThanOrEqual(0);
        expect(p.variant).toBeLessThan(p.piece.variants ?? 1);
        expect(p.scale[0]).toBeLessThanOrEqual(1);
        expect(p.scale[2]).toBeLessThanOrEqual(1);
        // Props people stand at keep their size.
        if (p.piece.seats?.length) expect(p.scale).toEqual([1, 1, 1]);
        for (const c of p.tint) expect(Math.abs(c - 1)).toBeLessThan(0.2);
      }
      const tints = new Set(placed.map((p) => p.tint.join()));
      expect(tints.size).toBe(placed.length);
    });
  }

  it('gives two levels of a chapter, the same size, their own surroundings', () => {
    const a = placeSetPieces('garage', 14, 10, 1234567);
    const b = placeSetPieces('garage', 14, 10, 7654321);
    const look = (p: (typeof a)[number]) =>
      `${SETTINGS.garage?.near.indexOf(p.piece)}:${p.variant}`;
    expect(a.map(look)).not.toEqual(b.map(look));
    // Still the same for the same level.
    expect(placeSetPieces('garage', 14, 10, 1234567)).toEqual(a);
  });

  it('places nothing for a level without a setting', () => {
    expect(placeSetPieces('nowhere', 14, 10)).toEqual([]);
  });
});

describe('set pieces', () => {
  it('builds every look of every prop', () => {
    const pieces = new Set(
      Object.values(SETTINGS).flatMap((s) => [...s.near, ...s.far, ...s.rare]),
    );
    for (const piece of pieces) {
      for (let v = 0; v < (piece.variants ?? 1); v++) {
        expect(piece.model(v).body.getAttribute('position').count).toBeGreaterThan(0);
      }
    }
  });

  it('puts many different things on the office walls', () => {
    expect(WALL_TOP_PROPS.length).toBeGreaterThanOrEqual(12);
    for (const prop of WALL_TOP_PROPS)
      expect(prop().body.getAttribute('position').count).toBeGreaterThan(0);
  });
});

describe('Surroundings', () => {
  const map = parseLevelMap(
    ['##############', '#1...3....2.4#', '#............#', '##############'].join('\n'),
  );

  it('builds the world round a level for every chapter', () => {
    for (const setting of Object.keys(SETTINGS)) {
      const world = new Surroundings(map, setting);
      expect(world.root.children.length, setting).toBeGreaterThan(4);
      world.destroy();
    }
  });

  it('salts every level apart by its map', () => {
    const other = parseLevelMap(
      ['##############', '#1..3.#...2.4#', '#............#', '##############'].join('\n'),
    );
    expect(levelSalt(map)).not.toBe(levelSalt(other));
    expect(levelSalt(map)).toBe(
      levelSalt(
        parseLevelMap(
          ['##############', '#1...3....2.4#', '#............#', '##############'].join('\n'),
        ),
      ),
    );
  });
});

describe('the real levels', () => {
  it('each get their own surroundings, also next to a level of the same chapter and size', () => {
    for (const chapter of CHAPTERS) {
      const seen = new Set<string>();
      for (const level of chapter.levels) {
        const { width, height } = level.map;
        const placed = placeSetPieces(chapter.id, width, height, levelSalt(level.map));
        const key = placed.map((p) => `${p.variant}:${p.yaw.toFixed(3)}`).join();
        expect(seen.has(key), level.id).toBe(false);
        seen.add(key);
      }
    }
  });
});
