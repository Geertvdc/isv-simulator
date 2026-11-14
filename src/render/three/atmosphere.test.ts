import { describe, expect, it } from 'vitest';
import { getTile, isSolid } from '../../sim/level';
import { parseDraftMap } from '../../sim/draftMap';
import {
  DEMO_DAY,
  DOWN_THE_HALL,
  GARAGE,
  LEVELS,
  ON_CALL,
  OPEN_PLAN,
  SEED_ROUND,
} from '../../sim/levels';
import draftText from '../../../maps/drafts/garage.txt?raw';
import openPlanDraft from '../../../maps/drafts/open-plan.txt?raw';
import scaleUpDraft from '../../../maps/drafts/scale-up.txt?raw';
import seedRoundDraft from '../../../maps/drafts/seed-round.txt?raw';
import demoDayDraft from '../../../maps/drafts/demo-day.txt?raw';
import onCallDraft from '../../../maps/drafts/on-call.txt?raw';
import { LEVEL_LOOKS } from '../mapLook';
import { fitCamera3d, gridToWorld, projectPoint } from '../projection';
import {
  ATMOSPHERES,
  DEFAULT_ATMOSPHERE,
  LIGHT_WELL,
  accentSpots,
  atmosphereFor,
  blinkOn,
  cssRgba,
  fogRange,
  glintSpots,
  lampColor,
  lampSpots,
  moteSeeds,
  lightWellSpots,
  sideLightSpots,
  snowSeeds,
  stutterIndex,
  stutterLevel,
  sunPlacement,
  washPlacement,
} from './atmosphere';

const SHIPPED = { width: 14, height: 10 };
const DRAFT = { width: 10, height: 7 };

describe('atmosphereFor', () => {
  it('gives the garage its golden hour', () => {
    expect(atmosphereFor('garage')).toBe(ATMOSPHERES.garage);
    expect(atmosphereFor('garage')).not.toBe(DEFAULT_ATMOSPHERE);
  });

  it('falls back to the default for no scene or an unknown one', () => {
    expect(atmosphereFor(undefined)).toBe(DEFAULT_ATMOSPHERE);
    expect(atmosphereFor('nope')).toBe(DEFAULT_ATMOSPHERE);
    // Not a prototype key either.
    expect(atmosphereFor('toString')).toBe(DEFAULT_ATMOSPHERE);
  });

  it('gives open-plan and scale-up their own light', () => {
    expect(atmosphereFor('open-plan')).toBe(ATMOSPHERES['open-plan']);
    expect(atmosphereFor('scale-up')).toBe(ATMOSPHERES['scale-up']);
    expect(atmosphereFor('open-plan')).not.toBe(DEFAULT_ATMOSPHERE);
    expect(atmosphereFor('scale-up')).not.toBe(DEFAULT_ATMOSPHERE);
  });

  it('gives seed-round its blue hour', () => {
    expect(atmosphereFor(LEVEL_LOOKS[SEED_ROUND.id]?.scene)).toBe(ATMOSPHERES['seed-round']);
    expect(atmosphereFor('seed-round')).not.toBe(DEFAULT_ATMOSPHERE);
  });

  it('gives demo-day its stage lighting', () => {
    expect(atmosphereFor(LEVEL_LOOKS[DEMO_DAY.id]?.scene)).toBe(ATMOSPHERES['demo-day']);
    expect(atmosphereFor('demo-day')).not.toBe(DEFAULT_ATMOSPHERE);
  });

  it('leaves every other level on the default', () => {
    const lit = new Set([
      GARAGE.id,
      'open-plan',
      'scale-up',
      SEED_ROUND.id,
      DEMO_DAY.id,
      ON_CALL.id,
    ]);
    for (const level of LEVELS) {
      if (lit.has(level.id)) continue;
      expect(atmosphereFor(LEVEL_LOOKS[level.id]?.scene)).toBe(DEFAULT_ATMOSPHERE);
    }
  });

  it('keeps the default free of fog, vignette and lamps', () => {
    expect(DEFAULT_ATMOSPHERE.fog).toBeUndefined();
    expect(DEFAULT_ATMOSPHERE.vignette).toBeUndefined();
    expect(DEFAULT_ATMOSPHERE.lamps).toBeUndefined();
    expect(DEFAULT_ATMOSPHERE.backdrop).toBeUndefined();
  });
});

describe('sunPlacement', () => {
  it('puts the default sun where it always was', () => {
    const p = sunPlacement(DEFAULT_ATMOSPHERE, SHIPPED);
    expect(p.position).toEqual(gridToWorld(6.5 - 14 * 0.3, 4.5 - 10 * 0.45, 12));
    expect(p.target).toEqual(gridToWorld(6.5, 4.5));
    expect(p.reach).toBeCloseTo(14 * 0.72);
  });

  it('keeps the golden-hour sun low and behind-left on both garage maps', () => {
    for (const map of [SHIPPED, DRAFT]) {
      const { position: s, target: t } = sunPlacement(atmosphereFor('garage'), map);
      expect(s.x).toBeLessThan(t.x);
      expect(s.z).toBeLessThan(t.z);
      const elevation = Math.atan2(s.y, Math.hypot(s.x - t.x, s.z - t.z)) * (180 / Math.PI);
      // Low enough for long shadows, high enough not to swallow the floor by the back wall.
      expect(elevation).toBeGreaterThan(30);
      expect(elevation).toBeLessThan(50);
    }
  });
});

describe('morning and evening suns', () => {
  const maps = [SHIPPED, DRAFT, { width: 16, height: 11 }, { width: 18, height: 12 }];
  const elevationOf = (scene: string, map: { width: number; height: number }) => {
    const { position: s, target: t } = sunPlacement(atmosphereFor(scene), map);
    return {
      s,
      t,
      elevation: Math.atan2(s.y, Math.hypot(s.x - t.x, s.z - t.z)) * (180 / Math.PI),
    };
  };

  it('puts the Monday-morning sun high in the front right', () => {
    for (const map of maps) {
      const { s, t, elevation } = elevationOf('open-plan', map);
      expect(s.x).toBeGreaterThan(t.x);
      expect(s.z).toBeGreaterThan(t.z);
      expect(elevation).toBeGreaterThan(50);
      expect(elevation).toBeLessThan(70);
    }
  });

  it('puts the evening sun low-ish in the west, still high enough for the back row', () => {
    for (const map of maps) {
      const { s, t, elevation } = elevationOf('scale-up', map);
      expect(s.x).toBeLessThan(t.x);
      expect(Math.abs(s.x - t.x)).toBeGreaterThan(Math.abs(s.z - t.z));
      expect(elevation).toBeGreaterThan(35);
      expect(elevation).toBeLessThan(50);
    }
  });

  it('puts the blue-hour sun low in the west and a little behind, high enough for the back row', () => {
    for (const map of maps) {
      const { s, t, elevation } = elevationOf('seed-round', map);
      expect(s.x).toBeLessThan(t.x);
      expect(s.z).toBeLessThan(t.z);
      expect(Math.abs(s.x - t.x)).toBeGreaterThan(Math.abs(s.z - t.z) * 2);
      expect(elevation).toBeGreaterThan(38);
      expect(elevation).toBeLessThan(50);
    }
  });

  it('keeps the blue hour cool: a blue-violet sky edge and a near-white fill', () => {
    const a = atmosphereFor('seed-round');
    const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255] as const;
    for (const c of [a.fog?.color ?? 0, a.backdrop?.inner ?? 0, a.vignette?.color ?? 0]) {
      const [r, g, b] = rgb(c);
      expect(b).toBeGreaterThan(r + 40);
      expect(b).toBeGreaterThan(g + 40);
    }
    // Only slightly blue, so yellow stations don't go olive in the shade.
    for (const c of [a.sky.sky, a.fill.color]) {
      const [r, , b] = rgb(c);
      expect(b - r).toBeLessThanOrEqual(50);
      expect(r).toBeGreaterThan(190);
    }
    // The last warm light glows from the left edge, not over the play area...
    expect(a.vignette?.glow?.x).toBeLessThanOrEqual(0.05);
    expect(a.vignette?.glow?.opacity).toBeLessThanOrEqual(0.36);
    // ...and lands on the terrace, well below the order cards (0–140 of 810 px).
    expect(a.vignette?.glow?.y).toBeGreaterThanOrEqual(0.3);
  });

  it('switches the incident beacon on for the blue hour only, the floor glints for polished floors', () => {
    for (const [id, a] of Object.entries(ATMOSPHERES)) {
      expect(a.beacon !== undefined, id).toBe(id === 'seed-round');
      expect(a.glints !== undefined, id).toBe(id === 'seed-round' || id === 'demo-day');
    }
    expect(DEFAULT_ATMOSPHERE.beacon).toBeUndefined();
    const a = atmosphereFor('seed-round');
    // One turn a second, and a short beam: it sweeps the wall, never the room.
    expect(a.beacon?.turns).toBe(1);
    expect(a.beacon?.reach).toBeLessThanOrEqual(0.8);
    // A glint, not a light: faint, and under the bloom.
    expect(a.glints?.opacity).toBeLessThanOrEqual(0.35);
  });

  it('keeps vignettes gentle and lamps along the back wall only', () => {
    for (const scene of ['open-plan', 'scale-up', 'seed-round', 'demo-day']) {
      const a = atmosphereFor(scene);
      expect(a.vignette?.opacity).toBeLessThanOrEqual(0.4);
      expect(a.vignette?.inner).toBeCloseTo(0.7);
      expect(a.lamps?.frontFrom).toBeGreaterThanOrEqual(12);
    }
  });
});

describe('stage lighting', () => {
  const a = atmosphereFor('demo-day');
  const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255] as const;
  const maps = [DEMO_DAY.map, parseDraftMap(demoDayDraft)];

  it('lights the stage from the front of house, high enough for the back row', () => {
    for (const map of [...maps, SHIPPED, { width: 19, height: 11 }]) {
      const { position: s, target: t } = sunPlacement(a, map);
      // From the audience's side, mostly head on.
      expect(s.z).toBeGreaterThan(t.z);
      expect(s.z - t.z).toBeGreaterThan(Math.abs(s.x - t.x) * 2);
      const elevation = Math.atan2(s.y, Math.hypot(s.x - t.x, s.z - t.z)) * (180 / Math.PI);
      expect(elevation).toBeGreaterThan(40);
      expect(elevation).toBeLessThan(55);
    }
  });

  it('keeps the wash warm white and the fill only slightly blue', () => {
    const [r, g, b] = rgb(a.sun.color);
    expect(r).toBeGreaterThanOrEqual(b);
    expect(Math.min(r, g, b)).toBeGreaterThan(210);
    for (const c of [a.sky.sky, a.fill.color]) {
      const [cr, , cb] = rgb(c);
      expect(cb - cr).toBeLessThanOrEqual(50);
      expect(cr).toBeGreaterThan(190);
    }
  });

  it('keeps the hall dark and cool round the stage, with glows at the edges and the top', () => {
    for (const c of [a.backdrop?.outer ?? 0, a.fog?.color ?? 0, a.vignette?.color ?? 0]) {
      const [r, g, b] = rgb(c);
      expect(b).toBeGreaterThan(r);
      expect(b).toBeGreaterThan(g);
      expect(Math.max(r, g, b)).toBeLessThan(0x70);
    }
    const glows = [a.vignette?.glow, ...(a.vignette?.glows ?? [])].filter((g) => g !== undefined);
    expect(glows.length).toBeGreaterThanOrEqual(3);
    for (const g of glows) {
      // Faint, and only at an edge: never over the middle of the stage.
      expect(g.opacity).toBeLessThanOrEqual(0.35);
      expect(Math.min(g.x, 1 - g.x, g.y, 1 - g.y)).toBeLessThanOrEqual(0.05);
    }
  });

  it('hangs gelled par cans along the back wall on both demo-day maps, chasing gently', () => {
    const lamps = a.lamps;
    expect(lamps?.frontFrom).toBeGreaterThanOrEqual(12);
    expect(lamps?.chase?.depth).toBeLessThanOrEqual(0.25);
    expect(lamps?.chase?.seconds).toBeGreaterThanOrEqual(4);
    expect(lamps?.halo?.opacity).toBeLessThanOrEqual(0.6);
    for (const map of maps) {
      const spots = lampSpots(a, map);
      expect(spots.length).toBeGreaterThanOrEqual(3);
      for (const p of spots) {
        const tile = getTile(map, Math.round(p.x), Math.round(p.z));
        expect(tile).not.toBeNull();
        expect(tile).not.toBe('wall');
        expect(tile).not.toBe('void');
        expect(Math.round(p.z)).toBeLessThan(map.height * 0.35);
      }
      // Neighbours differ in color, like a row of gelled cans.
      const colors = spots.map((_, i) => lampColor(a, i));
      expect(new Set(colors).size).toBeGreaterThan(1);
    }
  });
});

describe('the stage wash and the side lights', () => {
  const a = atmosphereFor('demo-day');

  it('leaves every other level without a wash (but the basement work light), side lights or an occlusion override', () => {
    for (const [id, other] of Object.entries(ATMOSPHERES)) {
      if (id === 'demo-day') continue;
      if (id !== 'on-call') expect(washPlacement(other, SHIPPED), id).toBeNull();
      expect(sideLightSpots(other, SHIPPED), id).toEqual([]);
      expect(other.occlusion, id).toBeUndefined();
    }
    expect(washPlacement(DEFAULT_ATMOSPHERE, SHIPPED)).toBeNull();
    expect(DEFAULT_ATMOSPHERE.occlusion).toBeUndefined();
  });

  it('gives only the stage a brighter sky on low, where its working lights are off', () => {
    for (const [id, other] of Object.entries(ATMOSPHERES))
      expect(other.lowSky !== undefined, id).toBe(id === 'demo-day' || id === 'on-call');
    expect(DEFAULT_ATMOSPHERE.lowSky).toBeUndefined();
    expect(a.lowSky).toBeGreaterThan(a.sky.intensity);
  });

  it('keeps the key and the wash near-neutral, so dark caps stay grey and stations true', () => {
    for (const c of [a.sun.color, a.wash?.color ?? 0]) {
      const r = (c >> 16) & 255;
      const b = c & 255;
      expect(r - b).toBeLessThanOrEqual(48);
    }
    // The wings' working light is soft blue and violet, never saturated.
    for (const c of [a.sides?.left ?? 0, a.sides?.right ?? 0]) {
      const ch = [(c >> 16) & 255, (c >> 8) & 255, c & 255];
      expect((Math.max(...ch) - Math.min(...ch)) / Math.max(...ch)).toBeLessThan(0.25);
    }
  });

  it('washes the stage from the front, its cone about as wide as the map', () => {
    for (const map of [DEMO_DAY.map, parseDraftMap(demoDayDraft)]) {
      const w = washPlacement(a, map);
      expect(w).not.toBeNull();
      if (!w) continue;
      expect(w.position.z).toBeGreaterThan(w.target.z);
      expect(w.target).toEqual(gridToWorld((map.width - 1) / 2, (map.height - 1) / 2));
      const distance = Math.hypot(
        w.position.x - w.target.x,
        w.position.y - w.target.y,
        w.position.z - w.target.z,
      );
      const across = 2 * distance * Math.tan(w.angle);
      expect(across).toBeGreaterThan(Math.max(map.width, map.height) * 0.8);
      expect(across).toBeLessThan(Math.max(map.width, map.height) * 1.3);
    }
  });

  it('puts the blue and violet working lights in the world beside the room, never over it', () => {
    for (const map of [DEMO_DAY.map, parseDraftMap(demoDayDraft)]) {
      const spots = sideLightSpots(a, map);
      expect(spots.length).toBeGreaterThanOrEqual(2);
      for (const { at, color } of spots) {
        const left = at.x < 0;
        // At least two tiles outside the outline, so their light barely reaches the stations.
        expect(left ? -0.5 - at.x : at.x - (map.width - 0.5)).toBeGreaterThanOrEqual(2);
        expect(at.z).toBeGreaterThan(-0.5);
        expect(at.z).toBeLessThan(map.height - 0.5);
        const b = color & 255;
        expect(b).toBeGreaterThan((color >> 16) & 255);
        expect(color).toBe(left ? a.sides?.left : a.sides?.right);
      }
    }
  });
});

describe('the night shift (on-call)', () => {
  const a = atmosphereFor('on-call');
  const maps = { shipped: ON_CALL.map, draft: parseDraftMap(onCallDraft) };
  const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255] as const;

  it('gives on-call its own light', () => {
    expect(atmosphereFor(LEVEL_LOOKS[ON_CALL.id]?.scene)).toBe(ATMOSPHERES['on-call']);
    expect(a).not.toBe(DEFAULT_ATMOSPHERE);
  });

  it('keys the room from the front and high, at least 45° up, so the back row stays lit', () => {
    for (const [name, map] of Object.entries(maps)) {
      const { position, target } = sunPlacement(a, map);
      const flat = Math.hypot(position.x - target.x, position.z - target.z);
      expect(position.z, name).toBeGreaterThan(target.z);
      expect(Math.atan2(position.y - target.y, flat), name).toBeGreaterThan(Math.PI / 4);
    }
  });

  it('keeps the key near-white and the fill only slightly cool, so yellow benches stay yellow', () => {
    for (const c of [a.sun.color, a.fill.color]) {
      const [r, g, b] = rgb(c);
      expect(b - r).toBeGreaterThanOrEqual(0);
      expect(b - r).toBeLessThan(24);
      expect(Math.min(r, g, b)).toBeGreaterThan(220);
    }
  });

  it('keeps the basement round the room a dark grey-blue, not menu navy', () => {
    for (const c of [a.backdrop?.inner ?? 0, a.backdrop?.outer ?? 0, a.fog?.color ?? 0]) {
      const [r, , b] = rgb(c);
      expect(b).toBeGreaterThanOrEqual(r);
      // Grey-blue: blue only a little over red, never a saturated navy.
      expect(b - r).toBeLessThan(24);
    }
    expect(a.vignette?.opacity).toBeCloseTo(0.35);
    expect(a.vignette?.inner).toBeCloseTo(0.7);
  });

  it('hangs the fluorescent tubes along the back wall only, on both maps', () => {
    for (const [name, map] of Object.entries(maps)) {
      const spots = lampSpots(a, map);
      expect(spots.length, name).toBeGreaterThanOrEqual(3);
      for (const s of spots) {
        expect(s.z, name).toBeLessThan(1.5);
        expect(s.y, name).toBeGreaterThan(1.9);
        expect(s.x, name).toBeGreaterThan(0);
        expect(s.x, name).toBeLessThan(map.width - 1);
      }
    }
  });

  it('has one tired tube, the last, that stutters briefly and is steady in between', () => {
    expect(stutterIndex(a, 4)).toBe(3);
    expect(stutterIndex(DEFAULT_ATMOSPHERE, 4)).toBeNull();
    const seconds = a.lamps?.stutter?.seconds ?? 0;
    const depth = a.lamps?.stutter?.depth ?? 0;
    const levels = Array.from({ length: seconds * 100 }, (_, i) =>
      stutterLevel(i * 10, seconds, depth),
    );
    const out = levels.filter((l) => l < 1).length / levels.length;
    expect(out).toBeGreaterThan(0);
    expect(out).toBeLessThan(0.05);
    expect(Math.min(...levels)).toBeCloseTo(1 - depth);
    expect(stutterLevel(1234, seconds, depth)).toBe(
      stutterLevel(1234 + seconds * 1000, seconds, depth),
    );
  });

  it('blinks the pager beacon over the inbox, at the inbox on both maps', () => {
    for (const [name, map] of Object.entries(maps)) {
      const beacons = accentSpots(a, map).filter((s) => s.accent.anchor === 'inbox');
      expect(beacons, name).toHaveLength(1);
      const at = beacons[0]?.at ?? { x: -9, y: 0, z: -9 };
      const inbox = map.tiles
        .map((t, i) => ({ t, x: i % map.width, y: Math.floor(i / map.width) }))
        .filter((c) => c.t === 'inbox');
      const mx = inbox.reduce((s, c) => s + c.x, 0) / inbox.length;
      const my = inbox.reduce((s, c) => s + c.y, 0) / inbox.length;
      expect(Math.hypot(at.x - mx, at.z - my), name).toBeLessThan(1.1);
      expect(at.y, name).toBeGreaterThan(1.15);
      expect(beacons[0]?.accent.blink, name).toBeGreaterThan(0);
    }
    expect(blinkOn(100, 1)).toBe(true);
    expect(blinkOn(600, 1)).toBe(false);
    expect(blinkOn(600, 0)).toBe(true);
  });

  it('puts the boiler off the left edge, the racks among the inner walls, street light in the wells', () => {
    for (const [name, map] of Object.entries(maps)) {
      const spots = accentSpots(a, map);
      const boiler = spots.find((s) => s.accent.anchor === 'left');
      expect(boiler?.at.x, name).toBeLessThan(-1);
      const racks = spots.find((s) => s.accent.anchor === 'core');
      expect(racks, name).toBeDefined();
      const r = racks?.at ?? { x: 0, z: 0 };
      expect(r.x, name).toBeGreaterThan(map.width * 0.25);
      expect(r.x, name).toBeLessThan(map.width * 0.75);
      expect(r.z, name).toBeGreaterThan(map.height * 0.2);
      expect(r.z, name).toBeLessThan(map.height * 0.8);
      const wells = spots.filter((s) => s.accent.anchor === 'wells');
      expect(wells.length, name).toBe(lightWellSpots(map).length);
      for (const s of spots) expect(s.accent.color, name).toBeGreaterThan(0);
    }
  });

  it('opens two or three light wells behind the back wall, over the wall tops', () => {
    for (const [name, map] of Object.entries(maps)) {
      const wells = lightWellSpots(map);
      expect(wells.length, name).toBeGreaterThanOrEqual(2);
      expect(wells.length, name).toBeLessThanOrEqual(3);
      for (const w of wells) {
        expect(w.at.z, name).toBeLessThan(-0.5);
        expect(w.at.y - LIGHT_WELL.tall / 2, name).toBeGreaterThan(1.15);
        expect(w.at.x, name).toBeGreaterThan(-0.5);
        expect(w.at.x, name).toBeLessThan(map.width - 0.5);
      }
    }
  });

  it('pools the work light on the room: a wash from the front, as wide as the map', () => {
    const wash = washPlacement(a, SHIPPED);
    expect(wash).not.toBeNull();
    expect(wash?.position.z).toBeGreaterThan(wash?.target.z ?? 0);
    expect(a.wash?.intensity).toBeLessThan(a.sun.intensity);
  });

  it('lets the same snow fall in the light wells every time, never over the room', () => {
    for (const [name, map] of Object.entries(maps)) {
      const seeds = snowSeeds(a, map);
      expect(seeds, name).toEqual(snowSeeds(a, map));
      expect(seeds.length, name).toBe((a.snow?.perWell ?? 0) * lightWellSpots(map).length);
      for (const s of seeds) {
        expect(s.at.z, name).toBeLessThan(-0.5);
        expect(s.at.y - s.drop, name).toBeGreaterThan(1.15);
        expect(s.phase).toBeGreaterThanOrEqual(0);
        expect(s.phase).toBeLessThan(1);
      }
      const phases = new Set(seeds.map((s) => s.phase.toFixed(3)));
      expect(phases.size, name).toBeGreaterThan(seeds.length * 0.8);
    }
    expect(snowSeeds(DEFAULT_ATMOSPHERE, SHIPPED)).toEqual([]);
    expect(accentSpots(DEFAULT_ATMOSPHERE, SHIPPED)).toEqual([]);
  });
});

describe('lampColor', () => {
  it('uses the one lamp color without a cycle', () => {
    const garage = atmosphereFor('garage');
    expect(lampColor(garage, 0)).toBe(garage.lamps?.color);
    expect(lampColor(garage, 3)).toBe(garage.lamps?.color);
  });

  it('cycles the colors along the lamps', () => {
    const a = atmosphereFor('demo-day');
    const colors = a.lamps?.colors ?? [];
    expect(colors.length).toBeGreaterThan(1);
    expect(lampColor(a, 0)).toBe(colors[0]);
    expect(lampColor(a, 1)).toBe(colors[1]);
    expect(lampColor(a, colors.length)).toBe(colors[0]);
  });
});

describe('glintSpots', () => {
  it('has none without glints', () => {
    expect(glintSpots(DEFAULT_ATMOSPHERE, GARAGE.map)).toEqual([]);
  });

  it("lays the loft pendants' glints on open floor, in front of the lamps, on both seed-round maps", () => {
    const a = atmosphereFor('seed-round');
    for (const map of [SEED_ROUND.map, parseDraftMap(seedRoundDraft)]) {
      const glints = glintSpots(a, map);
      const lamps = lampSpots(a, map);
      expect(glints.length).toBeGreaterThan(0);
      for (const g of glints) {
        expect(getTile(map, Math.round(g.x), Math.round(g.z))).toBe('floor');
        expect(g.y).toBe(0);
        expect(lamps.some((l) => l.x === g.x && g.z > l.z)).toBe(true);
      }
    }
  });
});

describe('lampSpots', () => {
  it('has none without lamps', () => {
    expect(lampSpots(DEFAULT_ATMOSPHERE, SHIPPED)).toEqual([]);
  });

  const garage = atmosphereFor('garage');
  const maps = { shipped: GARAGE.map, draft: parseDraftMap(draftText) };

  it('hangs a row just inside the back wall, about 1.7 up, on both garage maps', () => {
    for (const map of Object.values(maps)) {
      const back = lampSpots(garage, map).filter((p) => p.z < map.height / 2);
      expect(back.length).toBeGreaterThanOrEqual(2);
      for (const p of back) {
        expect(p.z).toBeCloseTo(0.5 + 0.55);
        expect(p.y).toBeCloseTo(1.7);
      }
    }
  });

  it('hangs the office strip lights high and close to the back wall, clear of the back row', () => {
    for (const map of [OPEN_PLAN.map, parseDraftMap(openPlanDraft)]) {
      const back = lampSpots(atmosphereFor('open-plan'), map).filter((p) => p.z < map.height / 2);
      expect(back.length).toBeGreaterThanOrEqual(2);
      for (const p of back) {
        expect(p.y).toBeCloseTo(2.05);
        expect(p.z % 1).toBeCloseTo(0.75);
      }
    }
  });

  it('adds a front row only in a deep room', () => {
    const front = (map: { width: number; height: number }) =>
      lampSpots(garage, map).filter((p) => p.z > map.height / 2);
    // Both garage maps are shallow enough to light from the back alone.
    expect(front(maps.shipped)).toEqual([]);
    expect(front(maps.draft)).toEqual([]);
    const deep = { width: 14, height: 13 };
    const spots = front(deep);
    expect(spots.length).toBeGreaterThan(0);
    for (const p of spots) {
      expect(p.z).toBeCloseTo(deep.height - 1.5 - 0.55);
      expect(p.y).toBeCloseTo(1.7);
    }
  });

  it('never hangs a lamp over the open middle of the floor', () => {
    for (const map of Object.values(maps)) {
      for (const p of lampSpots(garage, map)) {
        const x = Math.round(p.x);
        const y = Math.round(p.z);
        // Over a tile inside the room...
        const tile = getTile(map, x, y);
        expect(tile).not.toBeNull();
        expect(tile).not.toBe('wall');
        expect(tile).not.toBe('void');
        // ...in the row next to the back or front wall.
        const byWall = [y - 1, y + 1].some((ny) => {
          const next = getTile(map, x, ny);
          return next !== null && isSolid(next) && (ny === 0 || ny === map.height - 1);
        });
        expect(byWall).toBe(true);
      }
    }
  });

  it('spreads the lamps along the wall without bunching', () => {
    for (const map of Object.values(maps)) {
      const back = lampSpots(garage, map)
        .filter((p) => p.z < map.height / 2)
        .map((p) => p.x);
      for (let i = 1; i < back.length; i++) {
        expect((back[i] ?? 0) - (back[i - 1] ?? 0)).toBeGreaterThan(2.5);
      }
    }
  });

  it('hangs the open-plan and scale-up lamps along a back wall, on both maps each', () => {
    const levels = {
      'open-plan': [OPEN_PLAN.map, parseDraftMap(openPlanDraft)],
      'scale-up': [DOWN_THE_HALL.map, parseDraftMap(scaleUpDraft)],
    };
    for (const [scene, pair] of Object.entries(levels)) {
      for (const map of pair) {
        const spots = lampSpots(atmosphereFor(scene), map);
        expect(spots.length).toBeGreaterThanOrEqual(2);
        for (const p of spots) {
          const x = Math.round(p.x);
          const y = Math.round(p.z);
          const tile = getTile(map, x, y);
          expect(tile).not.toBeNull();
          expect(tile).not.toBe('wall');
          expect(tile).not.toBe('void');
          // A wall (or a station on the wall line) right behind it, in the top third.
          const behind = getTile(map, x, y - 1);
          expect(behind === null || isSolid(behind)).toBe(true);
          expect(y).toBeLessThan(map.height * 0.35);
        }
      }
    }
  });

  it('hangs the loft pendants along the back wall on both seed-round maps', () => {
    for (const map of [SEED_ROUND.map, parseDraftMap(seedRoundDraft)]) {
      const spots = lampSpots(atmosphereFor('seed-round'), map);
      expect(spots.length).toBeGreaterThanOrEqual(3);
      for (const p of spots) {
        const x = Math.round(p.x);
        const y = Math.round(p.z);
        expect(y).toBe(1);
        const tile = getTile(map, x, y);
        expect(tile).not.toBeNull();
        expect(tile).not.toBe('wall');
        expect(tile).not.toBe('void');
        expect(p.y).toBeCloseTo(2);
      }
    }
  });

  it('gives the second unit off the hallway its own row', () => {
    const map = parseDraftMap(scaleUpDraft);
    const spots = lampSpots(atmosphereFor('scale-up'), map);
    // The right unit's back wall is a row lower than the left one's.
    const right = spots.filter((p) => p.x > map.width / 2);
    const left = spots.filter((p) => p.x < map.width / 2);
    expect(right.length).toBeGreaterThan(0);
    expect(left.length).toBeGreaterThan(0);
    for (const p of right) expect(p.z).toBeCloseTo(1.5 + 0.55);
    for (const p of left) expect(p.z).toBeCloseTo(0.5 + 0.55);
  });

  it('still places lamps from a size alone', () => {
    const spots = lampSpots(garage, DRAFT);
    expect(spots.length).toBeGreaterThan(0);
    for (const p of spots) {
      expect(p.x).toBeGreaterThan(0.5);
      expect(p.x).toBeLessThan(DRAFT.width - 1.5);
    }
  });
});

describe('fogRange', () => {
  const viewport = { width: 1440, height: 810 };
  const insets = { top: 100, right: 20, bottom: 80, left: 20 };

  it('has no fog without one', () => {
    const map = SHIPPED;
    const box = { min: { x: -0.5, y: -0.45, z: -0.5 }, max: { x: 13.5, y: 1.4, z: 9.5 } };
    expect(fogRange(DEFAULT_ATMOSPHERE, map, fitCamera3d(box, viewport, insets))).toBeNull();
  });

  it('starts behind the whole floor on both garage maps', () => {
    for (const map of [SHIPPED, DRAFT]) {
      const box = {
        min: { x: -0.5, y: -0.45, z: -0.5 },
        max: { x: map.width - 0.5, y: 1.4, z: map.height - 0.5 },
      };
      const pose = fitCamera3d(box, viewport, insets);
      const range = fogRange(atmosphereFor('garage'), map, pose);
      expect(range).not.toBeNull();
      if (!range) continue;
      const backCorner = projectPoint(pose, gridToWorld(-0.5, -0.5)).depth;
      expect(range.near).toBeGreaterThan(backCorner);
      expect(range.far).toBeGreaterThan(range.near);
    }
  });
});

describe('moteSeeds', () => {
  it('has none without motes', () => {
    expect(moteSeeds(DEFAULT_ATMOSPHERE, SHIPPED)).toEqual([]);
  });

  it('hangs the same motes inside the room every time', () => {
    for (const map of [SHIPPED, DRAFT]) {
      const seeds = moteSeeds(atmosphereFor('garage'), map);
      expect(seeds.length).toBeGreaterThan(10);
      expect(moteSeeds(atmosphereFor('garage'), map)).toEqual(seeds);
      for (const { at, phase } of seeds) {
        expect(at.x).toBeGreaterThanOrEqual(0.5);
        expect(at.x).toBeLessThanOrEqual(map.width - 1.5);
        expect(at.z).toBeGreaterThanOrEqual(0.5);
        expect(at.z).toBeLessThanOrEqual(map.height - 1.5);
        expect(phase).toBeGreaterThanOrEqual(0);
        expect(phase).toBeLessThan(1);
      }
    }
  });
});

describe('cssRgba', () => {
  it('splits a hex color', () => {
    expect(cssRgba(0x102030, 0.5)).toBe('rgba(16, 32, 48, 0.5)');
  });
});
