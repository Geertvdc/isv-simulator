import { describe, expect, it } from 'vitest';
import { getTile } from '../../../sim/level';
import { THE_REORG } from '../../../sim/levels';
import { withoutReorgTiles } from '../../../sim/reorgs';
import {
  CARPET_WEAR,
  LOBBY_WEAR,
  REORG_KIND,
  REORG_WEAR,
  STENCIL_NAMES,
  reorgRoom,
  stencilOf,
} from './reorgRoom';

const map = withoutReorgTiles(THE_REORG.map);
const plan = reorgRoom(map);
const wear = (x: number, y: number) => plan.floorWear[`${x},${y}`] ?? -1;
const flags = (x: number, y: number) => wear(x, y) % REORG_KIND;

describe('The Reorg room plan', () => {
  it('finds the badge line, the boardroom and the moving block from the map', () => {
    const gates = THE_REORG.map.marks.filter((m) => m.kind === 'turnstile');
    expect(plan.badgeRow).toBe(gates[0]?.y);
    for (const t of map.meetingTiles) expect(plan.zones[`${t.x},${t.y}`]).toBe('boardroom');
    expect(plan.block.x0).toBeLessThan(plan.boardroom.x0);
    expect(plan.block.x1).toBeGreaterThan(plan.boardroom.x1);
    for (const [k, z] of Object.entries(plan.zones)) {
      const y = Number(k.split(',')[1]);
      if (y > plan.badgeRow) expect(z, k).toBe('lobby');
    }
  });

  it('lays the good carpet in the boardroom and stone in the lobby', () => {
    for (const t of map.meetingTiles)
      expect(Math.floor(wear(t.x, t.y) / REORG_KIND)).toBe(REORG_WEAR.good / REORG_KIND);
    for (const [k, z] of Object.entries(plan.zones))
      if (z === 'lobby') expect(Math.floor((plan.floorWear[k] ?? 0) / REORG_KIND), k).toBe(2);
  });

  it('tapes round every layout’s partitions, names four zones and marks every desk stop', () => {
    const layouts = THE_REORG.map.phases ?? [];
    let taped = 0;
    for (const l of layouts)
      for (const m of l.marks.filter((q) => q.kind === 'partition'))
        if (flags(m.x, m.y) & 0x1e) taped++;
    expect(taped).toBeGreaterThan(10);
    const names = Object.values(plan.floorWear).filter((w) => w < REORG_KIND && stencilOf(w) > 0);
    expect(names.length).toBe(STENCIL_NAMES.length);
    for (const l of layouts)
      for (const m of l.marks.filter((q) => q.kind === 'rollingDesk'))
        expect(flags(m.x, m.y) & CARPET_WEAR.xMark, `${m.x},${m.y}`).toBeTruthy();
  });

  it('pulls the carpet up in a strip each side of the block, a ghost line beyond it', () => {
    const access = Object.entries(plan.floorWear).filter(
      ([, w]) => w < REORG_KIND && w & CARPET_WEAR.access,
    );
    expect(access.length).toBeGreaterThanOrEqual(4);
    const ghost = Object.values(plan.floorWear).filter(
      (w) => w < REORG_KIND && w & CARPET_WEAR.ghostZ,
    );
    expect(ghost.length).toBeGreaterThanOrEqual(4);
  });

  it('puts a BADGE IN mat each side of each turnstile and the lift’s threshold before the ship', () => {
    for (const g of THE_REORG.map.marks.filter((m) => m.kind === 'turnstile')) {
      expect(flags(g.x, g.y - 1) & CARPET_WEAR.mat).toBeTruthy();
      expect(flags(g.x, g.y + 1) & LOBBY_WEAR.mat).toBeTruthy();
    }
    for (let x = 0; x < map.width; x++)
      if (getTile(map, x, map.height - 1) === 'ship')
        expect(flags(x, map.height - 2) & LOBBY_WEAR.lift).toBeTruthy();
  });

  it('strings the pendants’ wire between two side-wall tops', () => {
    const w = plan.wire;
    expect(w).not.toBeNull();
    if (!w) return;
    for (const e of [w.a, w.b]) expect(getTile(map, Math.round(e.x), Math.round(e.z))).toBe('wall');
  });

  it('is deterministic', () => {
    expect(reorgRoom(map)).toEqual(plan);
  });
});
