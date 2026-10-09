import { describe, expect, it } from 'vitest';
import { PLAYER_RADIUS } from './balance';
import { type LevelMap, parseLevelMap } from './level';
import { maxPenetration, stepPlayer } from './movement';
import { separatePlayers } from './push';
import type { Player, Vec } from './state';

/** Wraps rows in a wall border, with the four spawns on an extra bottom row. */
function level(...rows: string[]): LevelMap {
  const width = rows[0]?.length ?? 0;
  const spawnRow = '1234'.padEnd(width, '.');
  const wall = '#'.repeat(width + 2);
  return parseLevelMap([wall, ...[...rows, spawnRow].map((r) => `#${r}#`), wall].join('\n'));
}

const OPEN = level(...Array.from({ length: 9 }, () => '.'.repeat(20)));
const MIN_DIST = PLAYER_RADIUS * 2;

function player(id: number, x: number, y: number): Player {
  return { id, pos: { x, y }, vel: { x: 0, y: 0 }, facing: { x: 0, y: 1 } };
}

/** One sim tick for these players: everyone moves, then they push each other apart. */
function step(map: LevelMap, players: Player[], moves: Vec[]): void {
  players.forEach((p, i) => {
    stepPlayer(map, p, moves[i] ?? { x: 0, y: 0 });
  });
  separatePlayers(map, players);
}

function dist(a: Player, b: Player): number {
  return Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
}

describe('separatePlayers', () => {
  it('leaves players that do not touch alone', () => {
    const a = player(1, 3, 3);
    const b = player(2, 3 + MIN_DIST + 0.01, 3);
    separatePlayers(OPEN, [a, b]);
    expect(a.pos).toEqual({ x: 3, y: 3 });
    expect(b.pos).toEqual({ x: 3 + MIN_DIST + 0.01, y: 3 });
  });

  it('pushes overlapping players apart softly, both by the same amount', () => {
    const a = player(1, 3, 3);
    const b = player(2, 3.4, 3);
    separatePlayers(OPEN, [a, b]);
    const d = dist(a, b);
    expect(d).toBeGreaterThan(0.4);
    expect(d).toBeLessThan(MIN_DIST);
    expect(3 - a.pos.x).toBeCloseTo(b.pos.x - 3.4);
  });

  it('splits players standing exactly on top of each other', () => {
    const a = player(1, 3, 3);
    const b = player(2, 3, 3);
    for (let i = 0; i < 30; i++) separatePlayers(OPEN, [a, b]);
    expect(dist(a, b)).toBeGreaterThan(MIN_DIST - 1e-3);
  });

  it('separates two players walking into each other once they let go', () => {
    const a = player(1, 3, 3);
    const b = player(2, 8, 3);
    const players = [a, b];
    for (let i = 0; i < 90; i++) {
      step(OPEN, players, [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
      ]);
      // Soft, but they never sink deep into each other.
      expect(dist(a, b)).toBeGreaterThan(MIN_DIST * 0.6);
    }
    expect(a.pos.x).toBeLessThan(b.pos.x);
    for (let i = 0; i < 60; i++) step(OPEN, players, []);
    expect(dist(a, b)).toBeGreaterThan(MIN_DIST - 1e-3);
  });

  it('lets a walking player shove a standing one along', () => {
    const a = player(1, 3, 3);
    const b = player(2, 5, 3);
    for (let i = 0; i < 90; i++) step(OPEN, [a, b], [{ x: 1, y: 0 }]);
    expect(b.pos.x).toBeGreaterThan(6);
    expect(b.pos.y).toBeCloseTo(3);
  });

  it('never pushes anyone into a wall', () => {
    // Shove player 2 into the right wall, then into a corner.
    const a = player(1, 15, 5);
    const b = player(2, 18, 5);
    const players = [a, b];
    for (const move of [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ]) {
      for (let i = 0; i < 120; i++) {
        step(OPEN, players, [move]);
        for (const p of players) expect(maxPenetration(OPEN, p.pos)).toBeLessThan(1e-6);
      }
    }
  });

  it('never pushes anyone into a wall when stacked against it', () => {
    const a = player(1, 1, 1);
    const b = player(2, 1, 1);
    for (let i = 0; i < 60; i++) {
      separatePlayers(OPEN, [a, b]);
      for (const p of [a, b]) expect(maxPenetration(OPEN, p.pos)).toBeLessThan(1e-6);
    }
    expect(dist(a, b)).toBeGreaterThan(MIN_DIST - 1e-3);
  });

  it('handles four players crowding the same spot', () => {
    const players = [1, 2, 3, 4].map((id) => player(id, 10 + id * 0.01, 5));
    const center = { x: 10, y: 5 };
    for (let i = 0; i < 120; i++) {
      step(
        OPEN,
        players,
        players.map((p) => ({ x: center.x - p.pos.x, y: center.y - p.pos.y })),
      );
    }
    for (let i = 0; i < 120; i++) step(OPEN, players, []);
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const a = players[i];
        const b = players[j];
        if (a && b) expect(dist(a, b)).toBeGreaterThan(MIN_DIST - 1e-2);
      }
    }
  });
});
