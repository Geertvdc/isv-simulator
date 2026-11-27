import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { THE_REORG } from '../../../sim/levels';
import { withoutReorgTiles } from '../../../sim/reorgs';
import { LEVEL_LOOKS } from '../../mapLook';
import { type Vec3, fitCamera3d, projectPoint, roundInsets } from '../../projection';
import type { Model } from '../kit';
import { tint } from '../kit';
import { STATION_HEIGHT, WALL_HEIGHT, levelBox } from '../layout';
import { FLOOR_COLORS, PALETTE, WALL_COLORS } from '../look';
import {
  ACCESS,
  BADGE_CAP,
  LIFT_MAX_H,
  LOBBY_STONE,
  MAT,
  REORG_ART_MODELS,
  REORG_SWAP_MODELS,
  SIDE_LOW_TOP,
  TABLE_TOP,
  UPLIGHTER_OUT,
  goodsLiftModel,
  handoverDeskModel,
  reorgCounter,
  reorgFloorModel,
  reorgLook,
  reorgSideModel,
  reorgUplighterModel,
  shredderModel,
  SHREDDER_H,
} from '../roomModels/reorg';
import { REORG_TOPS, matrixBoxModel } from '../setDressing/reorgWallTops';
import { ROOMS, floorDressing } from '.';
import { REORG_ROOM, REORG_TOP_Y, reorgFittings } from './reorg';
import { REORG_PANEL_SWAP, REORG_SWAPS, SILL_TOP_MAX, SILL_Y, reorgRoom } from './reorgRoom';

const luminance = (c: number) => {
  const { r, g, b } = new THREE.Color(c);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const bounds = (m: Model) => {
  const box = new THREE.Box3();
  for (const g of [m.body, m.glow, m.glass]) {
    if (!g) continue;
    g.computeBoundingBox();
    if (g.boundingBox) box.union(g.boundingBox);
  }
  return box;
};
const stationTops = Object.values(PALETTE.station).map((c) => tint(c, 0.4));
const phases = [THE_REORG.map];
const layouts = [
  THE_REORG.map,
  ...(THE_REORG.map.phases ?? []).map((l) => ({ ...THE_REORG.map, ...l })),
];
const map = withoutReorgTiles(THE_REORG.map);
const plan = reorgRoom(map);

/** Every story piece the dressing places: its key, model and where. */
const placed: { key: string; model: Model; at: Vec3; yaw: number }[] = [];
REORG_ROOM.placeStory?.(plan, map, (key, model, p) =>
  placed.push({ key, model: model(), at: p.at, yaw: p.yaw }),
);

function corners(p: (typeof placed)[number]): Vec3[] {
  const box = bounds(p.model);
  const out: Vec3[] = [];
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z])
        out.push({ x: p.at.x + x * c + z * s, y: p.at.y + y, z: p.at.z - x * s + z * c });
  return out;
}

const VIEW = { width: 1440, height: 810 };
/** Screen rectangles the HUD covers at 1440×810 (`HUD_TOP_3D` in `ThreeRoundRenderer.ts`): (x0, y0, x1, y1). */
const HUD_RECTS: Record<string, [number, number, number, number]> = {
  orders: [0, 0, 690, 140],
  legend: [0, 610, 220, 745],
  score: [0, 755, 135, 810],
  timer: [1320, 755, 1440, 810],
  mute: [1370, 0, 1440, 60],
};

describe('The Reorg room dressing', () => {
  it('is the reorg theme, used by The Reorg only', () => {
    expect(ROOMS.reorg).toBe(REORG_ROOM);
    expect(floorDressing('reorgFloors', REORG_ROOM)).toBe(REORG_ROOM.floor);
    const users = Object.entries(LEVEL_LOOKS).filter(([, l]) => l.walls === 'reorg');
    expect(users.map(([id]) => id)).toEqual(['the-reorg']);
    const floors = Object.entries(LEVEL_LOOKS).filter(([, l]) => l.floor === 'reorgFloors');
    expect(floors.map(([id]) => id)).toEqual(['the-reorg']);
  });

  it('builds every floor look, swap, face and wall-top prop the plan uses', () => {
    const looks = new Set<number>();
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++) {
        const w = plan.floorWear[`${x},${y}`];
        if (w !== undefined) looks.add(reorgLook(x, y, w));
      }
    for (const l of looks)
      expect(reorgFloorModel(l).body.getAttribute('position').count).toBeGreaterThan(0);
    for (const s of REORG_SWAPS) expect(REORG_SWAP_MODELS[s]).toBeDefined();
    for (const s of Object.values(plan.swaps)) expect(REORG_ROOM.swapModels?.[s], s).toBeDefined();
    for (const a of plan.art) expect(REORG_ART_MODELS[a.art]).toBeDefined();
    for (const t of plan.tops) expect(REORG_TOPS[t.kind]).toBeDefined();
  });

  it('keeps counters, caps and floors darker than every station top', () => {
    for (const top of stationTops)
      for (const c of [
        TABLE_TOP,
        WALL_COLORS.reorg.top,
        BADGE_CAP,
        ACCESS,
        LOBBY_STONE,
        MAT,
        ...FLOOR_COLORS.reorgFloors,
      ])
        expect(luminance(c)).toBeLessThan(luminance(top));
    // The art panels a step darker than the tower's pale ones (4-1, 4-2), so the stations lead.
    expect(luminance(WALL_COLORS.reorg.face)).toBeLessThan(
      luminance(WALL_COLORS.tower.face) * 0.85,
    );
    const box = bounds(
      reorgCounter({ minusEnd: true, plusEnd: true, legs: true, knob: false, yaw: 0 }).base,
    );
    expect(box.max.y).toBeLessThanOrEqual(STATION_HEIGHT + 0.01);
  });

  it('dresses the faces along the back and the lobby, with at least 10 distinct pieces', () => {
    const kinds = new Set(plan.art.map((a) => a.art));
    expect(kinds.size).toBeGreaterThanOrEqual(10);
    for (const must of ['thePlan', 'knownBugs', 'signOff', 'orgChart', 'youAreHere'] as const)
      expect(kinds.has(must), must).toBe(true);
    const dressed = new Set(
      plan.art.flatMap((a) => Array.from({ length: a.span }, (_, i) => `${a.x + i},${a.y}`)),
    );
    // A face left bare is a plain grey panel; glass only behind the art that hangs on glass.
    for (let x = 0; x < map.width; x++)
      if (map.tiles[x] === 'wall' && map.tiles[map.width + x] === 'floor' && !dressed.has(`${x},0`))
        expect(plan.swaps[`${x},0`], `${x},0`).toBe(REORG_PANEL_SWAP);
    for (const [name, build] of Object.entries(REORG_ART_MODELS)) {
      const box = bounds(build());
      expect(box.max.y, name).toBeLessThanOrEqual(WALL_HEIGHT);
      expect(box.min.z, name).toBeGreaterThanOrEqual(0.49);
      const two = name === 'thePlan';
      expect(box.min.x, name).toBeGreaterThanOrEqual(two ? -0.02 : -0.5);
      expect(box.max.x, name).toBeLessThanOrEqual(two ? 1.02 : 0.5);
    }
  });

  it('piles at least 20 distinct props in clusters, no two neighbours alike, the sills’ kit low', () => {
    expect(new Set(plan.tops.map((t) => t.kind)).size).toBeGreaterThanOrEqual(20);
    const byWall = [...plan.tops].sort(
      (a, b) => a.y - b.y || a.h - b.h || a.x + a.dx - (b.x + b.dx),
    );
    for (let i = 1; i < byWall.length; i++) {
      const a = byWall[i - 1];
      const b = byWall[i];
      if (a && b && a.y === b.y && a.h === b.h) expect(a.kind).not.toBe(b.kind);
    }
    for (const t of plan.tops) {
      const h = bounds(REORG_TOPS[t.kind]()).max.y;
      if (t.h === SILL_Y) expect(h, t.kind).toBeLessThanOrEqual(SILL_TOP_MAX + 0.001);
      else {
        expect(t.h + 0.004).toBe(REORG_TOP_Y);
        expect(h, t.kind).toBeLessThanOrEqual(0.62);
      }
    }
    expect(plan.tops.filter((t) => t.h === SILL_Y).length).toBeGreaterThanOrEqual(9);
  });

  it('puts Segfault’s MATRIX box on a back wall top, clear of the props', () => {
    const s = plan.segfault;
    expect(s).not.toBeNull();
    if (!s) return;
    expect(map.tiles[s.y * map.width + s.x]).toBe('wall');
    expect(plan.tops.some((t) => t.x === s.x && t.y === s.y)).toBe(false);
    expect(bounds(matrixBoxModel()).max.y).toBeLessThanOrEqual(0.35);
  });

  it('keeps the front low: the side glass cut down, the goods lift and sills under 0.6', () => {
    expect(bounds(reorgSideModel(0, 1, true)).max.y).toBeLessThanOrEqual(SIDE_LOW_TOP + 0.04);
    expect(bounds(reorgSideModel(0, 1, false)).max.y).toBeLessThanOrEqual(WALL_HEIGHT + 0.01);
    expect(bounds(goodsLiftModel(2)).max.y).toBeLessThanOrEqual(0.6);
    expect(LIFT_MAX_H).toBeLessThanOrEqual(0.6);
    for (const [k, s] of Object.entries(plan.swaps)) {
      const [, y] = k.split(',').map(Number);
      if ((y ?? 0) < plan.badgeRow || !s.startsWith('frontSill')) continue;
      const m = REORG_SWAP_MODELS[s];
      if (m) expect(bounds(m()).max.y, k).toBeLessThanOrEqual(0.6);
    }
    for (const t of plan.tops.filter((q) => q.y >= plan.badgeRow))
      expect(t.h + bounds(REORG_TOPS[t.kind]()).max.y).toBeLessThanOrEqual(0.6);
  });

  it('keeps the handover desk behind the inbox and the shredding console low', () => {
    const desk = bounds(handoverDeskModel(2));
    expect(desk.max.z).toBeLessThanOrEqual(-0.4);
    expect(desk.max.y).toBeLessThanOrEqual(WALL_HEIGHT + 0.01);
    expect(bounds(shredderModel()).max.y).toBeLessThanOrEqual(SHREDDER_H + 0.12);
    expect(plan.handover).not.toBeNull();
    expect(plan.goodsLift).not.toBeNull();
    expect(plan.shredder).not.toBeNull();
  });

  it('lights the back with uplighters on the faces’ tops, nothing over a player’s head', () => {
    const fits = reorgFittings(map, plan);
    expect(fits.length).toBeGreaterThanOrEqual(2);
    const lamp = bounds(reorgUplighterModel());
    expect(lamp.max.y).toBeLessThanOrEqual(0.03);
    expect(lamp.max.z).toBeLessThanOrEqual(UPLIGHTER_OUT);
    const pose = fitCamera3d(levelBox(map), VIEW, roundInsets(VIEW));
    const s = plan.segfault;
    for (const f of fits) {
      expect(f.x < plan.block.x0 - 0.5 || f.x > plan.block.x1 + 0.5).toBe(true);
      const face = plan.art.find((a) => Math.round(f.x) >= a.x && Math.round(f.x) < a.x + a.span);
      expect(face, `${f.x}`).toBeDefined();
      expect(f.z).toBe((face?.y ?? 0) + 0.5);
      if (s) expect(Math.round(f.x) === s.x && Math.round(f.z - 0.5) === s.y).toBe(false);
      // The fitting's lowest point on screen stays above the head of any player on the row in front.
      const low = Math.max(
        ...[lamp.min.x, lamp.max.x].flatMap((x) =>
          [lamp.min.z, lamp.max.z].map(
            (z) => projectPoint(pose, { x: f.x + x, y: f.y + lamp.min.y, z: f.z + z }).y,
          ),
        ),
      );
      for (const layout of layouts)
        for (let x = 0; x < map.width; x++) {
          if (Math.abs(x - f.x) > 1) continue;
          for (let y = 0; y < map.height; y++) {
            if (layout.tiles[y * map.width + x] !== 'floor') continue;
            // A player pressed to the tile's back edge (radius 0.35), the top of the head 1.15 up.
            const head = projectPoint(pose, { x, y: 1.15, z: y - 0.5 + 0.35 }).y;
            expect(low, `${f.x} over ${x},${y}`).toBeLessThan(head);
          }
        }
    }
    expect(placed.some((p) => p.key.startsWith('reorgWire'))).toBe(false);
  });

  it('dresses the boardroom table with 4-2’s halves and chairs at its ends only', () => {
    const half = (minusEnd: boolean) =>
      bounds(reorgCounter({ minusEnd, plusEnd: !minusEnd, legs: true, knob: false, yaw: 0 }).base);
    const left = half(true);
    const right = half(false);
    // The chairs poke out past the round ends, never past the sides (the meeting's label stays clear).
    expect(left.min.x).toBeLessThan(-0.6);
    expect(right.max.x).toBeGreaterThan(0.6);
    for (const b of [left, right]) {
      expect(b.max.z).toBeLessThanOrEqual(0.5);
      expect(b.max.y).toBeLessThanOrEqual(0.9);
    }
  });

  it('keeps every story piece out from under the HUD', () => {
    const pose = fitCamera3d(levelBox(map), VIEW, roundInsets(VIEW));
    expect(placed.length).toBeGreaterThan(40);
    for (const p of placed) {
      const shown = corners(p).map((v) => projectPoint(pose, v));
      for (const [hud, [x0, y0, x1, y1]] of Object.entries(HUD_RECTS)) {
        const under = shown.filter((s) => s.x > x0 && s.x < x1 && s.y > y0 && s.y < y1);
        expect(under.length, `${hud}: ${p.key} at ${p.at.x.toFixed(2)}, ${p.at.z.toFixed(2)}`).toBe(
          0,
        );
      }
    }
  });

  it('stands nothing of its own on a floor tile in any layout', () => {
    for (const layout of phases.concat(
      (THE_REORG.map.phases ?? []).map((l) => ({ ...THE_REORG.map, ...l })),
    )) {
      const floor = new Set<string>();
      for (let y = 0; y < map.height; y++)
        for (let x = 0; x < map.width; x++)
          if (layout.tiles[y * map.width + x] === 'floor') floor.add(`${x},${y}`);
      for (const p of placed) {
        if (p.key.startsWith('reorgWire') || p.key === 'lobbyBracket') continue;
        const k = `${Math.round(p.at.x)},${Math.round(p.at.z)}`;
        expect(floor.has(k), `${p.key} at ${k}`).toBe(false);
      }
    }
  });

  it('lays nothing but plain carpet on a spawn', () => {
    for (const s of [...map.spawns, ...map.managerSpawns])
      expect(plan.floorWear[`${s.x},${s.y}`] ?? 0).toBe(0);
  });

  it('plans the same static room from every layout', () => {
    for (const l of THE_REORG.map.phases ?? []) {
      const other = reorgRoom(withoutReorgTiles({ ...THE_REORG.map, ...l }));
      expect(other.badgeRow).toBe(plan.badgeRow);
      expect(other.block).toEqual(plan.block);
    }
  });
});
