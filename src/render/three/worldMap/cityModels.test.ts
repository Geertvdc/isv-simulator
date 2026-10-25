import { describe, expect, it } from 'vitest';
import { ModelBuilder } from '../kit';
import { buildPiece, treeModel } from './cityModels';
import {
  type CityPiece,
  PIECE_KINDS,
  type PieceKind,
  STYLES,
  TREE_KINDS,
  styleOf,
} from './cityPlan';

function piece(kind: PieceKind, variant: number): CityPiece {
  return { kind, chapter: 0, x: 0, y: 0, w: 1.2, d: 1.2, h: 3.2, storeys: 7, yaw: 0, variant };
}

describe('city models', () => {
  it('builds every kind in every style', () => {
    const trees: readonly string[] = TREE_KINDS;
    for (const kind of PIECE_KINDS) {
      if (trees.includes(kind)) continue;
      const n = STYLES[kind] ?? 1;
      for (let s = 0; s < n; s++) {
        const p = piece(kind, (s + 0.37) / n);
        expect(styleOf(p)).toBe(s);
        const builders = {
          body: new ModelBuilder(),
          shiny: new ModelBuilder(),
          blink: new ModelBuilder(),
        };
        buildPiece(p, builders);
        const body = builders.body.build().body;
        const shiny = builders.shiny.build().body;
        // A builder with nothing in it builds an empty geometry, with no positions.
        const count = (g: typeof body) =>
          'position' in g.attributes ? g.getAttribute('position').count : 0;
        const vertices = count(body) + count(shiny);
        expect(vertices, `${kind} style ${s}`).toBeGreaterThan(0);
      }
    }
  });

  it('builds every kind of tree', () => {
    for (const kind of TREE_KINDS) {
      expect(treeModel(kind).build().body.getAttribute('position').count, kind).toBeGreaterThan(0);
    }
  });
});
