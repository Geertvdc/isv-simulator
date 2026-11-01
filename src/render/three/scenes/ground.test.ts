import { describe, expect, it } from 'vitest';
import { type GroundPainter, groundModel, slabs, stripes } from './ground';

const patch = (kind: string) => ({ kind, x0: 0, x1: 2, z0: 0, z1: 1 });
const vertices = (scene: Parameters<typeof groundModel>[0]) => {
  const { body } = groundModel(scene);
  const n = body.attributes.position?.count ?? 0;
  body.dispose();
  return n;
};

describe('groundModel', () => {
  it("paints a scene's own ground kinds with its painters, before the built-in ones", () => {
    const seen: string[] = [];
    const bays: GroundPainter = (b, g, salt) => {
      seen.push(`${g.kind}:${salt}`);
      stripes(b, g, 0.01, [0x555555, 0x666666], 0.5);
    };
    const cobbles: GroundPainter = (b, g, salt) => {
      slabs(b, g, 0.02, 0x7a7066, [0.2, 0.2], 0.02, 0.2, salt);
    };
    const own = vertices({
      ground: [patch('bays'), patch('cobbles')],
      tufts: [],
      painters: { bays, cobbles },
    });
    expect(seen).toEqual(['bays:0']);
    expect(own).toBeGreaterThan(0);
    // A built-in kind overridden by a painter is painted the scene's way.
    expect(vertices({ ground: [patch('lawn')], tufts: [], painters: { lawn: bays } })).not.toBe(
      vertices({ ground: [patch('lawn')], tufts: [] }),
    );
  });

  it('leaves out a kind nobody paints', () => {
    expect(vertices({ ground: [patch('lava')], tufts: [] })).toBe(0);
  });
});
