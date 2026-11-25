import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SYNERGY } from '../../../sim/levels';
import { withoutReorgTiles } from '../../../sim/reorgs';
import { LEVEL_LOOKS } from '../../mapLook';
import { type Vec3, fitCamera3d, projectPoint, roundInsets } from '../../projection';
import type { Model } from '../kit';
import { tint } from '../kit';
import { FRONT_WALL_HEIGHT, STATION_HEIGHT, WALL_HEIGHT, levelBox } from '../layout';
import { FLOOR_COLORS, PALETTE, WALL_COLORS } from '../look';
import {
  BOARD_H,
  BOARDROOM_ART_MODELS,
  BOARDROOM_FLOOR_LOOKS,
  BOARDROOM_SWAP_MODELS,
  BORDER,
  COUNTER_TOP,
  DEPLOY_MAX_H,
  GOOD_CARPET,
  IDEAS_WALL_TOP,
  STONE,
  TERRAZZO,
  WALNUT,
  boardroomCounter,
  boardroomFloorModel,
  boardroomPendantModel,
  deployDeskModel,
  ideasWallModel,
  parkedBoxModel,
  stubSceneModel,
} from '../roomModels/boardroom';
import { BOARDROOM_TOPS } from '../setDressing/boardroomWallTops';
import { ROOMS, floorDressing } from '.';
import { BOARDROOM_ROOM } from './boardroom';
import { BOARDROOM_SWAPS, type BoardroomArt, boardroomRoom } from './boardroomRoom';

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
const map = withoutReorgTiles(SYNERGY.map);
const plan = boardroomRoom(map);

/** Every story piece the dressing places: its key, model and where. */
const placed: { key: string; model: Model; at: Vec3; yaw: number }[] = [];
BOARDROOM_ROOM.placeStory?.(plan, map, (key, model, p) =>
  placed.push({ key, model: model(), at: p.at, yaw: p.yaw }),
);

/** A placed piece's bounding box corners in the world. */
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
/** Screen rectangles the HUD covers at 1440×810: (x0, y0, x1, y1). */
const HUD_RECTS: Record<string, [number, number, number, number]> = {
  orders: [0, 0, 690, 140],
  legend: [0, 610, 220, 745],
  score: [0, 755, 135, 810],
  timer: [1320, 755, 1440, 810],
  mute: [1370, 0, 1440, 60],
};

describe('Synergy room dressing', () => {
  it('is the boardroom theme, used by Synergy only', () => {
    expect(ROOMS.boardroom).toBe(BOARDROOM_ROOM);
    expect(floorDressing('boardroomFloors', BOARDROOM_ROOM)).toBe(BOARDROOM_ROOM.floor);
    const users = Object.entries(LEVEL_LOOKS).filter(([, l]) => l.walls === 'boardroom');
    expect(users.map(([id]) => id)).toEqual(['synergy']);
    const floors = Object.entries(LEVEL_LOOKS).filter(([, l]) => l.floor === 'boardroomFloors');
    expect(floors.map(([id]) => id)).toEqual(['synergy']);
  });

  it('builds every floor look, every swap, art, stub scene and wall-top prop the plan uses', () => {
    for (let look = 0; look < BOARDROOM_FLOOR_LOOKS; look++)
      expect(boardroomFloorModel(look).body.getAttribute('position').count).toBeGreaterThan(0);
    for (const s of BOARDROOM_SWAPS) expect(BOARDROOM_SWAP_MODELS[s]).toBeDefined();
    for (const s of Object.values(plan.swaps)) expect(BOARDROOM_ROOM.swapModels?.[s]).toBeDefined();
    for (const a of plan.art) expect(BOARDROOM_ART_MODELS[a.art]).toBeDefined();
    for (const t of plan.tops) expect(BOARDROOM_TOPS[t.kind]).toBeDefined();
    for (const s of plan.stubs)
      expect(stubSceneModel(s.scene, s.span).body.getAttribute('position').count).toBeGreaterThan(
        0,
      );
  });

  it('keeps counters, caps, floors and walnut darker than every station top', () => {
    for (const top of stationTops)
      for (const c of [
        COUNTER_TOP,
        WALL_COLORS.boardroom.top,
        STONE,
        WALNUT,
        TERRAZZO,
        GOOD_CARPET,
        BORDER,
        ...FLOOR_COLORS.boardroomFloors,
      ])
        expect(luminance(c)).toBeLessThan(luminance(top));
    const box = bounds(
      boardroomCounter({ minusEnd: true, plusEnd: true, legs: true, knob: false, yaw: 0 }).base,
    );
    expect(box.max.y).toBeLessThanOrEqual(STATION_HEIGHT + 0.01);
  });

  it('hangs the art on its face, within its tile and under the wall top', () => {
    for (const [name, build] of Object.entries(BOARDROOM_ART_MODELS)) {
      const box = bounds(build());
      expect(box.max.y, name).toBeLessThanOrEqual(WALL_HEIGHT);
      expect(box.min.z, name).toBeGreaterThanOrEqual(0.49);
      // EXECUTIVE FLOOR runs over two panes; the rest stay on their own.
      const two = (name as BoardroomArt) === 'execVinyl';
      expect(box.min.x, name).toBeGreaterThanOrEqual(two ? -0.02 : -0.5);
      expect(box.max.x, name).toBeLessThanOrEqual(two ? 1.02 : 0.5);
    }
  });

  it('keeps the wall-top kit small and the stubs’ scenes low', () => {
    for (const [kind, build] of Object.entries(BOARDROOM_TOPS))
      expect(bounds(build()).max.y, kind).toBeLessThanOrEqual(0.5);
    for (const scene of ['ideasBoard', 'howMightWe', 'prod', 'credenza', 'stubNotes'] as const) {
      const box = bounds(stubSceneModel(scene, 2));
      // Low enough that the corridor behind still reads; never past the stub's own tiles.
      expect(box.max.y, scene).toBeLessThanOrEqual(FRONT_WALL_HEIGHT + 0.8);
      expect(box.max.z, scene).toBeLessThanOrEqual(0.52);
      expect(box.min.z, scene).toBeGreaterThanOrEqual(-0.5);
    }
    expect(BOARD_H).toBeLessThanOrEqual(0.5);
  });

  it('keeps the inbox wall behind its station, the deploy desk and the PARKED box low', () => {
    for (const span of [1, 2]) {
      const wall = bounds(ideasWallModel(span));
      expect(wall.max.y).toBeLessThanOrEqual(IDEAS_WALL_TOP + 0.001);
      expect(wall.max.z).toBeLessThanOrEqual(-0.4);
      const desk = bounds(deployDeskModel(span));
      expect(desk.max.y).toBeLessThanOrEqual(DEPLOY_MAX_H);
      expect(desk.min.z).toBeGreaterThanOrEqual(0.45);
    }
    expect(bounds(parkedBoxModel()).max.y).toBeLessThanOrEqual(0.85);
  });

  it('builds the pendant with its lit diffuser facing the camera', () => {
    const m = boardroomPendantModel();
    expect(m.glow).not.toBeNull();
    if (m.glow)
      expect(bounds({ body: m.glow, glow: null, glass: null }).max.z).toBeGreaterThan(0.02);
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

  it('stands nothing of its own on a floor tile', () => {
    const floorTiles = new Set<string>();
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++)
        if (map.tiles[y * map.width + x] === 'floor') floorTiles.add(`${x},${y}`);
    for (const p of placed) {
      // Pendants hang over the stub line; art sits on its wall's face.
      if (p.key === 'pendant' || p.key.startsWith('pendantWire')) continue;
      const k = `${Math.round(p.at.x)},${Math.round(p.at.z)}`;
      expect(floorTiles.has(k), `${p.key} at ${k}`).toBe(false);
    }
  });
});
