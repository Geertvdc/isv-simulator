import { describe, expect, it } from 'vitest';
import { getTile, isWorkSurface } from '../../../sim/level';
import { parseDraftMap } from '../../../sim/draftMap';
import { DOWN_THE_HALL } from '../../../sim/levels';
import draftText from '../../../../maps/drafts/scale-up.txt?raw';
import { wallPiece } from '../../mapShape';
import { BOARD_WEAR, RUNNER, warehouseRoom } from './warehouseRoom';

describe('warehouseRoom', () => {
  const shipped = DOWN_THE_HALL.map;
  const draft = parseDraftMap(draftText);
  const maps = [shipped, draft];
  const isOpen = (t: ReturnType<typeof getTile>) => t !== null && t !== 'wall' && t !== 'void';

  it('finds the hallway: the draft corridor between the rooms, the shipped one behind the inner wall', () => {
    const xs = (m: typeof shipped, y: number) =>
      warehouseRoom(m)
        .hall.filter((t) => t.y === y)
        .map((t) => t.x);
    expect(xs(draft, 3)).toEqual([9, 10, 11, 12, 13]);
    expect(xs(draft, 4)).toEqual([9, 10, 11, 12, 13]);
    expect(xs(shipped, 8)).toEqual([4, 5, 6, 7, 8, 9, 10, 11]);
    for (const m of maps)
      for (const t of warehouseRoom(m).hall) expect(getTile(m, t.x, t.y)).toBe('floor');
  });

  it('lays the runner down the hallway: halves on a wide one, ends at its ends', () => {
    const wear = warehouseRoom(draft).floorWear;
    expect(wear['9,3']).toBe(RUNNER + 3 + 1);
    expect(wear['11,4']).toBe(RUNNER + 6);
    expect(wear['13,4']).toBe(RUNNER + 6 + 2);
    expect(warehouseRoom(shipped).floorWear['6,8']).toBe(RUNNER);
  });

  it('frames the inbox on the back edge as the entrance-hall door', () => {
    for (const m of maps)
      expect(warehouseRoom(m).hallDoor).toEqual({ x: 2.5, y: 0, width: 2, out: { dx: 0, dy: -1 } });
  });

  it('opens the loading bay at the ship hatch on whatever edge it is, the door parked on wall beside it', () => {
    expect(warehouseRoom(shipped).loading).toEqual({
      opening: [
        { x: 13, y: 4 },
        { x: 13, y: 5 },
      ],
      out: { dx: 1, dy: 0 },
      park: [{ x: 13, y: 3 }],
    });
    const bay = warehouseRoom(draft).loading;
    expect(bay?.out).toEqual({ dx: 0, dy: 1 });
    expect(bay?.opening.map((p) => p.x)).toEqual([3, 4]);
    expect(bay?.park).toHaveLength(2);
    for (const m of maps)
      for (const p of warehouseRoom(m).loading?.park ?? [])
        expect(getTile(m, p.x, p.y)).toBe('wall');
  });

  it('raises only low walls with nothing behind them and the room in front', () => {
    expect(warehouseRoom(shipped).raised).toEqual([]);
    const raised = warehouseRoom(draft).raised;
    expect(raised.length).toBeGreaterThan(5);
    for (const { x, y } of raised) {
      expect(wallPiece(draft, x, y)).toBe('wall-front');
      expect(isOpen(getTile(draft, x, y - 1))).toBe(false);
      expect(isOpen(getTile(draft, x, y + 1))).toBe(true);
    }
  });

  it("hangs the tenants' doors on the hallway wall, and art only on walls facing the floor", () => {
    const art = warehouseRoom(draft).wallArt;
    const doors = art.filter((a) => a.art === 'yogaDoor' || a.art === 'breweryDoor');
    expect(doors.map((d) => d.art)).toEqual(['yogaDoor', 'breweryDoor']);
    for (const d of doors) expect(d.y).toBe(2);
    for (const m of maps) {
      const all = warehouseRoom(m).wallArt;
      expect(all.filter((a) => a.art === 'neon')).toHaveLength(1);
      expect(all.find((a) => a.art === 'pigeonholes')).toEqual({ x: 1, y: 0, art: 'pigeonholes' });
      for (const a of all)
        for (const x of [Math.floor(a.x), Math.ceil(a.x)]) {
          expect(getTile(m, x, a.y)).toBe('wall');
          expect(getTile(m, x, a.y + 1)).toBe('floor');
        }
    }
  });

  it('keeps dark wear off the spawns and puts the hatch by an outer wall', () => {
    for (const m of maps) {
      const wear = warehouseRoom(m).floorWear;
      for (const s of m.spawns) {
        const w = wear[`${s.x},${s.y}`];
        expect(w === BOARD_WEAR.hatch || w === BOARD_WEAR.scuffs).toBe(false);
      }
      for (const [k, w] of Object.entries(wear)) {
        const [x = 0, y = 0] = k.split(',').map(Number);
        expect(getTile(m, x, y)).toBe('floor');
        if (w === BOARD_WEAR.hatch)
          expect([x === 1, y === 1, x === m.width - 2, y === m.height - 2].some(Boolean)).toBe(
            true,
          );
      }
    }
  });

  it('puts wall-top clusters only where nothing open is behind and no station is in front', () => {
    for (const m of maps) {
      const { capProps, frontProps } = warehouseRoom(m);
      expect(capProps.length).toBeGreaterThanOrEqual(5);
      for (const p of capProps) {
        expect(getTile(m, p.x, p.y)).toBe('wall');
        expect(isOpen(getTile(m, p.x, p.y - 1))).toBe(false);
        expect(isWorkSurface(getTile(m, p.x, p.y + 1))).toBe(false);
      }
      for (const p of frontProps) expect(wallPiece(m, p.x, p.y)).toBe('wall-front');
    }
  });

  it('is deterministic', () => {
    for (const m of maps) expect(warehouseRoom(m)).toEqual(warehouseRoom(m));
  });
});
