import { describe, expect, it } from 'vitest';
import garage from '../../maps/level-01-garage.txt?raw';
import {
  DIAGONAL_FACING_GRACE_TICKS,
  DASH_COOLDOWN_TICKS,
  DASH_SPEED,
  DASH_TICKS,
  PLAYER_ACCEL,
  PLAYER_DECEL,
  PLAYER_MAX_SPEED,
  PLAYER_RADIUS,
  TICKS_PER_SECOND,
} from './balance';
import { type LevelMap, parseLevelMap } from './level';
import {
  clampMove,
  isDashing,
  maxPenetration,
  movePlayer,
  startDash,
  stepPlayer,
} from './movement';
import * as rng from './rng';
import { type Player, type Vec, newPlayer } from './state';

/** Wraps rows in a wall border, with the four spawns on an extra bottom row. */
function level(...rows: string[]): LevelMap {
  const width = rows[0]?.length ?? 0;
  const spawnRow = '1234'.padEnd(width, '.');
  const wall = '#'.repeat(width + 2);
  return parseLevelMap([wall, ...[...rows, spawnRow].map((r) => `#${r}#`), wall].join('\n'));
}

const OPEN = level(...Array.from({ length: 9 }, () => '.'.repeat(30)));

function player(x: number, y: number): Player {
  return newPlayer(1, { x, y });
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

  it('walks a diagonal at a steady speed and facing, every tick, like a straight line', () => {
    // Keyboard diagonals arrive as unit vectors from `toWorldMove`.
    for (const move of [
      { x: Math.SQRT1_2, y: Math.SQRT1_2 },
      { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
      { x: 1, y: 0 },
    ]) {
      const p = player(15, 5);
      run(OPEN, p, move, 15);
      let last = { ...p.pos };
      for (let i = 0; i < 40; i++) {
        stepPlayer(OPEN, p, move);
        const moved = Math.hypot(p.pos.x - last.x, p.pos.y - last.y) * TICKS_PER_SECOND;
        expect(moved).toBeCloseTo(PLAYER_MAX_SPEED, 9);
        expect(speed(p)).toBeCloseTo(PLAYER_MAX_SPEED, 9);
        expect(p.facing.x).toBeCloseTo(move.x, 9);
        expect(p.facing.y).toBeCloseTo(move.y, 9);
        last = { ...p.pos };
      }
    }
  });

  it('keeps a diagonal facing when two keys are let go a few ticks apart', () => {
    const diagonal = { x: Math.SQRT1_2, y: -Math.SQRT1_2 };
    const p = player(15, 5);
    run(OPEN, p, diagonal, 10);
    run(OPEN, p, { x: 1, y: 0 }, DIAGONAL_FACING_GRACE_TICKS);
    run(OPEN, p, { x: 0, y: 0 }, 10);
    expect(p.facing.x).toBeCloseTo(Math.SQRT1_2);
    expect(p.facing.y).toBeCloseTo(-Math.SQRT1_2);
  });

  it('turns to one direction held on past the grace, or away from the diagonal at once', () => {
    const diagonal = { x: Math.SQRT1_2, y: -Math.SQRT1_2 };
    const held = player(15, 5);
    run(OPEN, held, diagonal, 10);
    run(OPEN, held, { x: 1, y: 0 }, DIAGONAL_FACING_GRACE_TICKS + 1);
    expect(held.facing).toEqual({ x: 1, y: 0 });

    const reversed = player(15, 5);
    run(OPEN, reversed, diagonal, 10);
    run(OPEN, reversed, { x: -1, y: 0 }, 1);
    expect(reversed.facing).toEqual({ x: -1, y: 0 });

    // A new walk after standing still faces where it goes from its first tick.
    const restarted = player(15, 5);
    run(OPEN, restarted, diagonal, 10);
    run(OPEN, restarted, { x: 0, y: 0 }, 1);
    run(OPEN, restarted, { x: 0, y: -1 }, 1);
    expect(restarted.facing).toEqual({ x: 0, y: -1 });
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
    // ...at a steady speed and facing while it slides, not flickering tick to tick
    // (crossing the seam between two wall tiles nudges it by about a pixel).
    run(OPEN, p, { x: 1, y: -1 }, 30);
    for (let i = 0; i < 40; i++) {
      const x = p.pos.x;
      stepPlayer(OPEN, p, { x: 1, y: -1 });
      const moved = (p.pos.x - x) * TICKS_PER_SECOND;
      expect(Math.abs(moved / (PLAYER_MAX_SPEED * Math.SQRT1_2) - 1)).toBeLessThan(0.03);
      expect(p.pos.y).toBeCloseTo(0.5 + PLAYER_RADIUS, 9);
      expect(p.facing.x).toBeCloseTo(Math.SQRT1_2, 9);
      expect(p.facing.y).toBeCloseTo(-Math.SQRT1_2, 9);
    }
  });

  it('picks its speed back up within a few ticks after a diagonal grazes a counter corner', () => {
    const map = level(
      '..........',
      '..........',
      '..........',
      '....CCCC..',
      '..........',
      '..........',
      '..........',
    );
    const slide = PLAYER_MAX_SPEED * Math.SQRT1_2;
    for (const x of [1.4, 1.6]) {
      const p = player(x, 7.5);
      const speeds: number[] = [];
      for (let i = 0; i < 60; i++) {
        stepPlayer(map, p, { x: Math.SQRT1_2, y: -Math.SQRT1_2 });
        speeds.push(speed(p));
      }
      // The corner takes some speed; it's back to the along-wall speed in a few ticks.
      const slow = speeds.filter((s, i) => i > 10 && s < slide - 0.05).length;
      expect(slow).toBeGreaterThan(0);
      expect(slow).toBeLessThanOrEqual(5);
    }
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

describe('dash', () => {
  it('shoots along the move direction at dash speed for its duration', () => {
    const p = player(2, 5);
    expect(startDash(p, { x: 1, y: 0 })).toBe(true);
    run(OPEN, p, { x: 1, y: 0 }, DASH_TICKS);
    expect(p.vel.x).toBeCloseTo(DASH_SPEED);
    expect(p.pos.x).toBeCloseTo(2 + (DASH_SPEED * DASH_TICKS) / TICKS_PER_SECOND);
    expect(isDashing(p)).toBe(false);
  });

  it('dashes along the facing direction without input, and ignores steering meanwhile', () => {
    const p = player(10, 5);
    p.facing = { x: -1, y: 0 };
    startDash(p, { x: 0, y: 0 });
    run(OPEN, p, { x: 0, y: 1 }, DASH_TICKS);
    expect(p.pos.x).toBeLessThan(9);
    expect(p.pos.y).toBeCloseTo(5);
  });

  it('slows back down to walking speed afterwards', () => {
    const p = player(2, 5);
    startDash(p, { x: 1, y: 0 });
    run(OPEN, p, { x: 1, y: 0 }, DASH_TICKS + TICKS_PER_SECOND);
    expect(speed(p)).toBeCloseTo(PLAYER_MAX_SPEED);
  });

  it('cools down before the next dash', () => {
    const p = player(2, 5);
    startDash(p, { x: 1, y: 0 });
    run(OPEN, p, { x: 0, y: 0 }, DASH_COOLDOWN_TICKS - 1);
    expect(startDash(p, { x: 1, y: 0 })).toBe(false);
    run(OPEN, p, { x: 0, y: 0 }, 1);
    expect(startDash(p, { x: 1, y: 0 })).toBe(true);
  });

  it('stops at walls', () => {
    const p = player(29, 5);
    startDash(p, { x: 1, y: 0 });
    run(OPEN, p, { x: 1, y: 0 }, DASH_TICKS);
    expect(maxPenetration(OPEN, p.pos)).toBeLessThan(1e-6);
  });
});

describe('movePlayer', () => {
  it('dashes only on the press, then steps like stepPlayer', () => {
    const a = player(5, 5);
    const b = player(5, 5);
    expect(movePlayer(OPEN, a, { x: 1, y: 0 }, true)).toBe(true);
    startDash(b, { x: 1, y: 0 });
    stepPlayer(OPEN, b, { x: 1, y: 0 });
    expect(a).toEqual({ ...b, dashHeld: true });
    // Held: no new dash, even once the cooldown is over.
    for (let i = 0; i < DASH_COOLDOWN_TICKS + 1; i++) {
      expect(movePlayer(OPEN, a, { x: 1, y: 0 }, true)).toBe(false);
    }
    expect(movePlayer(OPEN, a, { x: 1, y: 0 }, false)).toBe(false);
    expect(movePlayer(OPEN, a, { x: 1, y: 0 }, true)).toBe(true);
  });

  it('stands still without input', () => {
    const p = player(5, 5);
    movePlayer(OPEN, p);
    expect(p.pos).toEqual({ x: 5, y: 5 });
    expect(p.dashHeld).toBe(false);
  });
});
