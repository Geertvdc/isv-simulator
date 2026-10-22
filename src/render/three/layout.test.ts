import { describe, expect, it } from 'vitest';
import { GARAGE } from '../../sim/levels';
import { type GameState, createGame } from '../../sim/state';
import type { Ticket } from '../../sim/tickets';
import type { RoundView } from '../roundView';
import {
  CARRY_HEIGHT,
  FRONT_WALL_HEIGHT,
  QUEUE_STACK_MAX,
  STATION_HEIGHT,
  WALL_HEIGHT,
  blockHeight,
  facingYaw,
  levelBox,
  placeTicket,
  queueAnchor,
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
  return { id, kind: 'feature', title: 'x', steps: [], location } as unknown as Ticket;
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

  it('boxes the whole floor up to the walls', () => {
    expect(levelBox(map)).toEqual({
      min: { x: -0.5, y: 0, z: -0.5 },
      max: { x: map.width - 0.5, y: WALL_HEIGHT, z: map.height - 0.5 },
    });
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
});
