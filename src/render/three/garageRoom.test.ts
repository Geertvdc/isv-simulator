import { describe, expect, it } from 'vitest';
import { getTile, parseLevelMap } from '../../sim/level';
import { parseDraftMap } from '../../sim/draftMap';
import { GARAGE } from '../../sim/levels';
import draftText from '../../../maps/drafts/garage.txt?raw';
import { garageRoom } from './garageRoom';
import { WALL_DECO_MODELS } from './roomModels';

describe('garageRoom', () => {
  const shipped = GARAGE.map;
  const draft = parseDraftMap(draftText);

  it('opens the roll-up door at the ship hatch on the front edge', () => {
    expect(garageRoom(shipped).opening).toEqual({ y: 9, x0: 6, x1: 6 });
    expect(garageRoom(draft).opening).toEqual({ y: 6, x0: 3, x1: 4 });
  });

  it('puts a closed door past a pier on the longer side, between walls', () => {
    for (const map of [shipped, draft]) {
      const { door, opening } = garageRoom(map);
      expect(door).toHaveLength(2);
      if (!opening) throw new Error('no opening');
      for (const t of door) {
        expect(t.y).toBe(opening.y);
        expect(getTile(map, t.x, t.y)).toBe('wall');
      }
      const [a, b] = door;
      if (!a || !b) throw new Error('no door');
      // A pier between the doors, and wall at the far end.
      expect(Math.min(Math.abs(a.x - opening.x1), Math.abs(b.x - opening.x0))).toBe(2);
      expect(getTile(map, a.x - 1, a.y)).toBe('wall');
      expect(getTile(map, b.x + 1, b.y)).toBe('wall');
    }
    expect(garageRoom(shipped).door.map((t) => t.x)).toEqual([8, 9]);
  });

  it('has no closed door without room for one', () => {
    const map = parseLevelMap(['######', '#1234#', '##S###'].join('\n'));
    expect(garageRoom(map).opening).not.toBeNull();
    expect(garageRoom(map).door).toEqual([]);
  });

  it('frames the inbox on the back edge as the house door, a doormat in front', () => {
    for (const map of [shipped, draft]) {
      const { houseDoor, doormat } = garageRoom(map);
      if (!houseDoor) throw new Error('no house door');
      expect(getTile(map, houseDoor.x, houseDoor.y)).toBe('inbox');
      expect(houseDoor.y).toBe(0);
      expect(doormat).toEqual({ x: houseDoor.x, y: 1 });
    }
  });

  it('hangs the banner on bare back wall, away from the house door', () => {
    const banner = garageRoom(shipped).banner;
    expect(banner).toEqual({ x: 10, y: 0, width: 3 });
    // The draft's back wall is all stations: no room for it.
    expect(garageRoom(draft).banner).toBeNull();
  });

  it('drips the oil stain on bare floor a few tiles in from the door', () => {
    for (const map of [shipped, draft]) {
      const { oilStain, opening } = garageRoom(map);
      if (!oilStain || !opening) throw new Error('no stain');
      expect(opening.y - oilStain.y).toBeGreaterThanOrEqual(2);
      for (const x of [Math.floor(oilStain.x), Math.ceil(oilStain.x)])
        expect(getTile(map, x, oilStain.y)).toBe('floor');
    }
  });

  it('hangs something on every wall facing open floor, the pegboard on the back wall', () => {
    for (const map of [shipped, draft]) {
      const { decos } = garageRoom(map);
      for (const [key, deco] of Object.entries(decos)) {
        const [x = 0, y = 0] = key.split(',').map(Number);
        expect(getTile(map, x, y), key).toBe('wall');
        expect(getTile(map, x, y + 1), key).toBe('floor');
        expect(WALL_DECO_MODELS[deco], deco).toBeDefined();
      }
      expect(Object.entries(decos).find(([k]) => k.endsWith(',0'))?.[1]).toBe('pegboard');
    }
    expect(Object.keys(garageRoom(shipped).decos)).toHaveLength(6);
  });

  it('is deterministic', () => {
    expect(garageRoom(shipped)).toEqual(garageRoom(shipped));
  });
});
