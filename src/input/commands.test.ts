import { describe, expect, it } from 'vitest';
import { screenDirToGrid } from '../render/projection';
import { type PlayerBinding, buildInputCommands, toWorldMove } from './commands';
import type { ControllerState } from './controller';

function state(move = { x: 0, y: 0 }, extra: Partial<ControllerState> = {}): ControllerState {
  return { move, interact: false, work: false, dash: false, join: false, menu: false, ...extra };
}

const BINDINGS: PlayerBinding[] = [
  { playerId: 1, deviceId: 'kb-left' },
  { playerId: 2, deviceId: 'pad-0' },
  { playerId: 3, deviceId: 'kb-right' },
];

describe('toWorldMove', () => {
  it('turns screen up into the world direction that walks up on screen', () => {
    expect(toWorldMove({ x: 0, y: -1 })).toEqual(screenDirToGrid({ x: 0, y: -1 }));
  });

  it('caps diagonals at full speed and keeps analog strength', () => {
    const diag = toWorldMove({ x: 1, y: 1 });
    expect(Math.hypot(diag.x, diag.y)).toBeCloseTo(1);
    const half = toWorldMove({ x: 0.5, y: 0 });
    expect(Math.hypot(half.x, half.y)).toBeCloseTo(0.5);
  });

  it('leaves no input as no input', () => {
    expect(toWorldMove({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe('buildInputCommands', () => {
  it('makes one command per joined player, tagged with player id and tick', () => {
    const readings = new Map([
      ['kb-left', state({ x: 1, y: 0 })],
      ['pad-0', state({ x: 0, y: 1 }, { interact: true })],
      ['kb-right', state({ x: 0, y: 0 }, { work: true })],
      ['pad-3', state({ x: 1, y: 0 })],
    ]);
    const cmds = buildInputCommands(BINDINGS, readings, 42);
    expect(cmds.map((c) => c.playerId)).toEqual([1, 2, 3]);
    expect(cmds.every((c) => c.tick === 42)).toBe(true);
    expect(cmds[0]?.move).toEqual(toWorldMove({ x: 1, y: 0 }));
    expect(cmds[1]).toMatchObject({ interact: true, work: false });
    expect(cmds[2]).toMatchObject({ interact: false, work: true, move: { x: 0, y: 0 } });
  });

  it('keeps a player whose device is gone, standing still', () => {
    const cmds = buildInputCommands(BINDINGS, new Map([['kb-left', state({ x: 1, y: 0 })]]), 7);
    expect(cmds).toHaveLength(3);
    expect(cmds[1]).toEqual({
      playerId: 2,
      tick: 7,
      move: { x: 0, y: 0 },
      interact: false,
      work: false,
      dash: false,
    });
  });
});
