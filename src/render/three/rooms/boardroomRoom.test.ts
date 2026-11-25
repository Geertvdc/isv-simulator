import { describe, expect, it } from 'vitest';
import { type LevelMap, getTile } from '../../../sim/level';
import { SYNERGY } from '../../../sim/levels';
import { reorgTiles, withoutReorgTiles } from '../../../sim/reorgs';
import { wallPiece } from '../../mapShape';
import {
  BACK_ART,
  BOARDROOM_CLUSTERS,
  BOARDROOM_WEAR,
  BOARDROOM_WEAR_KINDS,
  ON_GLASS,
  boardroomBox,
  boardroomRoom,
  boardroomThreshold,
} from './boardroomRoom';

const raw = SYNERGY.map;
/** The map `MapView` draws: the moving tiles as floor. */
const map = withoutReorgTiles(raw);
const plan = boardroomRoom(map);
const key = (x: number, y: number) => `${x},${y}`;
const spawns = [...map.spawns, ...map.managerSpawns].map((p) => key(p.x, p.y));
const open = (m: LevelMap, x: number, y: number) => {
  const t = getTile(m, x, y);
  return t !== null && t !== 'wall' && t !== 'void';
};
/** The open layout (phase 2), as `MapView` would draw it. */
const phase2: LevelMap = (() => {
  const later = raw.phases?.[1];
  if (!later) throw new Error('Synergy has a second phase');
  return withoutReorgTiles({ ...raw, tiles: [...later.tiles] });
})();

describe('Synergy room plan', () => {
  it('is deterministic, and the same for the closed and the open layout', () => {
    expect(boardroomRoom(map)).toEqual(plan);
    const same = (p: ReturnType<typeof boardroomRoom>) => ({
      zones: p.zones,
      boardroom: p.boardroom,
      pockets: p.pockets,
      art: p.art,
      stubs: p.stubs,
      tops: p.tops,
      floorWear: p.floorWear,
    });
    expect(same(boardroomRoom(phase2))).toEqual(same(plan));
  });

  it('finds the boardroom round the moving and meeting tiles, the stub line just behind it', () => {
    const b = boardroomBox(map);
    expect(plan.boardroom).toEqual(b);
    for (const i of reorgTiles(raw)) {
      const x = i % raw.width;
      const y = Math.floor(i / raw.width);
      expect(plan.zones[key(x, y)]).toBe('boardroom');
    }
    for (const t of map.meetingTiles) expect(plan.zones[key(t.x, t.y)]).toBe('boardroom');
    // The stub line is a wall line with doorways in it.
    expect(plan.doorways.length).toBeGreaterThanOrEqual(4);
    for (const d of plan.doorways) {
      expect(d.y).toBe(plan.stubRow);
      expect(open(map, d.x, d.y)).toBe(true);
    }
    const zones = new Set(Object.values(plan.zones));
    expect([...zones].sort()).toEqual(['boardroom', 'corridor', 'dev', 'ops', 'passage']);
  });

  it('puts the pockets on the stub-line walls behind each side of the folding walls', () => {
    expect(plan.pockets).toHaveLength(2);
    for (const p of plan.pockets) {
      expect(getTile(map, p.x, p.y)).toBe('wall');
      expect(p.y).toBe(plan.stubRow);
      expect(raw.phases?.[0]?.tiles[(p.y + 1) * raw.width + p.x]).toBe('wall');
    }
  });

  it('lays the good carpet in the boardroom with its border on the edge, terrazzo behind, slate elsewhere', () => {
    const b = plan.boardroom;
    for (const [k, z] of Object.entries(plan.zones)) {
      const w = plan.floorWear[k] ?? -1;
      const [x, y] = k.split(',').map(Number) as [number, number];
      if (plan.doorways.some((d) => d.x === x && d.y === y)) {
        expect(w).toBeGreaterThanOrEqual(BOARDROOM_WEAR.threshold);
        continue;
      }
      if (z === 'boardroom') {
        expect(w).toBeGreaterThanOrEqual(BOARDROOM_WEAR.boardroom);
        expect(w).toBeLessThan(BOARDROOM_WEAR.terrazzo);
        const edge = x === b.x0 || x === b.x1 || y === b.y0 || y === b.y1;
        expect(w > BOARDROOM_WEAR.boardroom).toBe(edge);
      } else if (z === 'corridor') {
        expect(w).toBeGreaterThanOrEqual(BOARDROOM_WEAR.terrazzo);
        expect(w).toBeLessThan(BOARDROOM_WEAR.threshold);
      } else expect(w).toBeLessThan(BOARDROOM_WEAR.boardroom);
    }
    for (const w of Object.values(plan.floorWear)) expect(w).toBeLessThan(BOARDROOM_WEAR_KINDS);
    expect(boardroomThreshold('terrazzo', 'boardroom')).toBeLessThan(BOARDROOM_WEAR_KINDS);
  });

  it('places wear on every zone, and none on a spawn', () => {
    const wear = Object.values(plan.floorWear);
    for (const w of [
      BOARDROOM_WEAR.castor,
      BOARDROOM_WEAR.walkX,
      BOARDROOM_WEAR.doorScuff,
      BOARDROOM_WEAR.sticky,
    ])
      expect(wear).toContain(w);
    expect(wear.some((w) => w === BOARDROOM_WEAR.walkBoth || w === BOARDROOM_WEAR.walkFront)).toBe(
      true,
    );
    expect(wear.some((w) => w >= BOARDROOM_WEAR.scuff && w < BOARDROOM_WEAR.threshold)).toBe(true);
    for (const s of spawns) {
      const w = plan.floorWear[s];
      expect([BOARDROOM_WEAR.slate, BOARDROOM_WEAR.terrazzo, BOARDROOM_WEAR.boardroom]).toContain(
        w,
      );
    }
  });

  it('dresses every face on the back wall and the stub line the camera sees', () => {
    const faced = new Set(plan.art.map((a) => key(a.x, a.y)));
    for (let x = 0; x < map.width; x++)
      for (const y of [0, plan.stubRow])
        if (getTile(map, x, y) === 'wall' && wallPiece(map, x, y) === 'wall' && open(map, x, y + 1))
          expect(faced.has(key(x, y)), key(x, y)).toBe(true);
    // Every low stub open both sides has a scene, the pockets excepted.
    const staged = new Set(
      plan.stubs.flatMap((s) => Array.from({ length: s.span }, (_, i) => key(s.x + i, s.y))),
    );
    for (let x = 0; x < map.width; x++) {
      const y = plan.stubRow;
      if (getTile(map, x, y) !== 'wall' || wallPiece(map, x, y) !== 'wall-front') continue;
      if (!open(map, x, y - 1) || !open(map, x, y + 1)) continue;
      expect(staged.has(key(x, y)) || plan.pockets.some((p) => p.x === x && p.y === y)).toBe(true);
    }
    const arts = new Set(plan.art.map((a) => a.art));
    for (const a of ['synergyMatrix', 'portraitMom', 'bugBoard', 'opsScreen', 'agenda'] as const)
      expect(arts.has(a)).toBe(true);
    // Ten or more distinct face pieces, the stubs' boards among them.
    const scenes = new Set(plan.stubs.map((s) => s.scene));
    expect(arts.size + scenes.size).toBeGreaterThanOrEqual(10);
    expect(BACK_ART.length).toBeGreaterThanOrEqual(12);
  });

  it('builds the back wall as the reception glass, walnut where art hangs, the curtain wall where the city is', () => {
    for (const a of plan.art) {
      expect(getTile(map, a.x, a.y)).toBe('wall');
      const swap = plan.swaps[key(a.x, a.y)] ?? '';
      if (ON_GLASS.has(a.art)) expect(swap).toMatch(/^partition:/);
      else expect(swap).toMatch(/^walnut:/);
    }
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++) {
        if (getTile(map, x, y) !== 'wall') continue;
        const swap = plan.swaps[key(x, y)];
        expect(swap, key(x, y)).toBeDefined();
        const side = plan.outer[key(x, y)];
        if (side && side !== 'back') expect(swap).toMatch(/^(curtain|sill):/);
      }
  });

  it('puts Prod and the name cards beside the pockets, never on them or on a floor tile', () => {
    const prod = plan.stubs.find((s) => s.scene === 'prod');
    const cards = plan.stubs.find((s) => s.scene === 'credenza');
    expect(prod).toBeDefined();
    expect(cards).toBeDefined();
    for (const s of [prod, cards]) {
      if (!s) continue;
      expect(plan.pockets.some((p) => Math.abs(p.x - s.x) === 1 && p.y === s.y)).toBe(true);
    }
    const pocket = new Set(plan.pockets.map((p) => key(p.x, p.y)));
    for (const s of plan.stubs)
      for (let i = 0; i < s.span; i++) {
        expect(getTile(map, s.x + i, s.y)).toBe('wall');
        expect(pocket.has(key(s.x + i, s.y))).toBe(false);
      }
    for (const t of plan.tops) {
      expect(getTile(map, t.x, t.y)).toBe('wall');
      expect(pocket.has(key(t.x, t.y))).toBe(false);
    }
  });

  it('clusters the workshop kit on full walls, clear of stations and the stretch behind the boardroom', () => {
    expect(plan.tops.length).toBeGreaterThanOrEqual(20);
    const kinds = new Set(plan.tops.map((t) => t.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(20);
    expect(kinds.has('dndTent')).toBe(true);
    expect(kinds.has('notebooks')).toBe(true);
    for (const t of plan.tops) {
      expect(wallPiece(map, t.x, t.y)).not.toBe('wall-front');
      expect(open(map, t.x, t.y - 1)).toBe(false);
      expect(t.x <= plan.boardroom.x0 || t.x >= plan.boardroom.x1).toBe(true);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          expect([
            'inbox',
            'keyboard',
            'bugQueue',
            'counter',
            'bin',
            'ship',
            'testBench',
            'pipeline',
          ]).not.toContain(getTile(map, t.x + dx, t.y + dy));
      expect(Math.abs(t.dx) + Math.abs(t.dy)).toBeLessThanOrEqual(0.5);
    }
    // No two clusters alike.
    const all = BOARDROOM_CLUSTERS.flat();
    expect(new Set(all).size).toBe(all.length);
  });

  it('hangs the pendants along the back of each side only, on a wire tied off at both ends', () => {
    expect(plan.pendants).toHaveLength(2);
    const b = plan.boardroom;
    for (const row of plan.pendants) {
      expect(row.at.length).toBeGreaterThan(0);
      // At the stub line, nowhere near the front.
      expect(Math.abs(row.z - plan.stubRow)).toBeLessThan(0.5);
      for (const x of [...row.at, row.x0, row.x1])
        expect(x < b.x0 - 0.5 || x > b.x1 + 0.5).toBe(true);
      // Each end stands on a wall: the full wall at one end, a board's stub at the other.
      for (const x of [row.x0, row.x1])
        expect(getTile(map, Math.round(x), plan.stubRow)).toBe('wall');
    }
  });

  it('finds the sticky-note wall at the inbox, the PARKED box at the bin and the deploy desk at the ship', () => {
    expect(plan.ideasWall?.tiles.every((t) => getTile(map, t.x, t.y) === 'inbox')).toBe(true);
    expect(plan.ideasWall?.side).toBe('left');
    expect(plan.parked && getTile(map, plan.parked.x, plan.parked.y)).toBe('bin');
    expect(plan.deployDesk?.tiles.every((t) => getTile(map, t.x, t.y) === 'ship')).toBe(true);
    expect(plan.deployDesk?.side).toBe('front');
  });
});
