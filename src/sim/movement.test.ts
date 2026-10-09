import { describe, expect, it } from 'vitest';
import garage from '../../maps/level-01-garage.txt?raw';
import {
  PLAYER_ACCEL,
  PLAYER_DECEL,
  PLAYER_MAX_SPEED,
  PLAYER_RADIUS,
  TICKS_PER_SECOND,
} from './balance';
import { type LevelMap, parseLevelMap } from './level';
import { clampMove, maxPenetration, stepPlayer } from './movement';
import * as rng from './rng';
import type { Player, Vec } from './state';

/** Wraps rows in a wall border, with the four spawns on an extra bottom row. */
function level(...rows: string[]): LevelMap {
  const width = rows[0]?.length ?? 0;
  const spawnRow = '1234'.padEnd(width, '.');
  const wall = '#'.repeat(width + 2);
  return parseLevelMap([wall, ...[...rows, spawnRow].map((r) => `#${r}#`), wall].join('\n'));
}

const OPEN = level(...Array.from({ length: 9 }, () => '.'.repeat(30)));

function player(x: number, y: number): Player {
  return { id: 1, pos: { x, y }, vel: { x: 0, y: 0 }, facing: { x: 0, y: 1 } };
}

function run(map: LevelMap, p: Player, move: Vec, ticks: number): void {
  for (let i = 0; i < ticks; i++) stepPlayer(map, p, move);
}

function speed(p: Player): number {
  return Math.hypot(p.vel.x, p.vel.y);
}

describe('stepPlayer: steering', () => {
  it('reaches max speed within the expected ticks', () => {
    const p = player(2, 5);
    const ticksToMax = Math.ceil((PLAYER_MAX_SPEED / PLAYER_ACCEL) * TICKS_PER_SECOND);
    run(OPEN, p, { x: 1, y: 0 }, ticksToMax - 1);
    expect(speed(p)).toBeLessThan(PLAYER_MAX_SPEED);
    run(OPEN, p, { x: 1, y: 0 }, 1);
    expect(speed(p)).toBeCloseTo(PLAYER_MAX_SPEED);
    run(OPEN, p, { x: 1, y: 0 }, 10);
    expect(speed(p)).toBeCloseTo(PLAYER_MAX_SPEED);
  });

  it('stops faster than it starts when input is released', () => {
    const p = player(2, 5);
    run(OPEN, p, { x: 1, y: 0 }, 20);
    const ticksToStop = Math.ceil((PLAYER_MAX_SPEED / PLAYER_DECEL) * TICKS_PER_SECOND);
    run(OPEN, p, { x: 0, y: 0 }, ticksToStop);
    expect(speed(p)).toBe(0);
    expect(PLAYER_DECEL).toBeGreaterThan(PLAYER_ACCEL);
  });

  it('scales speed with partial (analog) input', () => {
    const p = player(2, 5);
    run(OPEN, p, { x: 0.5, y: 0 }, 30);
    expect(speed(p)).toBeCloseTo(PLAYER_MAX_SPEED / 2);
  });

  it('is not faster diagonally than straight', () => {
    const straight = player(5, 5);
    const diagonal = player(5, 3);
    run(OPEN, straight, { x: 1, y: 0 }, 30);
    run(OPEN, diagonal, { x: 1, y: 1 }, 30);
    expect(speed(diagonal)).toBeCloseTo(speed(straight));
    expect(Math.hypot(diagonal.pos.x - 5, diagonal.pos.y - 3)).toBeCloseTo(straight.pos.x - 5);
  });

  it('clamps input longer than 1', () => {
    expect(clampMove({ x: 3, y: 4 })).toEqual({ x: 0.6, y: 0.8 });
    expect(clampMove({ x: 0.3, y: 0 })).toEqual({ x: 0.3, y: 0 });
  });

  it('faces along the last non-zero input', () => {
    const p = player(5, 5);
    run(OPEN, p, { x: -1, y: 1 }, 3);
    expect(p.facing.x).toBeCloseTo(-Math.SQRT1_2);
    expect(p.facing.y).toBeCloseTo(Math.SQRT1_2);
    run(OPEN, p, { x: 0, y: 0 }, 10);
    expect(p.facing.x).toBeCloseTo(-Math.SQRT1_2);
    expect(p.facing.y).toBeCloseTo(Math.SQRT1_2);
  });
});

describe('stepPlayer: collision', () => {
  it('stops against a wall at exactly the radius', () => {
    const p = player(3, 5);
    run(OPEN, p, { x: -1, y: 0 }, 60);
    expect(p.pos.x).toBeCloseTo(0.5 + PLAYER_RADIUS);
    expect(p.pos.y).toBe(5);
    expect(p.vel.x).toBeCloseTo(0);
  });

  it('never ends up inside a solid tile over many random inputs', () => {
    const map = parseLevelMap(garage);
    const spawn = map.spawns[0] as Vec;
    const p = player(spawn.x, spawn.y);
    let state = rng.createRng(1234);
    let move: Vec = { x: 0, y: 0 };
    let hold = 0;
    let deepest = 0;
    for (let i = 0; i < 20_000; i++) {
      if (hold-- <= 0) {
        let r: number;
        [r, state] = rng.next(state);
        const angle = r * Math.PI * 2;
        [r, state] = rng.next(state);
        const strength = r < 0.2 ? 0 : r < 0.6 ? 1 : r;
        move = { x: Math.cos(angle) * strength, y: Math.sin(angle) * strength };
        [hold, state] = rng.int(state, 1, 40);
      }
      stepPlayer(map, p, move);
      deepest = Math.max(deepest, maxPenetration(map, p.pos));
    }
    expect(deepest).toBeLessThan(1e-9);
  });

  it('slides along a wall under diagonal input', () => {
    const p = player(3, 1);
    run(OPEN, p, { x: 1, y: -1 }, 30);
    expect(p.pos.y).toBeCloseTo(0.5 + PLAYER_RADIUS);
    expect(p.pos.x).toBeGreaterThan(4.5);
    // Sliding keeps the along-wall part of the input's speed.
    expect(p.vel.x).toBeCloseTo(PLAYER_MAX_SPEED * Math.SQRT1_2);
  });

  it('slides around a corner it only just clips instead of sticking', () => {
    // Row 1 is open to the right; row 2 is blocked from column 3 on.
    const map = level(
      '.......', //
      '..#####',
      '.......',
    );
    // The circle hangs 0.25 into row 2, so it clips the corner of (3, 2). Plain
    // circle-vs-box sliding gets around this too, but too slowly to feel right.
    const p = player(1, 1.4);
    run(map, p, { x: 1, y: 0 }, 60);
    expect(p.pos.x).toBeGreaterThan(5);
    expect(p.pos.y).toBeLessThanOrEqual(1 + 0.5 - PLAYER_RADIUS + 1e-9);
  });

  it('slides around a corner when moving vertically too', () => {
    // Column 1 is open downward; column 2 is blocked from row 3 on.
    const map = level(
      '....', //
      '....',
      '.#..',
      '.#..',
      '.#..',
      '.#..',
    );
    // The circle hangs 0.25 into column 2, so it clips the corner of (2, 3).
    const p = player(1.4, 1);
    run(map, p, { x: 0, y: 1 }, 60);
    expect(p.pos.y).toBeGreaterThan(5);
    expect(p.pos.x).toBeLessThanOrEqual(1 + 0.5 - PLAYER_RADIUS + 1e-9);
  });

  it('still stops when walking squarely into a corner', () => {
    const map = level(
      '.......', //
      '..#####',
      '.......',
    );
    // Center in row 2: far too much overlap to nudge around.
    const p = player(1, 1.9);
    run(map, p, { x: 1, y: 0 }, 60);
    expect(p.pos.x).toBeLessThan(2.5);
  });
});
