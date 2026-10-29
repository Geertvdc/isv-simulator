import { describe, expect, it } from 'vitest';
import { parseLevelMap } from '../../sim/level';
import { GARAGE } from '../../sim/levels';
import { type GameState, createGame } from '../../sim/state';
import type { Ticket } from '../../sim/tickets';
import { fitCamera3d, projectPoint, screenToGround } from '../projection';
import type { RoundView } from '../roundView';
import {
  CARRY_HEIGHT,
  FRONT_WALL_HEIGHT,
  QUEUE_STACK_MAX,
  SLAB_DEPTH,
  STATION_HEIGHT,
  WALL_HEIGHT,
  blockHeight,
  facingYaw,
  levelBox,
  pickTile,
  placeTicket,
  queueAnchor,
  heroPlacement,
  stationFacing,
  tilesOf,
} from './layout';

function view(state: GameState): RoundView {
  return {
    state,
    renderPos: (id) => state.players.find((p) => p.id === id)?.pos,
    renderManagerPos: (id) => state.managers.find((m) => m.id === id)?.pos,
  };
}

function ticket(id: number, location: Ticket['location']): Ticket {
  return { id, kind: 'feature', domain: 'general', title: 'x', steps: [], location };
}

describe('3D layout', () => {
  const map = GARAGE.map;

  it('gives walls, front walls, stations and floor their heights', () => {
    const wall = tilesOf(map, 'wall').find((t) => t.y === 0);
    const front = tilesOf(map, 'wall').find((t) => t.y === map.height - 1);
    const counter = tilesOf(map, 'counter')[0];
    const floor = tilesOf(map, 'floor')[0];
    if (!wall || !front || !counter || !floor) throw new Error('garage changed');
    expect(blockHeight(map, wall.x, wall.y)).toBe(WALL_HEIGHT);
    expect(blockHeight(map, front.x, front.y)).toBe(FRONT_WALL_HEIGHT);
    expect(blockHeight(map, counter.x, counter.y)).toBe(STATION_HEIGHT);
    expect(blockHeight(map, floor.x, floor.y)).toBe(0);
    expect(blockHeight(map, -1, 0)).toBe(0);
  });

  it('boxes the slab, the floor and a bit over the walls', () => {
    const box = levelBox(map);
    expect(box.min).toEqual({ x: -0.5, y: -SLAB_DEPTH, z: -0.5 });
    expect(box.max.x).toBe(map.width - 0.5);
    expect(box.max.z).toBe(map.height - 0.5);
    expect(box.max.y).toBeGreaterThan(WALL_HEIGHT);
  });

  it('picks the station top a view ray hits before the floor behind it', () => {
    const counter = tilesOf(map, 'counter')[0];
    if (!counter) throw new Error('garage changed');
    // A ray coming down from the front: at station height it is over the counter, at the floor one tile behind it.
    const ground = (h: number) => ({ x: counter.x, y: counter.y - (STATION_HEIGHT - h) * 1.5 });
    expect(pickTile(map, ground)).toEqual(counter);
    // Over open floor every height lands on floor tiles.
    const floor = tilesOf(map, 'floor')[5];
    if (!floor) throw new Error('garage changed');
    expect(pickTile(map, () => floor)).toEqual(floor);
  });

  it('turns models built facing the camera toward the way they face', () => {
    expect(facingYaw({ x: 0, y: 1 })).toBe(0);
    expect(facingYaw({ x: 1, y: 0 })).toBeCloseTo(Math.PI / 2);
    expect(Math.abs(facingYaw({ x: 0, y: -1 }))).toBeCloseTo(Math.PI);
  });

  it('puts a ticket on a block top, on the floor, and in front of its carrier', () => {
    const state = createGame(GARAGE, 1, [1]);
    const counter = tilesOf(map, 'counter')[0];
    if (!counter) throw new Error('garage changed');
    const onCounter = placeTicket(view(state), ticket(1, { kind: 'tile', ...counter }));
    expect(onCounter?.pos).toEqual({ x: counter.x, y: STATION_HEIGHT, z: counter.y });

    const player = state.players[0];
    if (!player) throw new Error('no player');
    player.facing = { x: 1, y: 0 };
    const carried = placeTicket(view(state), ticket(2, { kind: 'player', playerId: 1 }));
    expect(carried?.carried).toBe(true);
    expect(carried?.pos.y).toBe(CARRY_HEIGHT);
    expect(carried?.pos.x).toBeGreaterThan(player.pos.x);
    expect(placeTicket(view(state), ticket(3, { kind: 'player', playerId: 9 }))).toBeNull();
  });

  it('stacks queued tickets with the next one on top and hides the rest', () => {
    const state = createGame(GARAGE, 1, [1]);
    const anchor = queueAnchor(map, 'feature');
    if (!anchor) throw new Error('no inbox');
    state.tickets = Array.from({ length: QUEUE_STACK_MAX + 2 }, (_, i) =>
      ticket(i + 1, { kind: 'queue', queue: 'feature' }),
    );
    const placed = state.tickets.map((t) => placeTicket(view(state), t));
    const first = placed[0];
    const second = placed[1];
    if (!first || !second) throw new Error('not placed');
    expect(first.pos.y).toBeGreaterThan(second.pos.y);
    expect(placed.map((p) => p?.visible)).toEqual([true, true, true, true, false, false]);
  });

  it('picks a wall from a point high on its front face, seen through the real camera', () => {
    const pose = fitCamera3d(
      levelBox(map),
      { width: 1440, height: 810 },
      {
        top: 120,
        right: 32,
        bottom: 80,
        left: 32,
      },
    );
    const wall = tilesOf(map, 'wall').find(
      (t) => t.y === 0 && blockHeight(map, t.x, t.y + 1) === 0,
    );
    if (!wall) throw new Error('garage changed');
    for (const h of [0.2, 0.6, WALL_HEIGHT - 0.05]) {
      // On the wall's face toward the camera.
      const s = projectPoint(pose, { x: wall.x, y: h, z: wall.y + 0.49 });
      expect(pickTile(map, (height) => screenToGround(pose, s.x, s.y, height))).toEqual(wall);
    }
    // And the floor in front of it.
    const s = projectPoint(pose, { x: wall.x, y: 0, z: wall.y + 1 });
    expect(pickTile(map, (height) => screenToGround(pose, s.x, s.y, height))).toEqual({
      x: wall.x,
      y: wall.y + 1,
    });
  });

  it('turns stations toward the floor they are worked from, the camera side first', () => {
    const m = parseLevelMap(['#####', '#K1T#', '#2#3#', '#P4.#', '#####'].join('\n'));
    expect(stationFacing(m, 1, 1)).toEqual({ x: 0, y: 1 });
    expect(stationFacing(m, 1, 3)).toEqual({ x: 1, y: 0 });
  });

  it('never turns a station away from the camera', () => {
    const m = parseLevelMap(['#####', '#1234', '##K##', '#####'].join('\n'));
    expect(stationFacing(m, 2, 2)).toEqual({ x: 0, y: 1 });
  });

  it('moves a hero prop with its station but turns it at most 45° from the camera', () => {
    const side = heroPlacement(Math.PI / 2, [0, -0.3]);
    // A station facing +x has its back toward -x.
    expect(side.dx).toBeCloseTo(-0.3);
    expect(side.dz).toBeCloseTo(0);
    expect(side.yaw).toBeCloseTo(Math.PI / 4);
    expect(heroPlacement(0, [0.2, -0.3])).toEqual({ dx: 0.2, dz: -0.3, yaw: 0 });
  });
});
