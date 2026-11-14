import { describe, expect, it } from 'vitest';
import { getTile } from '../../../sim/level';
import { parseDraftMap } from '../../../sim/draftMap';
import { MIDDLE_MANAGEMENT } from '../../../sim/levels';
import draftText from '../../../../maps/drafts/middle-management.txt?raw';
import { fitCamera3d, gridToWorld, projectPoint, roundInsets } from '../../projection';
import { wallPiece } from '../../mapShape';
import { atmosphereFor, lampSpots } from '../atmosphere';
import { levelBox } from '../layout';
import {
  CARPET_WEAR,
  MID_RISE_ART_HALF,
  MID_RISE_CAP_CLUSTERS,
  PENDANT_HALF,
  midRiseRoom,
  pendantFit,
} from './midRiseRoom';

describe('midRiseRoom', () => {
  const shipped = MIDDLE_MANAGEMENT.map;
  const draft = parseDraftMap(draftText);
  const maps = [shipped, draft];
  const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

  it('frames the inbox on the back edge as reception', () => {
    for (const m of maps) {
      const r = midRiseRoom(m).reception;
      expect(r?.side).toBe('back');
      for (const t of r?.tiles ?? []) expect(getTile(m, t.x, t.y)).toBe('inbox');
    }
  });

  it('hangs YOTTA right beside reception on two solid back faces, out of the order cards', () => {
    const VIEW = { width: 1440, height: 810 };
    for (const m of maps) {
      const { wallArt, reception, swaps } = midRiseRoom(m);
      const logo = wallArt.find((a) => a.art === 'yotta');
      expect(logo).toBeDefined();
      if (!logo || !reception) continue;
      const xs = reception.tiles.map((t) => t.x);
      expect(
        Math.min(
          Math.abs(logo.x - 0.5 - Math.max(...xs)),
          Math.abs(logo.x + 0.5 - Math.min(...xs)),
        ),
      ).toBe(1);
      for (const x of [logo.x - 0.5, logo.x + 0.5])
        expect(swaps[`${x},${logo.y}`]).toMatch(/^solid:/);
      // Its letters (about 0.83 to 1.07 high on the face) clear the order cards' band.
      const pose = fitCamera3d(levelBox(m), VIEW, roundInsets(VIEW));
      for (const dx of [-0.45, 0.45])
        for (const h of [0.75, 1.08]) {
          const p = projectPoint(pose, { ...gridToWorld(logo.x + dx, logo.y + 0.5, h) });
          expect(p.y > 140 || p.x > 690, `${p.x},${p.y}`).toBe(true);
        }
    }
  });

  it('hangs the org chart, clock, fire exit and QUIET ZONE on full back-wall faces, apart', () => {
    for (const m of maps) {
      const art = midRiseRoom(m).wallArt;
      for (const name of ['orgChart', 'clock', 'fireExit', 'quietZone'] as const) {
        const a = art.find((p) => p.art === name);
        expect(a, name).toBeDefined();
        if (!a) continue;
        expect(getTile(m, a.x, a.y)).toBe('wall');
        expect(wallPiece(m, a.x, a.y)).toBe('wall');
        expect(getTile(m, a.x, a.y + 1)).toBe('floor');
      }
      const front = art.filter((a) => a.yaw === 0 && Number.isInteger(a.x));
      for (const a of front)
        for (const b of front)
          if (a !== b && a.y === b.y) expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(1);
    }
  });

  it("dresses Derek's office and the meeting room only on the draft", () => {
    const s = midRiseRoom(shipped);
    expect(s.office).toBeNull();
    expect(s.derekDesk).toBeNull();
    expect(
      s.wallArt.some((a) =>
        ['certificate', 'lanyardHook', 'statusSticky', 'meetingTv'].includes(a.art),
      ),
    ).toBe(false);
    const d = midRiseRoom(draft);
    expect(d.derekDesk).toEqual({ x: 2, y: 5 });
    expect(d.chairs).toContainEqual({ x: 2, y: 5, exec: true });
    for (const name of ['certificate', 'lanyardHook', 'statusSticky', 'meetingTv'])
      expect(
        d.wallArt.some((a) => a.art === name),
        name,
      ).toBe(true);
    // The rooms' low walls carry glass screens; nothing else gets one.
    const glass = Object.entries(d.swaps).filter(([, v]) => v.startsWith('glassLow'));
    expect(glass.length).toBeGreaterThan(10);
    for (const [k] of glass) {
      const [x = 0, y = 0] = k.split(',').map(Number);
      expect(wallPiece(draft, x, y)).toBe('wall-front');
    }
    expect(Object.values(s.swaps).some((v) => v.startsWith('glassLow'))).toBe(false);
  });

  it('keeps every wall-art piece within its half of a tile pair', () => {
    for (const m of maps)
      for (const a of midRiseRoom(m).wallArt)
        expect(MID_RISE_ART_HALF[a.art]).toBeLessThan(
          a.art === 'yotta' || a.art === 'meetingTv' ? 1 : 0.5,
        );
  });

  it('lays the walkway from reception to the lifts over floor, in one connected line', () => {
    for (const m of maps) {
      const { walkway, floorWear } = midRiseRoom(m);
      expect(walkway.length).toBeGreaterThan(5);
      walkway.forEach((p, i) => {
        expect(getTile(m, p.x, p.y)).toBe('floor');
        expect(floorWear[`${p.x},${p.y}`]).toBe(CARPET_WEAR.walkway);
        const prev = walkway[i - 1];
        if (prev) expect(Math.abs(prev.x - p.x) + Math.abs(prev.y - p.y)).toBe(1);
      });
      const last = walkway[walkway.length - 1];
      if (last) expect(getTile(m, last.x, last.y + 1)).toBe('ship');
    }
  });

  it('puts no wear but the walkway under a spawn or in the meeting room, and one stain at most', () => {
    for (const m of maps) {
      const { floorWear } = midRiseRoom(m);
      for (const s of [...m.spawns, ...m.managerSpawns]) {
        const w = floorWear[`${s.x},${s.y}`];
        if (w !== undefined) expect(w).toBe(CARPET_WEAR.walkway);
      }
      for (const t of m.meetingTiles) expect(floorWear[`${t.x},${t.y}`]).toBeUndefined();
      const stains = Object.entries(floorWear).filter(
        ([, w]) => w >= CARPET_WEAR.coffee && w < CARPET_WEAR.odd,
      );
      expect(stains.length).toBeLessThanOrEqual(1);
      for (const [k] of stains) {
        const [x = 0, y = 0] = k.split(',').map(Number);
        for (const s of m.spawns) expect(cheb(s, { x, y })).toBeGreaterThanOrEqual(3);
      }
      expect(Object.values(floorWear).filter((w) => w === CARPET_WEAR.odd)).toHaveLength(1);
    }
  });

  it('clusters props on full partition tops, never beside reception, with one box of lanyards', () => {
    for (const m of maps) {
      const { capProps, lanyards, reception } = midRiseRoom(m);
      expect(capProps.length).toBeGreaterThan(6);
      expect(capProps.length).toBeLessThanOrEqual(
        (MID_RISE_CAP_CLUSTERS.back + MID_RISE_CAP_CLUSTERS.side * 2) * 2,
      );
      for (const p of [...capProps, ...(lanyards ? [lanyards] : [])]) {
        expect(getTile(m, p.x, p.y)).toBe('wall');
        expect(wallPiece(m, p.x, p.y)).not.toBe('wall-front');
        for (const t of reception?.tiles ?? []) expect(cheb(t, p)).toBeGreaterThan(1);
      }
      expect(lanyards).not.toBeNull();
      if (lanyards)
        expect(capProps.some((p) => p.x === lanyards.x && p.y === lanyards.y)).toBe(false);
    }
  });

  it('hangs the pendants along the back, clear of the back-row stations', () => {
    for (const m of maps) {
      const fits = lampSpots(atmosphereFor('middle-management'), m)
        .map((at) => pendantFit(at, m))
        .filter((p) => p !== null);
      expect(fits.length).toBeGreaterThan(1);
      for (const f of fits) {
        const back = Math.round(f.z - 0.62);
        for (let x = 0; x < m.width; x++) {
          const t = getTile(m, x, back);
          if (t && t !== 'wall' && t !== 'floor' && t !== 'void')
            expect(Math.abs(x - f.x)).toBeGreaterThanOrEqual(0.5 + PENDANT_HALF - 0.16);
        }
      }
    }
  });
});
