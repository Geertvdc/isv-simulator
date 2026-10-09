import { describe, expect, it } from 'vitest';
import garage from '../../maps/level-01-garage.txt?raw';
import { MAX_TICKS_PER_FRAME, TICKS_PER_SECOND } from '../sim/balance';
import { parseLevelMap } from '../sim/level';
import { type InputCommand, createGame } from '../sim/state';
import { GameLoop } from './GameLoop';

const TICK_MS = 1000 / TICKS_PER_SECOND;

function newLoop(): GameLoop {
  return new GameLoop(createGame(parseLevelMap(garage), 1, [1]));
}

const right = (tick: number): InputCommand[] => [
  { playerId: 1, tick, move: { x: 1, y: 0 }, interact: false, work: false },
];

describe('GameLoop', () => {
  it('runs one tick per tick of real time, carrying over the remainder', () => {
    const loop = newLoop();
    expect(loop.advance(TICK_MS * 0.6, right)).toBe(0);
    expect(loop.advance(TICK_MS * 0.6, right)).toBe(1);
    expect(loop.alpha).toBeCloseTo(0.2);
    expect(loop.advance(TICK_MS * 2, right)).toBe(2);
    expect(loop.state.tick).toBe(3);
  });

  it('passes the tick each input is for', () => {
    const loop = newLoop();
    const seen: number[] = [];
    loop.advance(TICK_MS * 3, (tick) => {
      seen.push(tick);
      return [];
    });
    expect(seen).toEqual([0, 1, 2]);
  });

  it('caps ticks per frame after a long stall', () => {
    const loop = newLoop();
    expect(loop.advance(10_000, right)).toBe(MAX_TICKS_PER_FRAME);
    // The backlog is dropped, not caught up on later.
    expect(loop.advance(0, right)).toBeLessThanOrEqual(1);
  });

  it('interpolates the render position between the last two ticks', () => {
    const loop = newLoop();
    const player = loop.state.players[0];
    if (!player) throw new Error('no player');
    loop.advance(TICK_MS * 5, right);
    const before = { ...player.pos };
    loop.advance(TICK_MS * 1.5, right);
    const after = player.pos;
    const pos = loop.renderPos(1);
    expect(pos?.x).toBeCloseTo(before.x + (after.x - before.x) * 0.5);
    expect(loop.renderPos(99)).toBeUndefined();
  });
});
